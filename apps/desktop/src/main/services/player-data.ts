import {
  SR_5V5_QUEUES,
  type ChampionMastery,
  type MatchSummary,
  type PlayerIdentity,
  type RankedEntry,
} from '@poro/core';
import {
  HttpError,
  getChampionMastery,
  getGame,
  getMatchHistory,
  getRankedStats,
  getSummonerByPuuid,
  normalizeGame,
  normalizeMastery,
  normalizeRanked,
  normalizeSummoner,
  type LcuClient,
  type LcuGame,
} from '@poro/lcu';
import {
  RiotApiError,
  gameIdFromMatchId,
  normalizeMatchV5,
  regionRoute,
  type MatchV5,
  type Platform,
  type RiotApi,
} from '@poro/riot-api';
import type { JsonFileCache } from '@poro/storage';
import type { Logger } from '../logger';

export interface PlayerBundle {
  puuid: string;
  identity?: PlayerIdentity;
  ranked: RankedEntry[];
  matches: MatchSummary[];
  mastery: ChampionMastery[];
  /** where the match list came from */
  sources: Array<'lcu' | 'riot'>;
  error?: string;
  fetchedAt: number;
}

export interface PlayerDataOptions {
  windowDays: number;
  fetchFullGames: boolean;
  fullGamesPerPlayer: number;
  /** also load the player's games through the Riot API (Match-V5); needs an API key and the Riot ID */
  useRiotApi?: boolean;
  riotApiMaxGames?: number;
}

export interface PlayerDataDeps {
  getClient: () => LcuClient | null;
  getRiotApi: () => RiotApi | null;
  getPlatform: () => Platform;
  onRiotApiError?: (message: string) => void;
}

const TTL = {
  summoner: 24 * 60 * 60 * 1000,
  ranked: 30 * 60 * 1000,
  matches: 15 * 60 * 1000,
  mastery: 6 * 60 * 60 * 1000,
  rawGame: 30 * 24 * 60 * 60 * 1000,
  riotAccount: 7 * 24 * 60 * 60 * 1000,
  riotIds: 10 * 60 * 1000,
  riotMatch: 60 * 24 * 60 * 60 * 1000,
};

const PAGE_SIZE = 20;
const MAX_GAMES = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

class Semaphore {
  private queue: Array<() => void> = [];
  private active = 0;
  constructor(private readonly limit: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

function describe(e: unknown): string {
  if (e instanceof HttpError) return `HTTP ${e.status}`;
  if (e instanceof RiotApiError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

/** Loads everything we know about one player: primarily through the local League Client, optionally via the Riot API. */
export class PlayerDataService {
  private readonly playerLimiter = new Semaphore(3);
  private readonly gameLimiter = new Semaphore(2);
  private readonly riotLimiter = new Semaphore(4);

  constructor(
    private readonly cache: JsonFileCache,
    private readonly deps: PlayerDataDeps,
    private readonly log: Logger,
  ) {}

  async getBundle(puuid: string, opts: PlayerDataOptions): Promise<PlayerBundle> {
    return this.playerLimiter.run(() => this.load(puuid, opts));
  }

  private async load(puuid: string, opts: PlayerDataOptions): Promise<PlayerBundle> {
    const bundle: PlayerBundle = {
      puuid,
      ranked: [],
      matches: [],
      mastery: [],
      sources: [],
      fetchedAt: Date.now(),
    };
    const client = this.deps.getClient();
    if (!client) {
      bundle.error = 'LCU nicht verbunden';
      return bundle;
    }

    try {
      bundle.identity = await this.cached(`summoner:${puuid}`, TTL.summoner, async () =>
        normalizeSummoner(await getSummonerByPuuid(client, puuid)),
      );
    } catch (e) {
      this.log.warn(`summoner ${puuid.slice(0, 8)} failed`, describe(e));
      bundle.error = `Summoner: ${describe(e)}`;
    }

    try {
      bundle.ranked = await this.cached(`ranked:${puuid}`, TTL.ranked, async () =>
        normalizeRanked(await getRankedStats(client, puuid)),
      );
    } catch (e) {
      this.log.warn(`ranked ${puuid.slice(0, 8)} failed`, describe(e));
    }

    try {
      bundle.matches = await this.cached(`matches:${puuid}:${opts.windowDays}`, TTL.matches, () =>
        this.loadMatchList(client, puuid, opts.windowDays),
      );
      bundle.sources.push('lcu');
    } catch (e) {
      this.log.warn(`matches ${puuid.slice(0, 8)} failed`, describe(e));
      bundle.error = bundle.error ?? `Match-History: ${describe(e)}`;
    }

    try {
      bundle.mastery = await this.cached(`mastery:${puuid}`, TTL.mastery, async () =>
        normalizeMastery(await getChampionMastery(client, puuid)),
      );
    } catch (e) {
      this.log.warn(`mastery ${puuid.slice(0, 8)} failed`, describe(e));
    }

    if (opts.useRiotApi && bundle.identity?.gameName && bundle.identity.tagLine) {
      const riotMatches = await this.loadFromRiotApi(bundle.identity, opts);
      if (riotMatches) {
        bundle.matches = mergeMatches(bundle.matches, riotMatches);
        bundle.sources.push('riot');
      }
    }

    if (opts.fetchFullGames && bundle.matches.length > 0) {
      bundle.matches = await this.enrichWithFullGames(client, puuid, bundle.matches, opts.fullGamesPerPlayer);
    }
    return bundle;
  }

  private async cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get<T>(key);
    if (hit !== undefined) return hit;
    const value = await load();
    this.cache.set(key, value, ttl);
    return value;
  }

  /**
   * The client ignores begIndex/endIndex and returns its cached block (20-40 games) for every request,
   * so paging stops as soon as a page adds nothing new (verified against the live client).
   */
  private async loadMatchList(client: LcuClient, puuid: string, windowDays: number): Promise<MatchSummary[]> {
    const out: MatchSummary[] = [];
    const seen = new Set<number>();
    const minCreation = Date.now() - windowDays * DAY_MS;
    let beg = 0;
    while (beg < MAX_GAMES) {
      const page = await getMatchHistory(client, puuid, beg, beg + PAGE_SIZE - 1);
      const games = page.games?.games ?? [];
      let added = 0;
      for (const g of games) {
        if (seen.has(g.gameId)) continue;
        seen.add(g.gameId);
        const m = normalizeGame(g, puuid);
        if (m) {
          out.push(m);
          added++;
        }
      }
      if (games.length < PAGE_SIZE || added === 0) break;
      const oldest = games[games.length - 1]?.gameCreation ?? 0;
      if (oldest < minCreation) break;
      beg += PAGE_SIZE;
    }
    return out;
  }

  private async enrichWithFullGames(
    client: LcuClient,
    puuid: string,
    matches: MatchSummary[],
    limit: number,
  ): Promise<MatchSummary[]> {
    const targets = matches.filter((m) => SR_5V5_QUEUES.has(m.queueId) && !m.opponents).slice(0, limit);
    const enriched = new Map<number, MatchSummary>();
    await Promise.all(
      targets.map((m) =>
        this.gameLimiter.run(async () => {
          try {
            const raw = await this.cached<LcuGame>(`rawgame:${m.gameId}`, TTL.rawGame, () =>
              getGame(client, m.gameId),
            );
            const full = normalizeGame(raw, puuid);
            if (full) enriched.set(m.gameId, full);
          } catch (e) {
            this.log.warn(`game ${m.gameId} failed`, describe(e));
          }
        }),
      ),
    );
    return matches.map((m) => enriched.get(m.gameId) ?? m);
  }

  /** Match-V5 history via the Riot API. Returns undefined when no key is configured or the request fails. */
  private async loadFromRiotApi(
    identity: PlayerIdentity,
    opts: PlayerDataOptions,
  ): Promise<MatchSummary[] | undefined> {
    const api = this.deps.getRiotApi();
    if (!api) return undefined;
    const route = regionRoute(this.deps.getPlatform());
    const maxGames = Math.min(100, opts.riotApiMaxGames ?? 40);
    try {
      const account = await this.cached(
        `riotacct:${identity.gameName}#${identity.tagLine}`,
        TTL.riotAccount,
        () => api.accountByRiotId(route, identity.gameName, identity.tagLine),
      );
      const startTime = Math.floor((Date.now() - opts.windowDays * DAY_MS) / 1000);
      const ids = await this.cached(
        `riotids:${account.puuid}:${opts.windowDays}:${maxGames}`,
        TTL.riotIds,
        () => api.matchIds(route, account.puuid, { startTime, count: maxGames }),
      );
      const out: MatchSummary[] = [];
      await Promise.all(
        ids.map((id) =>
          this.riotLimiter.run(async () => {
            try {
              const match = await this.cached<MatchV5>(`riotmatch:${id}`, TTL.riotMatch, () =>
                api.match(route, id),
              );
              const m = normalizeMatchV5(match, account.puuid);
              if (m) out.push(m);
              else this.log.warn(`riot match ${id}: player ${gameIdFromMatchId(id)} not found`);
            } catch (e) {
              this.log.warn(`riot match ${id} failed`, describe(e));
            }
          }),
        ),
      );
      this.log.info(`riot api: ${out.length} matches for ${identity.gameName}#${identity.tagLine}`);
      return out.sort((a, b) => b.gameCreation - a.gameCreation);
    } catch (e) {
      const message = describe(e);
      this.log.warn('riot api failed', message);
      if (e instanceof RiotApiError && (e.status === 401 || e.status === 403))
        this.deps.onRiotApiError?.(message);
      return undefined;
    }
  }
}

/** Merges two match lists by gameId; entries from `preferred` win (they carry full data). */
export function mergeMatches(base: MatchSummary[], preferred: MatchSummary[]): MatchSummary[] {
  const byId = new Map<number, MatchSummary>();
  for (const m of base) byId.set(m.gameId, m);
  for (const m of preferred) byId.set(m.gameId, m);
  return [...byId.values()].sort((a, b) => b.gameCreation - a.gameCreation);
}
