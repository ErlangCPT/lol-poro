import {
  computeLiveStats,
  computeObjectives,
  jungleTimers,
  recordMilestones,
  toggleJungleMark,
  type JungleMark,
  type LivePlayerInput,
  type LiveTeam,
  type LobbyPlayer,
  type Localized,
  type Milestones,
} from '@poro/core';
import { LivePoller, type LiveAllGameData, type LiveEvent, type LivePlayer } from '@poro/live-client';
import type { StaticData } from '@poro/static-data';
import type { AppSettings, LiveGameSnapshot, LivePlayerView, LiveTeamView, LobbySnapshot } from '@shared/ipc';
import type { Logger } from '../logger';

export interface InGameDeps {
  staticData: StaticData;
  getLobby: () => LobbySnapshot;
  getLocalName: () => { gameName: string; tagLine: string } | undefined;
  getSettings: () => AppSettings;
  /** resolves the LoL window mode when a game connects; null when unknown */
  readWindowMode: () => Promise<'fullscreen' | 'windowed' | 'borderless' | null>;
  publish: (snapshot: LiveGameSnapshot) => void;
  log: Logger;
}

const EMPTY_TEAM: LiveTeamView = {
  kills: 0,
  deaths: 0,
  assists: 0,
  cs: 0,
  itemGold: 0,
  turrets: 0,
  dragons: [],
  grubs: 0,
  heralds: 0,
  barons: 0,
  inhibitors: 0,
};

export const EMPTY_LIVE: LiveGameSnapshot = {
  connected: false,
  demo: false,
  gameTime: 0,
  receivedAt: 0,
  gameMode: '',
  mapNumber: 0,
  objectives: [],
  teams: { ORDER: EMPTY_TEAM, CHAOS: EMPTY_TEAM },
  players: [],
  jungle: [],
  warnings: [],
};

const FULLSCREEN_WARNING: Localized = {
  de: 'League läuft im exklusiven Vollbild: Das Overlay ist dann nicht sichtbar. Stelle in den LoL-Videooptionen "Randlos" ein.',
  en: 'League runs in exclusive fullscreen: the overlay is not visible there. Set "Borderless" in the LoL video options.',
};

function playerKey(p: LivePlayer): string {
  if (p.riotId) return p.riotId;
  if (p.riotIdGameName) return `${p.riotIdGameName}#${p.riotIdTagLine ?? ''}`;
  return p.summonerName;
}

function championKeyOf(p: LivePlayer): string {
  const raw = p.rawChampionName ?? '';
  const idx = raw.lastIndexOf('_');
  return idx >= 0 ? raw.slice(idx + 1) : p.championName.replace(/[^A-Za-z]/g, '');
}

/**
 * Turns Live Client polls into the LiveGameSnapshot shown in the overlay and the main window:
 * objective timers, live stats with 10/20 minute milestones, manual jungle timers.
 */
export class InGameService {
  readonly poller: LivePoller;
  private events: LiveEvent[] = [];
  private milestones: Milestones = {};
  private marks: JungleMark[] = [];
  private snapshot: LiveGameSnapshot = EMPTY_LIVE;
  private warnings: Localized[] = [];
  private lastPlayers: LivePlayer[] = [];
  private unknownEvents = new Set<string>();

  constructor(
    private readonly deps: InGameDeps,
    poller = new LivePoller(),
  ) {
    this.poller = poller;
    poller.on('connected', () => {
      this.deps.log.info('live client connected');
      this.resetGame();
      void this.checkWindowMode();
    });
    poller.on('newgame', () => {
      this.deps.log.info('live client: new game');
      this.resetGame();
    });
    poller.on('error', () => undefined); // connection refused while no game runs
    poller.on('snapshot', (data, fresh) => this.ingest(data, fresh, false));
    poller.on('disconnected', () => {
      this.deps.log.info('live client disconnected');
      this.snapshot = { ...EMPTY_LIVE, receivedAt: Date.now() };
      this.deps.publish(this.snapshot);
    });
  }

  get current(): LiveGameSnapshot {
    return this.snapshot;
  }

  start(): void {
    this.poller.start();
  }

  stop(): void {
    this.poller.stop();
  }

  /** Fast polling while the gameflow phase says a game is running. */
  setActive(active: boolean): void {
    this.poller.setActive(active);
  }

  /** Current game time extrapolated from the last poll. */
  gameTimeNow(): number {
    if (!this.snapshot.connected) return 0;
    return this.snapshot.gameTime + (Date.now() - this.snapshot.receivedAt) / 1000;
  }

  markJungle(side: LiveTeam, campId: string): void {
    this.marks = toggleJungleMark(this.marks, side, campId, this.gameTimeNow());
    this.snapshot = { ...this.snapshot, jungle: jungleTimers(this.marks, this.gameTimeNow()) };
    this.deps.publish(this.snapshot);
  }

  clearJungle(): void {
    this.marks = [];
    this.snapshot = { ...this.snapshot, jungle: [] };
    this.deps.publish(this.snapshot);
  }

  /** Re-publishes with current settings / lobby data (e.g. after the lobby analysis finished loading). */
  recompute(): void {
    if (this.snapshot.connected && this.lastData) this.ingest(this.lastData, [], this.snapshot.demo);
  }

  private lastData: LiveAllGameData | null = null;

  private resetGame(): void {
    this.events = [];
    this.milestones = {};
    this.marks = [];
    this.warnings = [];
    this.lastData = null;
  }

  private async checkWindowMode(): Promise<void> {
    try {
      const mode = await this.deps.readWindowMode();
      if (mode === 'fullscreen') {
        this.warnings = [FULLSCREEN_WARNING];
        this.deps.log.warn('league window mode is exclusive fullscreen; overlay will not be visible');
      } else this.warnings = [];
      if (this.lastData) this.ingest(this.lastData, [], this.snapshot.demo);
    } catch {
      // not critical
    }
  }

  /** Builds and publishes a snapshot from a poll result. `fresh` are the events not seen before. */
  ingest(data: LiveAllGameData, fresh: LiveEvent[], demo: boolean): void {
    if (fresh.length > 0) {
      this.events.push(...fresh);
      for (const e of fresh) {
        if (!KNOWN_EVENTS.has(e.EventName) && !this.unknownEvents.has(e.EventName)) {
          this.unknownEvents.add(e.EventName);
          this.deps.log.info('live client: unknown event', JSON.stringify(e).slice(0, 300));
        }
      }
    }
    this.lastData = data;
    const players = data.allPlayers ?? [];
    this.lastPlayers = players;
    const gameTime = data.gameData?.gameTime ?? 0;
    const local = this.deps.getLocalName();
    const localKey = local ? `${local.gameName}#${local.tagLine}`.toLowerCase() : undefined;
    const activeKey = (data.activePlayer?.riotId ?? data.activePlayer?.summonerName ?? '').toLowerCase();

    const inputs: LivePlayerInput[] = players.map((p) => ({
      key: playerKey(p),
      team: p.team,
      kills: p.scores?.kills ?? 0,
      deaths: p.scores?.deaths ?? 0,
      assists: p.scores?.assists ?? 0,
      cs: p.scores?.creepScore ?? 0,
      wardScore: p.scores?.wardScore ?? 0,
      itemGold: (p.items ?? []).reduce((sum, it) => sum + (it.price ?? 0) * Math.max(1, it.count ?? 1), 0),
    }));
    this.milestones = recordMilestones(this.milestones, gameTime, inputs);
    const stats = computeLiveStats(gameTime, inputs, this.milestones);
    const objectives = computeObjectives(this.events, gameTime, (name) => this.teamOf(name));

    const lobbyPlayers = this.deps.getLobby().analysis?.players ?? [];
    const champions = this.deps.staticData.getSnapshot()?.champions ?? [];
    const byKey = new Map(champions.map((c) => [c.key.toLowerCase(), c]));

    const views: LivePlayerView[] = players.map((p, i) => {
      const key = playerKey(p);
      const hash = key.indexOf('#');
      const gameName = hash >= 0 ? key.slice(0, hash) : key;
      const tagLine = hash >= 0 ? key.slice(hash + 1) : '';
      const championKey = championKeyOf(p);
      const champ = byKey.get(championKey.toLowerCase());
      const lobby = matchLobbyPlayer(lobbyPlayers, gameName, tagLine, champ?.id);
      const solo = lobby?.ranked.find((r) => r.queue === 'RANKED_SOLO_5x5') ?? lobby?.ranked[0];
      const st = stats.players[i]!;
      const input = inputs[i]!;
      const lower = key.toLowerCase();
      return {
        key,
        gameName,
        tagLine,
        championKey,
        championId: champ?.id ?? 0,
        championName: champ?.name ?? p.championName,
        team: p.team,
        position: p.position ?? '',
        level: p.level,
        isDead: p.isDead,
        respawnTimer: p.respawnTimer ?? 0,
        isBot: p.isBot,
        isSelf: lower === activeKey || (!!localKey && lower === localKey),
        kills: input.kills,
        deaths: input.deaths,
        assists: input.assists,
        cs: input.cs,
        csPerMin: st.csPerMin,
        wardScore: input.wardScore,
        killParticipation: st.killParticipation,
        cs10: st.cs10,
        cs20: st.cs20,
        wards10: st.wards10,
        wards20: st.wards20,
        itemGold: input.itemGold,
        items: (p.items ?? []).map((it) => it.itemID),
        rank:
          solo && solo.tier && solo.tier !== 'NONE'
            ? { tier: solo.tier, division: solo.division, lp: solo.lp }
            : undefined,
        winrate: lobby?.stats?.games ? lobby.stats.winrate : undefined,
        games: lobby?.stats?.games,
      };
    });

    const teams: Record<LiveTeam, LiveTeamView> = {
      ORDER: { ...stats.teams.ORDER, ...pickScore(objectives.score.ORDER), kills: stats.teams.ORDER.kills },
      CHAOS: { ...stats.teams.CHAOS, ...pickScore(objectives.score.CHAOS), kills: stats.teams.CHAOS.kills },
    };
    const self = views.find((v) => v.isSelf);
    this.snapshot = {
      connected: true,
      demo,
      gameTime,
      receivedAt: Date.now(),
      gameMode: data.gameData?.gameMode ?? '',
      mapNumber: data.gameData?.mapNumber ?? 0,
      selfTeam: self?.team,
      objectives: objectives.timers,
      soulType: objectives.soulType,
      soul: objectives.soul,
      teams,
      players: views,
      jungle: jungleTimers(this.marks, gameTime),
      warnings: this.warnings,
    };
    this.deps.publish(this.snapshot);
  }

  private teamOf(name: string | undefined): LiveTeam | undefined {
    if (!name) return undefined;
    const lower = name.toLowerCase();
    const p = this.lastPlayers.find(
      (pl) =>
        pl.riotId?.toLowerCase() === lower ||
        pl.summonerName?.toLowerCase() === lower ||
        pl.riotIdGameName?.toLowerCase() === lower ||
        playerKey(pl).toLowerCase() === lower,
    );
    return p?.team;
  }
}

const KNOWN_EVENTS = new Set([
  'GameStart',
  'MinionsSpawning',
  'FirstBrick',
  'TurretKilled',
  'InhibKilled',
  'InhibRespawningSoon',
  'InhibRespawned',
  'DragonKill',
  'HeraldKill',
  'BaronKill',
  'HordeKill',
  'ChampionKill',
  'Multikill',
  'Ace',
  'FirstBlood',
  'GameEnd',
]);

function pickScore(s: {
  turrets: number;
  dragons: string[];
  grubs: number;
  heralds: number;
  barons: number;
  inhibitors: number;
}) {
  return {
    turrets: s.turrets,
    dragons: s.dragons,
    grubs: s.grubs,
    heralds: s.heralds,
    barons: s.barons,
    inhibitors: s.inhibitors,
  };
}

function matchLobbyPlayer(
  players: LobbyPlayer[],
  gameName: string,
  tagLine: string,
  championId?: number,
): LobbyPlayer | undefined {
  const name = gameName.toLowerCase();
  const tag = tagLine.toLowerCase();
  const byName = players.find(
    (p) =>
      p.identity &&
      p.identity.gameName.toLowerCase() === name &&
      (!tag || p.identity.tagLine.toLowerCase() === tag),
  );
  if (byName) return byName;
  if (championId) return players.find((p) => p.championId === championId);
  return undefined;
}
