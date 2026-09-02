import { RateLimiter } from './rate-limiter';
import type { Platform, RegionRoute } from './routing';
import type { ApexLeague, LeagueEntry, LeagueList, MatchIdsQuery, MatchV5, RiotAccount } from './types';

export class RiotApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    message?: string,
  ) {
    super(message ?? `Riot API ${status} ${url}`);
    this.name = 'RiotApiError';
  }
}

export interface RiotApiOptions {
  limiter?: RateLimiter;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

/** Thin Riot Games API client with header-driven rate limiting and Retry-After handling. */
export class RiotApi {
  private readonly limiter: RateLimiter;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly apiKey: string,
    opts: RiotApiOptions = {},
  ) {
    this.limiter = opts.limiter ?? new RateLimiter();
    this.maxRetries = opts.maxRetries ?? 3;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  get hasKey(): boolean {
    return this.apiKey.length > 0;
  }

  async get<T>(host: string, path: string): Promise<T> {
    const url = `https://${host}.api.riotgames.com${path}`;
    for (let attempt = 0; ; attempt++) {
      await this.limiter.acquire(host);
      const res = await this.fetchImpl(url, {
        headers: { 'X-Riot-Token': this.apiKey, Accept: 'application/json' },
      });
      this.limiter.updateFromHeaders(host, res.headers);
      if (res.ok) return (await res.json()) as T;
      if ((res.status === 429 || res.status >= 500) && attempt < this.maxRetries) {
        const retryAfter = Number(res.headers.get('retry-after') ?? '1');
        const waitMs = (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 1) * 1000;
        this.limiter.block(host, waitMs);
        continue;
      }
      let message: string | undefined;
      try {
        message = ((await res.json()) as { status?: { message?: string } }).status?.message;
      } catch {
        // no body
      }
      throw new RiotApiError(res.status, url, message ? `Riot API ${res.status}: ${message}` : undefined);
    }
  }

  accountByRiotId(route: RegionRoute, gameName: string, tagLine: string): Promise<RiotAccount> {
    return this.get<RiotAccount>(
      route,
      `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
    );
  }

  accountByPuuid(route: RegionRoute, puuid: string): Promise<RiotAccount> {
    return this.get<RiotAccount>(route, `/riot/account/v1/accounts/by-puuid/${encodeURIComponent(puuid)}`);
  }

  /** Ranked ladder page (205 entries) of a tier / division, e.g. EMERALD I. */
  leagueEntries(
    platform: Platform,
    queue: string,
    tier: string,
    division: string,
    page = 1,
  ): Promise<LeagueEntry[]> {
    return this.get<LeagueEntry[]>(
      platform,
      `/lol/league/v4/entries/${queue}/${tier}/${division}?page=${page}`,
    );
  }

  /** Master, grandmaster or challenger league of a queue. */
  leagueList(platform: Platform, league: ApexLeague, queue: string): Promise<LeagueList> {
    return this.get<LeagueList>(platform, `/lol/league/v4/${league}/by-queue/${queue}`);
  }

  matchIds(route: RegionRoute, puuid: string, query: MatchIdsQuery = {}): Promise<string[]> {
    const params = new URLSearchParams();
    if (query.startTime) params.set('startTime', String(query.startTime));
    if (query.endTime) params.set('endTime', String(query.endTime));
    if (query.queue) params.set('queue', String(query.queue));
    if (query.type) params.set('type', query.type);
    params.set('start', String(query.start ?? 0));
    params.set('count', String(Math.min(100, query.count ?? 20)));
    return this.get<string[]>(
      route,
      `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?${params.toString()}`,
    );
  }

  match(route: RegionRoute, matchId: string): Promise<MatchV5> {
    return this.get<MatchV5>(route, `/lol/match/v5/matches/${encodeURIComponent(matchId)}`);
  }

  timeline<T = unknown>(route: RegionRoute, matchId: string): Promise<T> {
    return this.get<T>(route, `/lol/match/v5/matches/${encodeURIComponent(matchId)}/timeline`);
  }

  platformStatus(platform: Platform): Promise<unknown> {
    return this.get(platform, '/lol/status/v4/platform-data');
  }
}
