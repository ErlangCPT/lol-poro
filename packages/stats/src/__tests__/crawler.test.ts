import { RiotApi, type MatchV5 } from '@poro/riot-api';
import { describe, expect, it } from 'vitest';
import { Crawler, type CrawlStore } from '../crawler';
import type { MatchExtract } from '../types';

class MemoryStore implements CrawlStore {
  matches = new Map<string, string>();
  players = new Map<string, boolean>();
  enqueueMatches(_p: string, ids: string[]): number {
    let added = 0;
    for (const id of ids) if (!this.matches.has(id)) (this.matches.set(id, 'pending'), added++);
    return added;
  }
  nextMatches(_p: string, limit: number): string[] {
    return [...this.matches.entries()]
      .filter(([, s]) => s === 'pending')
      .map(([id]) => id)
      .slice(0, limit);
  }
  markMatch(id: string, status: 'done' | 'skipped' | 'failed'): void {
    this.matches.set(id, status);
  }
  pendingMatches(): number {
    return this.nextMatches('', 1e9).length;
  }
  upsertPlayers(_p: string, puuids: string[]): number {
    let added = 0;
    for (const p of puuids) if (!this.players.has(p)) (this.players.set(p, false), added++);
    return added;
  }
  nextPlayers(_p: string, limit: number): string[] {
    return [...this.players.entries()]
      .filter(([, done]) => !done)
      .map(([p]) => p)
      .slice(0, limit);
  }
  markPlayer(puuid: string): void {
    this.players.set(puuid, true);
  }
  playerCounts(): { total: number; pending: number } {
    return { total: this.players.size, pending: this.nextPlayers('', 1e9).length };
  }
}

function fakeMatch(id: string, version = '16.17.1.1'): MatchV5 {
  const participants = [...Array(10).keys()].map((i) => ({
    puuid: `m${id}-${i}`,
    teamId: i < 5 ? 100 : 200,
    championId: 1 + i,
    summoner1Id: 4,
    summoner2Id: 12,
    teamPosition: ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'][i % 5],
    win: i < 5,
    kills: 1,
    deaths: 1,
    assists: 1,
    totalMinionsKilled: 100,
    neutralMinionsKilled: 0,
    goldEarned: 10000,
    totalDamageDealtToChampions: 10000,
    item0: 3078,
    item1: 0,
    item2: 0,
    item3: 0,
    item4: 0,
    item5: 0,
    item6: 3340,
  }));
  return {
    metadata: { matchId: id, participants: participants.map((p) => p.puuid) },
    info: {
      gameId: 1,
      gameCreation: 0,
      gameDuration: 1500,
      gameVersion: version,
      queueId: 420,
      participants,
      teams: [],
    },
  };
}

function fakeApi(): { api: RiotApi; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    let body: unknown;
    if (url.includes('/lol/league/v4/challengerleagues/'))
      body = {
        tier: 'CHALLENGER',
        queue: 'RANKED_SOLO_5x5',
        entries: [{ puuid: 'seed-a', leaguePoints: 1, wins: 1, losses: 1 }],
      };
    else if (url.includes('/lol/league/v4/entries/'))
      body = [{ puuid: 'seed-b', leaguePoints: 1, wins: 1, losses: 1 }];
    else if (url.includes('/by-puuid/seed-a/ids')) body = ['EUW1_1', 'EUW1_2'];
    else if (url.includes('/by-puuid/') && url.includes('/ids')) body = ['EUW1_2'];
    else if (url.includes('/lol/match/v5/matches/EUW1_1')) body = fakeMatch('EUW1_1');
    else if (url.includes('/lol/match/v5/matches/EUW1_2')) body = fakeMatch('EUW1_2', '16.16.1.1');
    else {
      return new Response('{"status":{"message":"not found"}}', { status: 404 });
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { api: new RiotApi('RGAPI-test', { fetchImpl, maxRetries: 0 }), calls };
}

describe('Crawler', () => {
  it('seeds from the ladder, expands players, stores matches of the patch and skips others', async () => {
    const { api, calls } = fakeApi();
    const store = new MemoryStore();
    const stored: MatchExtract[] = [];
    const crawler = new Crawler(api, store, (m) => stored.push(m), {
      platform: 'euw1',
      patch: '16.17',
      startTime: 0,
      seeds: [{ tier: 'CHALLENGER' }, { tier: 'EMERALD', division: 'I', pages: 1 }],
      queueTarget: 1,
      sleep: async () => undefined,
    });
    // ladder challenger → player seed-a (2 ids) → match EUW1_1 (stored) → match EUW1_2 (old patch, skipped)
    for (let i = 0; i < 4; i++) await crawler.step();
    expect(calls[0]).toContain('/lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5');
    expect(calls[1]).toContain('/lol/match/v5/matches/by-puuid/seed-a/ids');
    expect(calls[1]).toContain('queue=420');
    expect(store.matches.get('EUW1_1')).toBe('done');
    expect(store.matches.get('EUW1_2')).toBe('skipped');
    expect(stored).toHaveLength(1);
    expect(stored[0]!.patch).toBe('16.17');
    // players of the stored match were added for expansion
    expect(store.players.size).toBeGreaterThan(2);
    const status = crawler.current;
    expect(status.matchesStored).toBe(1);
    expect(status.matchesSkipped).toBe(1);
    expect(status.requests).toBe(4);
  });

  it('stops with an error on a rejected key', async () => {
    const fetchImpl = (async () =>
      new Response('{"status":{"message":"Forbidden"}}', { status: 403 })) as typeof fetch;
    const api = new RiotApi('RGAPI-bad', { fetchImpl, maxRetries: 0 });
    const crawler = new Crawler(api, new MemoryStore(), () => undefined, {
      platform: 'euw1',
      patch: '16.17',
      startTime: 0,
      sleep: async () => undefined,
    });
    crawler.start();
    await new Promise((r) => setTimeout(r, 20));
    expect(crawler.current.phase).toBe('error');
    expect(crawler.current.running).toBe(false);
    expect(crawler.current.lastError).toContain('403');
  });
});
