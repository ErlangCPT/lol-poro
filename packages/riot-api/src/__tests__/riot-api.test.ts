import { describe, expect, it } from 'vitest';
import { RiotApi } from '../client';
import { normalizeMatchV5 } from '../normalize';
import { RateLimiter, parseRateLimitHeader } from '../rate-limiter';
import { gameIdFromMatchId, platformFromRegion, regionRoute } from '../routing';
import type { MatchV5, MatchV5Participant } from '../types';

describe('routing', () => {
  it('maps LCU regions and platforms', () => {
    expect(platformFromRegion('EUW')).toBe('euw1');
    expect(platformFromRegion('euw1')).toBe('euw1');
    expect(platformFromRegion('NA')).toBe('na1');
    expect(regionRoute('euw1')).toBe('europe');
    expect(regionRoute('na1')).toBe('americas');
    expect(regionRoute('kr')).toBe('asia');
    expect(regionRoute('sg2')).toBe('sea');
    expect(gameIdFromMatchId('EUW1_7969128321')).toBe(7969128321);
  });
});

describe('rate limiter', () => {
  it('parses headers', () => {
    expect(parseRateLimitHeader('100:120,20:1')).toEqual([
      { limit: 100, windowMs: 120000 },
      { limit: 20, windowMs: 1000 },
    ]);
    expect(parseRateLimitHeader(null)).toBeNull();
  });

  it('delays requests beyond the per-second budget', async () => {
    const limiter = new RateLimiter([{ limit: 3, windowMs: 300 }]);
    const start = Date.now();
    for (let i = 0; i < 4; i++) await limiter.acquire('europe');
    // 90% of 3 = 2 immediate requests, the third and fourth wait for the window
    expect(Date.now() - start).toBeGreaterThanOrEqual(250);
  });
});

function participant(
  puuid: string,
  teamId: number,
  championId: number,
  overrides: Partial<MatchV5Participant> = {},
): MatchV5Participant {
  return {
    puuid,
    teamId,
    championId,
    summoner1Id: 4,
    summoner2Id: 14,
    teamPosition: 'MIDDLE',
    win: teamId === 100,
    kills: 4,
    deaths: 2,
    assists: 6,
    totalMinionsKilled: 180,
    neutralMinionsKilled: 10,
    goldEarned: 12000,
    totalDamageDealtToChampions: 20000,
    damageDealtToTurrets: 3000,
    turretKills: 1,
    wardsPlaced: 8,
    wardsKilled: 2,
    visionScore: 25,
    item0: 3020,
    item1: 6653,
    item2: 0,
    item3: 0,
    item4: 0,
    item5: 0,
    item6: 3364,
    perks: {
      statPerks: { offense: 5008, flex: 5008, defense: 5001 },
      styles: [
        {
          description: 'primaryStyle',
          style: 8100,
          selections: [{ perk: 8112 }, { perk: 8139 }, { perk: 8138 }, { perk: 8135 }],
        },
        { description: 'subStyle', style: 8300, selections: [{ perk: 8345 }, { perk: 8347 }] },
      ],
    },
    ...overrides,
  };
}

const match: MatchV5 = {
  metadata: { matchId: 'EUW1_42', participants: [] },
  info: {
    gameId: 42,
    gameCreation: 1_700_000_000_000,
    gameDuration: 1900,
    queueId: 420,
    participants: [
      ...[1, 2, 3, 4, 5].map((i) =>
        participant(`p${i}`, 100, 100 + i, i === 2 ? { summoner2Id: 11, teamPosition: 'JUNGLE' } : {}),
      ),
      ...[6, 7, 8, 9, 10].map((i) => participant(`p${i}`, 200, 100 + i)),
    ],
    teams: [
      { teamId: 100, win: true, objectives: { champion: { kills: 20 } } },
      { teamId: 200, win: false, objectives: { champion: { kills: 10 } } },
    ],
  },
};

describe('normalizeMatchV5', () => {
  it('produces a full summary with runes, items, opponents and team kills', () => {
    const m = normalizeMatchV5(match, 'p3');
    expect(m).toMatchObject({
      gameId: 42,
      queueId: 420,
      win: true,
      teamId: 100,
      championId: 103,
      role: 'MIDDLE',
      cs: 190,
      teamKills: 20,
      trinket: 3364,
    });
    expect(m?.items).toEqual([3020, 6653]);
    expect(m?.runes).toEqual({
      primaryStyle: 8100,
      subStyle: 8300,
      perks: [8112, 8139, 8138, 8135, 8345, 8347],
      shards: [5008, 5008, 5001],
    });
    expect(m?.opponents).toHaveLength(5);
    expect(m?.teammates).toEqual(['p1', 'p2', 'p4', 'p5']);
    expect(normalizeMatchV5(match, 'p2')?.role).toBe('JUNGLE');
  });

  it('converts legacy millisecond durations and unknown players', () => {
    const legacy: MatchV5 = { ...match, info: { ...match.info, gameDuration: 1_900_000 } };
    expect(normalizeMatchV5(legacy, 'p1')?.durationSec).toBe(1900);
    expect(normalizeMatchV5(match, 'nobody')).toBeNull();
  });
});

describe('RiotApi', () => {
  it('retries on 429 using Retry-After and surfaces error messages', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls === 1) return new Response('', { status: 429, headers: { 'retry-after': '0' } });
      return new Response(JSON.stringify({ puuid: 'x', gameName: 'a', tagLine: 'b' }), { status: 200 });
    }) as unknown as typeof fetch;
    const api = new RiotApi('RGAPI-test', {
      fetchImpl,
      limiter: new RateLimiter([{ limit: 100, windowMs: 1000 }]),
    });
    const acc = await api.accountByRiotId('europe', 'a', 'b');
    expect(acc.puuid).toBe('x');
    expect(calls).toBe(2);

    const failing = new RiotApi('RGAPI-test', {
      fetchImpl: (async () =>
        new Response(JSON.stringify({ status: { message: 'Forbidden' } }), {
          status: 403,
        })) as unknown as typeof fetch,
      limiter: new RateLimiter([{ limit: 100, windowMs: 1000 }]),
    });
    await expect(failing.accountByRiotId('europe', 'a', 'b')).rejects.toThrow('Riot API 403: Forbidden');
  });
});
