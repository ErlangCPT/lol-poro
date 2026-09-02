import { RiotApiError, regionRoute, type Platform, type RiotApi } from '@poro/riot-api';
import { extractMatch } from './extract';
import type { CrawlPhase, CrawlerStatus, MatchExtract } from './types';

/** Persistence the crawler needs; implemented by the SQLite store of the app and by an in-memory store in tests. */
export interface CrawlStore {
  enqueueMatches(platform: string, matchIds: string[]): number;
  nextMatches(platform: string, limit: number): string[];
  markMatch(matchId: string, status: 'done' | 'skipped' | 'failed'): void;
  pendingMatches(platform: string): number;
  upsertPlayers(platform: string, puuids: string[], source: 'ladder' | 'match'): number;
  nextPlayers(platform: string, limit: number): string[];
  markPlayer(puuid: string): void;
  playerCounts(platform: string): { total: number; pending: number };
}

export interface CrawlerOptions {
  platform: Platform;
  /** ranked solo by default */
  queueId?: number;
  /** only matches of this patch are stored ("16.17") */
  patch: string;
  /** oldest game creation to request (epoch seconds) */
  startTime: number;
  requestsPerMinute?: number;
  /** ladder seeds in order; apex leagues use the league list endpoints */
  seeds?: LadderSeed[];
  /** how many match ids are kept ready before players are expanded again */
  queueTarget?: number;
  log?: { info(msg: string, ...args: unknown[]): void; warn(msg: string, ...args: unknown[]): void };
  sleep?: (ms: number) => Promise<void>;
}

export interface LadderSeed {
  tier: string;
  division?: string;
  pages?: number;
}

export const DEFAULT_SEEDS: LadderSeed[] = [
  { tier: 'CHALLENGER' },
  { tier: 'GRANDMASTER' },
  { tier: 'MASTER' },
  { tier: 'DIAMOND', division: 'I', pages: 2 },
  { tier: 'DIAMOND', division: 'II', pages: 2 },
  { tier: 'DIAMOND', division: 'III', pages: 2 },
  { tier: 'DIAMOND', division: 'IV', pages: 2 },
  { tier: 'EMERALD', division: 'I', pages: 3 },
  { tier: 'EMERALD', division: 'II', pages: 3 },
  { tier: 'EMERALD', division: 'III', pages: 2 },
  { tier: 'EMERALD', division: 'IV', pages: 2 },
];

const APEX: Record<string, 'challengerleagues' | 'grandmasterleagues' | 'masterleagues'> = {
  CHALLENGER: 'challengerleagues',
  GRANDMASTER: 'grandmasterleagues',
  MASTER: 'masterleagues',
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Collects ranked matches of the current patch: ladder → players → match ids → matches. Runs one request at a
 * time at a fixed pace so the rest of the app keeps enough of the key's rate limit.
 */
export class Crawler {
  private running = false;
  private loop: Promise<void> | null = null;
  private status: CrawlerStatus = {
    running: false,
    phase: 'idle',
    requests: 0,
    matchesStored: 0,
    matchesSkipped: 0,
    players: 0,
    playersPending: 0,
    pendingMatches: 0,
  };
  private seedIndex = 0;
  private seedPage = 1;
  private readonly seeds: LadderSeed[];
  private readonly queueId: number;
  private readonly queueTarget: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private paceMs: number;
  private statusListeners: Array<(s: CrawlerStatus) => void> = [];

  constructor(
    private readonly api: RiotApi,
    private readonly store: CrawlStore,
    private readonly onMatch: (extract: MatchExtract) => void,
    private readonly options: CrawlerOptions,
  ) {
    this.seeds = options.seeds ?? DEFAULT_SEEDS;
    this.queueId = options.queueId ?? 420;
    this.queueTarget = options.queueTarget ?? 200;
    this.sleep = options.sleep ?? defaultSleep;
    this.paceMs = Math.round(60_000 / Math.max(1, options.requestsPerMinute ?? 40));
  }

  get current(): CrawlerStatus {
    return { ...this.status, ...this.storeCounts() };
  }

  onStatus(listener: (s: CrawlerStatus) => void): void {
    this.statusListeners.push(listener);
  }

  setRequestsPerMinute(rpm: number): void {
    this.paceMs = Math.round(60_000 / Math.max(1, rpm));
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.status = {
      ...this.status,
      running: true,
      phase: 'idle',
      lastError: undefined,
      startedAt: Date.now(),
    };
    this.loop = this.run().catch((e) => {
      this.fail(e);
    });
  }

  async stop(): Promise<void> {
    this.running = false;
    this.setPhase('stopped');
    await this.loop?.catch(() => undefined);
    this.loop = null;
    this.status.running = false;
    this.emit();
  }

  /** One crawl step: a ladder page, a player's match list or one match. Exposed for tests. */
  async step(): Promise<void> {
    const platform = this.options.platform;
    if (this.store.pendingMatches(platform) < this.queueTarget) {
      const [puuid] = this.store.nextPlayers(platform, 1);
      if (puuid) {
        this.setPhase('players');
        await this.fetchPlayerMatches(puuid);
        return;
      }
      if (this.seedIndex < this.seeds.length) {
        this.setPhase('seeding');
        await this.fetchLadderPage();
        return;
      }
    }
    const [matchId] = this.store.nextMatches(platform, 1);
    if (matchId) {
      this.setPhase('matches');
      await this.fetchMatch(matchId);
      return;
    }
    // nothing to do: all seeds used and all queued matches fetched
    this.setPhase('idle');
    await this.sleep(60_000);
  }

  private async run(): Promise<void> {
    while (this.running) {
      await this.step();
      if (this.running) await this.sleep(this.paceMs);
    }
  }

  private async fetchLadderPage(): Promise<void> {
    const seed = this.seeds[this.seedIndex]!;
    const platform = this.options.platform;
    const queue = this.queueId === 440 ? 'RANKED_FLEX_SR' : 'RANKED_SOLO_5x5';
    let puuids: string[] = [];
    this.status.requests += 1;
    if (APEX[seed.tier]) {
      const list = await this.api.leagueList(platform, APEX[seed.tier]!, queue);
      puuids = list.entries.map((e) => e.puuid).filter((p): p is string => !!p);
      this.seedIndex += 1;
      this.seedPage = 1;
    } else {
      const entries = await this.api.leagueEntries(
        platform,
        queue,
        seed.tier,
        seed.division ?? 'I',
        this.seedPage,
      );
      puuids = entries.map((e) => e.puuid).filter((p): p is string => !!p);
      this.seedPage += 1;
      if (entries.length === 0 || this.seedPage > (seed.pages ?? 1)) {
        this.seedIndex += 1;
        this.seedPage = 1;
      }
    }
    const added = this.store.upsertPlayers(platform, puuids, 'ladder');
    this.options.log?.info(
      'crawler: ladder',
      seed.tier,
      seed.division ?? '',
      `${puuids.length} players (${added} new)`,
    );
    this.emit();
  }

  private async fetchPlayerMatches(puuid: string): Promise<void> {
    const platform = this.options.platform;
    this.status.requests += 1;
    try {
      const ids = await this.api.matchIds(regionRoute(platform), puuid, {
        queue: this.queueId,
        type: 'ranked',
        startTime: this.options.startTime,
        count: 100,
      });
      const added = this.store.enqueueMatches(platform, ids);
      this.options.log?.info('crawler: player', `${ids.length} ids (${added} new)`);
    } catch (e) {
      if (isFatal(e)) throw e;
      this.options.log?.warn('crawler: match ids failed', describe(e));
    } finally {
      this.store.markPlayer(puuid);
      this.emit();
    }
  }

  private async fetchMatch(matchId: string): Promise<void> {
    const platform = this.options.platform;
    this.status.requests += 1;
    try {
      const match = await this.api.match(regionRoute(platform), matchId);
      const extract = extractMatch(match, platform);
      if (extract && extract.patch === this.options.patch && extract.queueId === this.queueId) {
        this.onMatch(extract);
        this.store.upsertPlayers(platform, extract.puuids, 'match');
        this.store.markMatch(matchId, 'done');
        this.status.matchesStored += 1;
      } else {
        this.store.markMatch(matchId, 'skipped');
        this.status.matchesSkipped += 1;
      }
    } catch (e) {
      if (isFatal(e)) throw e;
      this.store.markMatch(matchId, 'failed');
      this.options.log?.warn('crawler: match failed', matchId, describe(e));
    }
    this.emit();
  }

  private storeCounts(): Pick<CrawlerStatus, 'players' | 'playersPending' | 'pendingMatches'> {
    const platform = this.options.platform;
    const players = this.store.playerCounts(platform);
    return {
      players: players.total,
      playersPending: players.pending,
      pendingMatches: this.store.pendingMatches(platform),
    };
  }

  private setPhase(phase: CrawlPhase): void {
    if (this.status.phase !== phase) {
      this.status.phase = phase;
      this.emit();
    }
  }

  private fail(e: unknown): void {
    this.running = false;
    this.status = { ...this.status, running: false, phase: 'error', lastError: describe(e) };
    this.options.log?.warn('crawler stopped', describe(e));
    this.emit();
  }

  private emit(): void {
    const snapshot = this.current;
    for (const l of this.statusListeners) l(snapshot);
  }
}

/** Key problems stop the crawler; everything else is skipped and logged. */
function isFatal(e: unknown): boolean {
  return e instanceof RiotApiError && (e.status === 401 || e.status === 403);
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
