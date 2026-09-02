import type { Role } from '@poro/core';
import type { Platform, RiotApi } from '@poro/riot-api';
import {
  Crawler,
  banSuggestions,
  buildStats,
  championStats,
  counterPicks,
  matchupStats,
  patchOfDataDragon,
  type ChampionBuildStats,
  type ChampionRoleStats,
  type MatchupStats,
  type MetaSummary,
} from '@poro/stats';
import type { StaticData } from '@poro/static-data';
import type { StatsStore } from '@poro/storage';
import type { AppSettings, ChampSelectMeta, MetaChampion, MetaSnapshot } from '@shared/ipc';
import type { Logger } from '../logger';

export interface StatsDeps {
  getRiotApi: () => RiotApi | null;
  getPlatform: () => Platform;
  getSettings: () => AppSettings;
  staticData: StaticData;
  store: StatsStore;
  publish: (snapshot: MetaSnapshot) => void;
  log: Logger;
}

const QUEUE = 420;
const SUMMARY_TTL_MS = 5 * 60 * 1000;
const SUMMARY_NEW_MATCHES = 300;
const BUILD_TTL_MS = 10 * 60 * 1000;
const PATCH_WINDOW_DAYS = 14;

/**
 * Statistics pipeline (Phase 5): runs the crawler with the user's key while the app is open and serves
 * tier list, matchups, counters, bans and meta builds from the local SQLite store.
 */
export class StatsService {
  private crawler: Crawler | null = null;
  private crawlerKey = '';
  private summaryCache: {
    key: string;
    at: number;
    matches: number;
    summary: MetaSummary;
    matchups: MatchupStats[];
  } | null = null;
  private buildCache = new Map<string, { at: number; build: ChampionBuildStats }>();
  private storedSinceSummary = 0;
  private publishTimer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: StatsDeps) {}

  patch(): string {
    return patchOfDataDragon(this.deps.staticData.getSnapshot()?.version);
  }

  current(): MetaSnapshot {
    return {
      hasKey: !!this.deps.getRiotApi(),
      enabled: this.deps.getSettings().crawlerEnabled,
      platform: this.deps.getPlatform(),
      patch: this.patch(),
      crawler: this.crawler?.current ?? null,
      summary: this.summary(),
      updatedAt: Date.now(),
    };
  }

  /** Starts, restarts or stops the crawler according to key, settings, platform and patch. */
  apply(): void {
    const api = this.deps.getRiotApi();
    const settings = this.deps.getSettings();
    const platform = this.deps.getPlatform();
    const patch = this.patch();
    const wanted = !!api && settings.crawlerEnabled && !!patch;
    const key = wanted ? `${platform}:${patch}:${settings.riotApiKey}` : '';
    if (this.crawler && (!wanted || key !== this.crawlerKey)) {
      const old = this.crawler;
      this.crawler = null;
      void old.stop();
      this.deps.log.info('crawler stopped');
    }
    if (wanted && !this.crawler && api) {
      this.deps.store.pruneOldPatches(platform, QUEUE, 2);
      // a new patch: crawl every known player again
      if (this.crawlerKey && !this.crawlerKey.startsWith(`${platform}:${patch}:`))
        this.deps.store.resetPlayers(platform);
      this.crawler = new Crawler(api, this.deps.store, (extract) => this.onMatch(extract), {
        platform,
        patch,
        queueId: QUEUE,
        startTime: Math.floor((Date.now() - PATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000) / 1000),
        requestsPerMinute: settings.crawlerRequestsPerMinute,
        log: this.deps.log,
      });
      this.crawler.onStatus(() => this.schedulePublish());
      this.crawler.start();
      this.crawlerKey = key;
      this.deps.log.info('crawler started', platform, patch, `${settings.crawlerRequestsPerMinute} req/min`);
    } else if (this.crawler) {
      this.crawler.setRequestsPerMinute(settings.crawlerRequestsPerMinute);
    }
    this.schedulePublish();
  }

  stop(): void {
    const crawler = this.crawler;
    this.crawler = null;
    if (crawler) void crawler.stop();
  }

  private onMatch(extract: Parameters<StatsStore['insertMatch']>[0]): void {
    if (this.deps.store.insertMatch(extract)) this.storedSinceSummary += 1;
  }

  private schedulePublish(): void {
    if (this.publishTimer) return;
    this.publishTimer = setTimeout(() => {
      this.publishTimer = null;
      this.deps.publish(this.current());
    }, 1000);
  }

  /** Tier list of the current patch; cached because the aggregation scans every participant row. */
  summary(): MetaSummary | null {
    const platform = this.deps.getPlatform();
    const patch = this.patch();
    if (!patch) return null;
    const key = `${platform}:${patch}`;
    const cached = this.summaryCache;
    if (
      cached &&
      cached.key === key &&
      Date.now() - cached.at < SUMMARY_TTL_MS &&
      this.storedSinceSummary < SUMMARY_NEW_MATCHES
    ) {
      return cached.summary;
    }
    const matches = this.deps.store.matchCount(platform, patch, QUEUE);
    if (matches === 0) return null;
    const started = Date.now();
    const champions = championStats(
      this.deps.store.championGroups(platform, patch, QUEUE),
      this.deps.store.banCounts(platform, patch, QUEUE),
      matches,
    );
    const matchups = matchupStats(this.deps.store.matchupGroups(platform, patch, QUEUE, 3));
    const summary: MetaSummary = {
      platform,
      patch,
      queueId: QUEUE,
      matches,
      champions,
      updatedAt: Date.now(),
    };
    this.summaryCache = { key, at: Date.now(), matches, summary, matchups };
    this.storedSinceSummary = 0;
    this.buildCache.clear();
    this.deps.log.info(
      'meta aggregated',
      `${matches} matches`,
      `${champions.length} champion/role rows`,
      `${Date.now() - started} ms`,
    );
    return summary;
  }

  matchups(): MatchupStats[] {
    this.summary();
    return this.summaryCache?.matchups ?? [];
  }

  champion(championId: number, role: Role): MetaChampion {
    const summary = this.summary();
    if (!summary || role === 'UNKNOWN') return {};
    const stats = summary.champions.find((c) => c.championId === championId && c.role === role);
    const key = `${summary.platform}:${summary.patch}:${championId}:${role}`;
    let entry = this.buildCache.get(key);
    if (!entry || Date.now() - entry.at > BUILD_TTL_MS) {
      const rows = this.deps.store.championRows(summary.platform, summary.patch, QUEUE, championId, role);
      const sd = this.deps.staticData;
      const build = buildStats(
        rows,
        {
          isBoots: (id) => sd.itemMeta(id)?.tags.includes('Boots') ?? false,
          isCompleted: (id) => sd.itemMeta(id)?.completed ?? false,
        },
        championId,
        role,
      );
      entry = { at: Date.now(), build };
      this.buildCache.set(key, entry);
    }
    return { stats, build: entry.build.games > 0 ? entry.build : undefined };
  }

  /** Everything the champion panel shows for the current pick. */
  forPick(
    championId: number,
    role: Role,
    enemyChampionIds: number[],
    myChampionIds: number[],
  ): ChampSelectMeta | undefined {
    const summary = this.summary();
    if (!summary) return undefined;
    const matchups = this.matchups();
    const own = championId ? this.champion(championId, role) : {};
    const counters =
      role === 'UNKNOWN'
        ? []
        : enemyChampionIds
            .filter((id) => id > 0)
            .map((enemy) => ({ enemyChampionId: enemy, role, picks: counterPicks(matchups, enemy, role) }));
    return {
      patch: summary.patch,
      matches: summary.matches,
      self: own.stats,
      build: own.build,
      counters: counters.filter((c) => c.picks.length > 0),
      bans: banSuggestions(summary.champions, matchups, myChampionIds, role === 'UNKNOWN' ? undefined : role),
    };
  }
}

export type { ChampionRoleStats };
