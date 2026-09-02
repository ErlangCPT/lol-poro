import {
  analyzeLobby,
  roleFromLaneAndRole,
  roleFromPosition,
  type ChampionInfo,
  type LobbyInput,
  type LobbyPlayerInput,
  type Role,
  type TeamSide,
  type Visibility,
} from '@poro/core';
import {
  getChampSelectSession,
  getGame,
  getGameflowSession,
  getMatchHistory,
  type GameflowPhase,
  type LcuChampSelectSession,
  type LcuGame,
  type LcuGameflowSession,
} from '@poro/lcu';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppSettings, LobbySnapshot, LobbySource } from '@shared/ipc';
import type { Logger } from '../logger';
import type { PlayerBundle, PlayerDataService } from './player-data';

interface PendingPlayer {
  cellId: number;
  team: TeamSide;
  visibility: Visibility;
  puuid?: string;
  displayName?: string;
  championId: number;
  assignedPosition?: Role;
  spells: [number, number];
}

interface PendingLobby {
  source: LobbySource;
  queueId: number;
  gameId: number;
  bans: { ally: number[]; enemy: number[] };
  players: PendingPlayer[];
  timer?: { phase: string; timeLeftMs: number; receivedAt: number };
  raw: unknown;
}

export interface LobbyServiceDeps {
  playerData: PlayerDataService;
  championInfo: (id: number) => ChampionInfo | undefined;
  getSettings: () => AppSettings;
  getClient: () => import('@poro/lcu').LcuClient | null;
  getLocalPuuid: () => string | undefined;
  /** display name from the local pro list for a lobby member */
  getPro?: (
    puuid: string | undefined,
    gameName: string | undefined,
    tagLine: string | undefined,
  ) => string | undefined;
  publish: (snapshot: LobbySnapshot) => void;
  recordingsDir: string;
  log: Logger;
}

const EMPTY: LobbySnapshot = { source: 'none', queueId: 0, gameId: 0, updatedAt: 0, loadingPlayers: 0 };

/**
 * Turns LCU gameflow / champ select data into a LobbySnapshot with analysis.
 * Player data is fetched once per PUUID per game; the analysis is recomputed when picks change.
 */
export class LobbyService {
  private snapshot: LobbySnapshot = EMPTY;
  private pending: PendingLobby | null = null;
  private bundles = new Map<string, PlayerBundle>();
  private inflight = new Map<string, Promise<void>>();
  private signature = '';
  private debounce: NodeJS.Timeout | null = null;
  private lastBans: { gameId: number; bans: PendingLobby['bans'] } | null = null;
  private phase: GameflowPhase | 'Unknown' = 'Unknown';
  /** A post-game review stays visible until the next champion select or an explicit reset. */
  private replayActive = false;

  constructor(private readonly deps: LobbyServiceDeps) {}

  get current(): LobbySnapshot {
    return this.snapshot;
  }

  getBundle(puuid: string): PlayerBundle | undefined {
    return this.bundles.get(puuid);
  }

  isLoading(puuid: string): boolean {
    return this.inflight.has(puuid);
  }

  reset(message?: string): void {
    this.deps.log.info('lobby reset', message ?? `phase ${this.phase}`);
    this.replayActive = false;
    this.pending = null;
    this.bundles.clear();
    this.inflight.clear();
    this.signature = '';
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = null;
    this.snapshot = { ...EMPTY, updatedAt: Date.now(), message };
    this.deps.publish(this.snapshot);
  }

  /** Re-runs the analysis with current settings (e.g. after toggling "ranked only"). */
  recompute(): void {
    if (this.pending) this.publishAnalysis();
  }

  /** Re-reads the current LCU state and rebuilds the lobby. */
  async refresh(): Promise<void> {
    this.bundles.clear();
    this.signature = '';
    await this.handlePhase(this.phase === 'Unknown' ? 'None' : this.phase, true);
  }

  async handlePhase(phase: GameflowPhase, force = false): Promise<void> {
    const previous = this.phase;
    this.phase = phase;
    const client = this.deps.getClient();
    switch (phase) {
      case 'ChampSelect': {
        if (!client) return;
        const session = await getChampSelectSession(client).catch(() => undefined);
        if (session) this.handleChampSelectSession(session);
        return;
      }
      case 'GameStart':
      case 'InProgress':
      case 'Reconnect': {
        if (!client) return;
        const session = await getGameflowSession(client).catch(() => undefined);
        if (session) this.handleGameflowSession(session, force);
        return;
      }
      case 'WaitingForStats':
      case 'PreEndOfGame':
      case 'EndOfGame':
        // keep the last analysis visible after the game
        return;
      default:
        if (this.replayActive && !force) return;
        if (previous !== phase || force) this.reset();
    }
  }

  /**
   * Post-game review: analyses the ten players of the local player's most recent game as if it were
   * a loading screen. Also the easiest way to test the whole pipeline with real data.
   */
  async replayLastGame(): Promise<string | undefined> {
    const client = this.deps.getClient();
    const localPuuid = this.deps.getLocalPuuid();
    if (!client || !localPuuid) return 'League Client nicht verbunden';
    const list = await getMatchHistory(client, localPuuid, 0, 4);
    const games = list.games?.games ?? [];
    const last = games.find((g) => g.participants.length > 0 && (g.gameDuration ?? 0) >= 300) ?? games[0];
    if (!last) return 'Keine Spiele in der Match-History';
    const full = await getGame(client, last.gameId);
    const pending = this.buildFromGame(full, localPuuid);
    if (pending.players.length === 0) return 'Spiel enthält keine Teilnehmer';
    this.deps.log.info('replay last game', last.gameId, `${pending.players.length} players`);
    this.bundles.clear();
    this.signature = '';
    this.replayActive = true;
    this.schedule(pending);
    return undefined;
  }

  private buildFromGame(game: LcuGame, localPuuid: string): PendingLobby {
    const byId = new Map(game.participantIdentities.map((i) => [i.participantId, i.player]));
    const local = game.participants.find((p) => byId.get(p.participantId)?.puuid === localPuuid);
    const allyTeamId = local?.teamId ?? 100;
    const players: PendingPlayer[] = game.participants.map((p, i) => {
      const player = byId.get(p.participantId);
      const puuid = player?.puuid || undefined;
      const spells: [number, number] = [p.spell1Id || 0, p.spell2Id || 0];
      const role = roleFromLaneAndRole(p.timeline?.lane, p.timeline?.role, spells);
      return {
        cellId: i,
        team: p.teamId === allyTeamId ? 'ally' : 'enemy',
        visibility: puuid === localPuuid ? 'self' : puuid ? 'visible' : 'hidden',
        puuid,
        displayName: player?.gameName ? `${player.gameName}#${player.tagLine ?? ''}` : player?.summonerName,
        championId: p.championId,
        assignedPosition: role !== 'UNKNOWN' ? role : undefined,
        spells,
      };
    });
    const bans = { ally: [] as number[], enemy: [] as number[] };
    for (const t of game.teams ?? []) {
      const list = t.teamId === allyTeamId ? bans.ally : bans.enemy;
      for (const b of t.bans ?? []) if (b.championId > 0) list.push(b.championId);
    }
    return { source: 'loading', queueId: game.queueId, gameId: game.gameId, bans, players, raw: game };
  }

  handleChampSelectSession(session: LcuChampSelectSession | undefined): void {
    if (!session || !session.myTeam) return;
    this.replayActive = false;
    const pending = this.buildFromChampSelect(session);
    this.lastBans = { gameId: pending.gameId, bans: pending.bans };
    this.schedule(pending);
  }

  handleGameflowSession(session: LcuGameflowSession | undefined, force = false): void {
    if (!session?.gameData) return;
    if (!['GameStart', 'InProgress', 'Reconnect'].includes(session.phase) && !force) return;
    const pending = this.buildFromGameflow(session);
    if (pending.players.length === 0) return;
    this.replayActive = false;
    this.schedule(pending);
  }

  // ---------- builders ----------

  private buildFromChampSelect(session: LcuChampSelectSession): PendingLobby {
    const players: PendingPlayer[] = [];
    const localCell = session.localPlayerCellId;
    const toPlayer = (p: LcuChampSelectSession['myTeam'][number], team: TeamSide): PendingPlayer => {
      const hasIdentity = !!p.puuid && p.puuid.length > 0 && p.nameVisibilityType !== 'HIDDEN';
      let visibility: Visibility = 'hidden';
      if (p.cellId === localCell) visibility = 'self';
      else if (hasIdentity) visibility = 'visible';
      const name = p.gameName ? `${p.gameName}${p.tagLine ? `#${p.tagLine}` : ''}` : undefined;
      return {
        cellId: p.cellId,
        team,
        visibility,
        puuid: hasIdentity || p.cellId === localCell ? p.puuid || undefined : undefined,
        displayName: name,
        championId: p.championId || p.championPickIntent || 0,
        assignedPosition: p.assignedPosition ? roleFromPosition(p.assignedPosition) : undefined,
        spells: [p.spell1Id || 0, p.spell2Id || 0],
      };
    };
    for (const p of session.myTeam) players.push(toPlayer(p, 'ally'));
    for (const p of session.theirTeam ?? []) players.push(toPlayer(p, 'enemy'));

    const bans = {
      ally: [...(session.bans?.myTeamBans ?? [])],
      enemy: [...(session.bans?.theirTeamBans ?? [])],
    };
    // completed ban actions carry the champion even before the bans object is filled
    for (const group of session.actions ?? []) {
      for (const a of group) {
        if (a.type !== 'ban' || !a.completed || !a.championId) continue;
        const list = a.isAllyAction ? bans.ally : bans.enemy;
        if (!list.includes(a.championId)) list.push(a.championId);
      }
    }
    return {
      source: 'champselect',
      queueId: this.snapshot.queueId || 0,
      gameId: session.gameId ?? 0,
      bans,
      players,
      timer: session.timer
        ? {
            phase: session.timer.phase,
            timeLeftMs: session.timer.adjustedTimeLeftInPhase,
            receivedAt: Date.now(),
          }
        : undefined,
      raw: session,
    };
  }

  private buildFromGameflow(session: LcuGameflowSession): PendingLobby {
    const localPuuid = this.deps.getLocalPuuid();
    const { teamOne, teamTwo, playerChampionSelections, gameId, queue } = session.gameData;
    const inTeamOne = teamOne.some((p) => p.puuid && p.puuid === localPuuid);
    const inTeamTwo = teamTwo.some((p) => p.puuid && p.puuid === localPuuid);
    const allyIsTeamOne = inTeamOne || !inTeamTwo;
    const selections = playerChampionSelections ?? [];
    const players: PendingPlayer[] = [];
    let cell = 0;
    const add = (list: LcuGameflowSession['gameData']['teamOne'], team: TeamSide) => {
      for (const p of list) {
        const sel = selections.find(
          (s) =>
            (s.puuid && s.puuid === p.puuid) ||
            (s.summonerInternalName && s.summonerInternalName === p.summonerInternalName),
        );
        const puuid = p.puuid && p.puuid.length > 0 ? p.puuid : undefined;
        players.push({
          cellId: cell++,
          team,
          visibility: puuid === localPuuid ? 'self' : puuid ? 'visible' : 'hidden',
          puuid,
          displayName: p.summonerName || undefined,
          championId: p.championId || sel?.championId || 0,
          assignedPosition: p.selectedPosition ? roleFromPosition(p.selectedPosition) : undefined,
          spells: [sel?.spell1Id ?? 0, sel?.spell2Id ?? 0],
        });
      }
    };
    add(allyIsTeamOne ? teamOne : teamTwo, 'ally');
    add(allyIsTeamOne ? teamTwo : teamOne, 'enemy');
    const bans =
      this.lastBans && this.lastBans.gameId === gameId ? this.lastBans.bans : { ally: [], enemy: [] };
    return { source: 'loading', queueId: queue?.id ?? 0, gameId, bans, players, raw: session };
  }

  // ---------- scheduling ----------

  private schedule(pending: PendingLobby): void {
    if (pending.gameId && this.pending?.gameId && pending.gameId !== this.pending.gameId) {
      this.bundles.clear();
      this.inflight.clear();
    }
    if (this.pending?.queueId && !pending.queueId) pending.queueId = this.pending.queueId;
    const nextPending = pending;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      this.debounce = null;
      void this.apply(nextPending);
    }, 700);
  }

  private async apply(pending: PendingLobby): Promise<void> {
    const client = this.deps.getClient();
    if (pending.source === 'champselect' && !pending.queueId && client) {
      const gf = await getGameflowSession(client).catch(() => undefined);
      if (gf?.gameData?.queue?.id) pending.queueId = gf.gameData.queue.id;
    }
    const signature = JSON.stringify({
      s: pending.source,
      q: pending.queueId,
      b: pending.bans,
      p: pending.players.map((p) => [
        p.cellId,
        p.team,
        p.puuid ?? '',
        p.championId,
        p.assignedPosition ?? '',
        p.spells,
      ]),
    });
    const changed = signature !== this.signature;
    this.signature = signature;
    this.pending = pending;

    const settings = this.deps.getSettings();
    for (const p of pending.players) {
      if (!p.puuid || this.bundles.has(p.puuid) || this.inflight.has(p.puuid)) continue;
      const puuid = p.puuid;
      // The local player always gets full games: they feed personal runes, builds and matchups.
      const isSelf = p.visibility === 'self';
      const task = this.deps.playerData
        .getBundle(puuid, {
          windowDays: settings.windowDays,
          fetchFullGames: settings.fetchFullGames || isSelf,
          fullGamesPerPlayer: isSelf
            ? Math.max(settings.fullGamesPerPlayer, 40)
            : settings.fullGamesPerPlayer,
          // The client keeps only a short history of the local player; Match-V5 fills the 30-day window.
          useRiotApi: isSelf && settings.riotApiKey.length > 0,
          riotApiMaxGames: 40,
        })
        .then((bundle) => {
          this.bundles.set(puuid, bundle);
        })
        .catch((e: unknown) => {
          this.deps.log.error('player bundle failed', e);
          this.bundles.set(puuid, {
            puuid,
            ranked: [],
            matches: [],
            mastery: [],
            sources: [],
            fetchedAt: Date.now(),
            error: String(e),
          });
        })
        .finally(() => {
          this.inflight.delete(puuid);
          if (this.pending === pending || this.pending?.gameId === pending.gameId) this.publishAnalysis();
        });
      this.inflight.set(puuid, task);
    }
    if (changed || pending.timer) this.publishAnalysis();
    if (settings.recordSessions && changed && this.inflight.size === 0) this.record(pending);
  }

  private publishAnalysis(): void {
    const pending = this.pending;
    if (!pending) return;
    const settings = this.deps.getSettings();
    const players: LobbyPlayerInput[] = pending.players.map((p) => {
      const bundle = p.puuid ? this.bundles.get(p.puuid) : undefined;
      const loading = !!p.puuid && !bundle;
      return {
        cellId: p.cellId,
        team: p.team,
        visibility: p.visibility,
        identity:
          bundle?.identity ??
          (p.puuid ? { puuid: p.puuid, gameName: p.displayName ?? '', tagLine: '' } : undefined),
        championId: p.championId,
        assignedPosition: p.assignedPosition,
        spells: p.spells,
        matches: bundle?.matches,
        ranked: bundle?.ranked,
        mastery: bundle?.mastery,
        error: bundle?.error,
        loading,
        pro: this.deps.getPro?.(
          p.puuid,
          bundle?.identity?.gameName ?? p.displayName,
          bundle?.identity?.tagLine,
        ),
      };
    });
    const input: LobbyInput = {
      queueId: pending.queueId,
      currentGameId: pending.gameId || undefined,
      localPuuid: this.deps.getLocalPuuid(),
      bans: pending.bans,
      players,
      options: { windowDays: settings.windowDays, rankedOnly: settings.rankedOnly },
      championInfo: this.deps.championInfo,
    };
    try {
      const analysis = analyzeLobby(input);
      this.snapshot = {
        source: pending.source,
        queueId: pending.queueId,
        gameId: pending.gameId,
        updatedAt: Date.now(),
        loadingPlayers: players.filter((p) => p.loading).length,
        timer: pending.timer,
        analysis,
      };
    } catch (e) {
      this.deps.log.error('analysis failed', e);
      this.snapshot = {
        ...EMPTY,
        source: pending.source,
        queueId: pending.queueId,
        updatedAt: Date.now(),
        message: String(e),
      };
    }
    this.deps.publish(this.snapshot);
    if (this.deps.getSettings().recordSessions && this.inflight.size === 0) this.record(pending);
  }

  private recorded = new Set<string>();

  private record(pending: PendingLobby): void {
    const key = `${pending.gameId}-${pending.source}-${this.signature.length}`;
    if (this.recorded.has(key)) return;
    this.recorded.add(key);
    try {
      mkdirSync(this.deps.recordingsDir, { recursive: true });
      const file = join(
        this.deps.recordingsDir,
        `${new Date().toISOString().replace(/[:.]/g, '-')}-${pending.source}.json`,
      );
      writeFileSync(
        file,
        JSON.stringify(
          {
            recordedAt: new Date().toISOString(),
            source: pending.source,
            queueId: pending.queueId,
            gameId: pending.gameId,
            localPuuid: this.deps.getLocalPuuid(),
            raw: pending.raw,
            bundles: [...this.bundles.values()],
            snapshot: this.snapshot,
          },
          null,
          2,
        ),
      );
      this.deps.log.info('session recorded', file);
    } catch (e) {
      this.deps.log.warn('recording failed', e);
    }
  }
}
