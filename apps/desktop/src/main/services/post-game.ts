import {
  aggregatePlayer,
  buildPostGameReport,
  compareToAverage,
  historyEntryFromReport,
  type ComparisonRow,
  type PostGameHistoryEntry,
  type PostGameReport,
} from '@poro/core';
import {
  getEogStatsBlock,
  getGame,
  getMatchHistory,
  postGameInputFromLcuGame,
  type LcuClient,
} from '@poro/lcu';
import {
  RiotApiError,
  postGameInputFromMatchV5,
  regionRoute,
  type MatchV5,
  type MatchV5Timeline,
  type Platform,
  type RiotAccount,
  type RiotApi,
} from '@poro/riot-api';
import type { HistoryStore, JsonFileCache } from '@poro/storage';
import type { AppSettings, PostGameSnapshot } from '@shared/ipc';
import type { Logger } from '../logger';
import type { PlayerDataService } from './player-data';

export interface PostGameDeps {
  getClient: () => LcuClient | null;
  getRiotApi: () => RiotApi | null;
  getPlatform: () => Platform;
  getLocalPuuid: () => string | undefined;
  getLocalIdentity: () => { gameName: string; tagLine: string } | undefined;
  /** game id of the current / last gameflow session, 0 when unknown */
  getLobbyGameId: () => number;
  getSettings: () => AppSettings;
  cache: JsonFileCache;
  history: HistoryStore;
  playerData: PlayerDataService;
  publish: (snapshot: PostGameSnapshot) => void;
  log: Logger;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const TTL = { riotAccount: 7 * DAY_MS, riotMatch: 60 * DAY_MS, riotTimeline: 60 * DAY_MS };
/** Match-V5 lags a minute or two behind the end of a game. */
const RIOT_RETRY_DELAY_MS = 20_000;
const RIOT_RETRIES = 9;
const TREND_GAMES = 20;
const HISTORY_ROWS = 50;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Post-game review (Phase 4): builds the report from the League Client right after a game and upgrades it
 * with Match-V5 + timeline (lane curves, objectives) when a Riot API key is configured. Reports are stored in the
 * local SQLite history, which also feeds the trend of the last games.
 */
export class PostGameService {
  private snapshot: PostGameSnapshot = {
    status: 'idle',
    comparison: [],
    trend: [],
    history: [],
    riotApiAvailable: false,
    updatedAt: 0,
  };
  private running: Promise<void> | null = null;
  private lastEndedGameId = 0;
  private autoBackfilled = false;

  constructor(private readonly deps: PostGameDeps) {}

  get current(): PostGameSnapshot {
    return this.snapshot;
  }

  private set(patch: Partial<PostGameSnapshot>): void {
    this.snapshot = {
      ...this.snapshot,
      ...patch,
      riotApiAvailable: !!this.deps.getRiotApi(),
      updatedAt: Date.now(),
    };
    this.deps.publish(this.snapshot);
  }

  /** Reloads trend and history lists for the local player (e.g. after connecting). */
  refreshLists(): void {
    const puuid = this.deps.getLocalPuuid();
    if (!puuid) return;
    const history = this.deps.history.list(puuid, HISTORY_ROWS);
    this.set({ history, trend: history.slice(0, TREND_GAMES) });
  }

  /** Called when the gameflow reaches EndOfGame. */
  async onGameEnd(): Promise<void> {
    const client = this.deps.getClient();
    if (!client) return;
    let gameId = 0;
    try {
      const block = await getEogStatsBlock(client);
      if (block?.gameId) gameId = block.gameId;
    } catch {
      // not available in every mode
    }
    if (!gameId) gameId = this.deps.getLobbyGameId();
    if (!gameId || gameId === this.lastEndedGameId) return;
    this.lastEndedGameId = gameId;
    this.deps.log.info('post-game: game ended', gameId);
    await this.analyze(gameId, true);
  }

  /** Analyses the most recent game of the local player (button / `--postgame-last`). */
  async analyzeLast(): Promise<string | undefined> {
    const client = this.deps.getClient();
    const puuid = this.deps.getLocalPuuid();
    if (!client || !puuid) return 'League Client nicht verbunden';
    try {
      const list = await getMatchHistory(client, puuid, 0, 6);
      const games = list.games?.games ?? [];
      const last = games.find((g) => (g.gameDuration ?? 0) >= 300) ?? games[0];
      if (!last) return 'Keine Spiele in der Match-History';
      await this.analyze(last.gameId, false);
      return this.snapshot.status === 'error' ? this.snapshot.message : undefined;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  /** Shows a stored report. */
  async open(platform: string, gameId: number): Promise<void> {
    const puuid = this.deps.getLocalPuuid();
    if (!puuid) return;
    const record = this.deps.history.get(puuid, platform, gameId);
    if (!record?.report) {
      await this.analyze(gameId, false);
      return;
    }
    const comparison = await this.comparisonFor(record.report).catch(() => [] as ComparisonRow[]);
    this.set({ status: 'ready', gameId, report: record.report, comparison, message: undefined });
  }

  /** Fills the trend once per session when the history is still small (needs the Riot API key). */
  async autoBackfill(): Promise<void> {
    const puuid = this.deps.getLocalPuuid();
    if (this.autoBackfilled || !puuid || !this.deps.getRiotApi()) return;
    this.autoBackfilled = true;
    if (this.deps.history.count(puuid) < TREND_GAMES / 2) await this.backfill(TREND_GAMES);
  }

  /** Analyses the last games of the statistics window into the history (timeline data, Riot API only). */
  async backfill(limit = TREND_GAMES): Promise<void> {
    const api = this.deps.getRiotApi();
    const puuid = this.deps.getLocalPuuid();
    const identity = this.deps.getLocalIdentity();
    if (!api || !puuid || !identity) {
      this.set({ backfill: { running: false, done: 0, total: 0, message: 'Riot API Key fehlt' } });
      return;
    }
    if (this.snapshot.backfill?.running) return;
    const platform = this.deps.getPlatform();
    const route = regionRoute(platform);
    try {
      const account = await this.riotAccount(api, identity);
      const startTime = Math.floor((Date.now() - this.deps.getSettings().windowDays * DAY_MS) / 1000);
      const ids = await api.matchIds(route, account.puuid, { startTime, count: Math.min(100, limit) });
      const todo = ids.filter((id) => !this.deps.history.has(puuid, platform, gameIdOf(id), true));
      this.set({ backfill: { running: true, done: 0, total: todo.length } });
      let done = 0;
      for (const id of todo) {
        try {
          const match = await this.cachedRiot<MatchV5>(`riotmatch:${id}`, TTL.riotMatch, () =>
            api.match(route, id),
          );
          const timeline = await this.cachedRiot<MatchV5Timeline>(
            `riottimeline:${id}`,
            TTL.riotTimeline,
            () => api.timeline<MatchV5Timeline>(route, id),
          );
          const report = buildPostGameReport(
            postGameInputFromMatchV5(match, timeline, account.puuid, platform),
          );
          this.deps.history.upsert(puuid, historyEntryFromReport(report), report);
        } catch (e) {
          this.deps.log.warn('post-game backfill', id, describe(e));
          if (e instanceof RiotApiError && (e.status === 401 || e.status === 403)) break;
        }
        done += 1;
        this.set({ backfill: { running: true, done, total: todo.length } });
      }
      this.refreshLists();
      this.set({ backfill: { running: false, done, total: todo.length } });
      this.deps.log.info('post-game backfill finished', `${done}/${todo.length}`);
    } catch (e) {
      this.set({ backfill: { running: false, done: 0, total: 0, message: describe(e) } });
    }
  }

  /** Builds the report for one game: League Client first, then Match-V5 with timeline when a key exists. */
  async analyze(gameId: number, recent: boolean): Promise<void> {
    if (this.running) await this.running.catch(() => undefined);
    this.running = this.doAnalyze(gameId, recent).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async doAnalyze(gameId: number, recent: boolean): Promise<void> {
    const client = this.deps.getClient();
    const puuid = this.deps.getLocalPuuid();
    const platform = this.deps.getPlatform();
    if (!client || !puuid) {
      this.set({ status: 'error', gameId, message: 'League Client nicht verbunden' });
      return;
    }
    this.set({ status: 'loading', gameId, message: undefined });

    let report: PostGameReport | undefined;
    try {
      const game = await getGame(client, gameId);
      report = buildPostGameReport(postGameInputFromLcuGame(game, puuid, platform));
      this.deps.history.upsert(puuid, historyEntryFromReport(report), report);
      const comparison = await this.comparisonFor(report).catch(() => [] as ComparisonRow[]);
      this.refreshLists();
      this.set({ status: this.deps.getRiotApi() ? 'waiting' : 'ready', report, comparison, gameId });
      this.deps.log.info('post-game: client report', gameId, report.win ? 'win' : 'loss');
    } catch (e) {
      this.deps.log.warn('post-game: client report failed', gameId, describe(e));
    }

    const api = this.deps.getRiotApi();
    const identity = this.deps.getLocalIdentity();
    if (!api || !identity) {
      if (!report) this.set({ status: 'error', gameId, message: 'Spiel konnte nicht geladen werden' });
      return;
    }
    try {
      const route = regionRoute(platform);
      const account = await this.riotAccount(api, identity);
      const matchId = `${platform.toUpperCase()}_${gameId}`;
      const match = await this.riotWithRetry(
        () =>
          this.cachedRiot<MatchV5>(`riotmatch:${matchId}`, TTL.riotMatch, () => api.match(route, matchId)),
        recent,
      );
      const timeline = await this.riotWithRetry(
        () =>
          this.cachedRiot<MatchV5Timeline>(`riottimeline:${matchId}`, TTL.riotTimeline, () =>
            api.timeline<MatchV5Timeline>(route, matchId),
          ),
        recent,
      );
      const full = buildPostGameReport(postGameInputFromMatchV5(match, timeline, account.puuid, platform));
      this.deps.history.upsert(puuid, historyEntryFromReport(full), full);
      const comparison = await this.comparisonFor(full).catch(() => [] as ComparisonRow[]);
      this.refreshLists();
      this.set({ status: 'ready', report: full, comparison, gameId, message: undefined });
      this.deps.log.info('post-game: timeline report', matchId);
    } catch (e) {
      const message = describe(e);
      this.deps.log.warn('post-game: riot report failed', gameId, message);
      if (report) this.set({ status: 'ready', message: `Match-V5: ${message}` });
      else this.set({ status: 'error', gameId, message });
    }
  }

  private async riotWithRetry<T>(load: () => Promise<T>, recent: boolean): Promise<T> {
    const tries = recent ? RIOT_RETRIES : 1;
    for (let i = 0; ; i++) {
      try {
        return await load();
      } catch (e) {
        const retry = e instanceof RiotApiError && e.status === 404 && i < tries - 1;
        if (!retry) throw e;
        this.set({ status: 'waiting', message: 'Warte auf Match-Daten von Riot…' });
        await sleep(RIOT_RETRY_DELAY_MS);
      }
    }
  }

  private async comparisonFor(report: PostGameReport): Promise<ComparisonRow[]> {
    const puuid = this.deps.getLocalPuuid();
    if (!puuid) return compareToAverage(report, undefined);
    const settings = this.deps.getSettings();
    const bundle = await this.deps.playerData.getBundle(puuid, {
      windowDays: settings.windowDays,
      fetchFullGames: false,
      fullGamesPerPlayer: 0,
      useRiotApi: !!this.deps.getRiotApi(),
      riotApiMaxGames: 40,
    });
    const others = bundle.matches.filter((m) => m.gameId !== report.gameId);
    return compareToAverage(
      report,
      aggregatePlayer(others, { windowDays: settings.windowDays, rankedOnly: settings.rankedOnly }),
    );
  }

  private riotAccount(api: RiotApi, identity: { gameName: string; tagLine: string }): Promise<RiotAccount> {
    const route = regionRoute(this.deps.getPlatform());
    return this.cachedRiot<RiotAccount>(
      `riotacct:${identity.gameName}#${identity.tagLine}`,
      TTL.riotAccount,
      () => api.accountByRiotId(route, identity.gameName, identity.tagLine),
    );
  }

  private async cachedRiot<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
    const hit = this.deps.cache.get<T>(key);
    if (hit !== undefined) return hit;
    const value = await load();
    this.deps.cache.set(key, value, ttl);
    return value;
  }
}

function gameIdOf(matchId: string): number {
  return Number(matchId.split('_')[1] ?? 0);
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export type { PostGameHistoryEntry };
