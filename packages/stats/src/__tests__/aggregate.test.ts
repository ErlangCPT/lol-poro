import type { MatchV5, MatchV5Participant } from '@poro/riot-api';
import { describe, expect, it } from 'vitest';
import {
  banSuggestions,
  buildStats,
  championStats,
  counterPicks,
  matchupStats,
  shrunkWinrate,
  wilsonLower,
} from '../aggregate';
import { extractMatch, patchOf } from '../extract';
import type { ChampionGroup, ParticipantRow } from '../types';

const POSITIONS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];

function participant(i: number, teamId: number, extra: Partial<MatchV5Participant> = {}): MatchV5Participant {
  return {
    puuid: `p${i}`,
    teamId,
    championId: 100 + i,
    summoner1Id: 4,
    summoner2Id: 12,
    teamPosition: POSITIONS[i % 5],
    win: teamId === 100,
    kills: 3,
    deaths: 2,
    assists: 5,
    totalMinionsKilled: 150,
    neutralMinionsKilled: 10,
    goldEarned: 11000,
    totalDamageDealtToChampions: 15000,
    item0: 3078,
    item1: 3006,
    item2: 3153,
    item3: 3074,
    item4: 1037,
    item5: 0,
    item6: 3340,
    perks: {
      statPerks: { offense: 5008, flex: 5008, defense: 5001 },
      styles: [
        {
          description: 'primaryStyle',
          style: 8000,
          selections: [{ perk: 8010 }, { perk: 9111 }, { perk: 9104 }, { perk: 8014 }],
        },
        { description: 'subStyle', style: 8400, selections: [{ perk: 8473 }, { perk: 8451 }] },
      ],
    },
    ...extra,
  };
}

function match(id: string, extra: Partial<MatchV5['info']> = {}): MatchV5 {
  const participants = [...Array(5).keys()]
    .map((i) => participant(i, 100))
    .concat([...Array(5).keys()].map((i) => participant(i + 5, 200)));
  return {
    metadata: { matchId: id, participants: participants.map((p) => p.puuid) },
    info: {
      gameId: 1,
      gameCreation: 1_700_000_000_000,
      gameDuration: 1800,
      gameVersion: '16.17.712.1234',
      queueId: 420,
      participants,
      teams: [
        { teamId: 100, win: true, bans: [{ championId: 555, pickTurn: 1 }] },
        { teamId: 200, win: false, bans: [{ championId: 104, pickTurn: 2 }] },
      ],
      ...extra,
    },
  };
}

describe('extractMatch', () => {
  it('extracts rows with lane opponents, runes and bans', () => {
    const e = extractMatch(match('EUW1_1'), 'euw1')!;
    expect(e.patch).toBe('16.17');
    expect(e.participants).toHaveLength(10);
    const top = e.participants[0]!;
    expect(top).toMatchObject({
      championId: 100,
      role: 'TOP',
      opponentChampionId: 105,
      win: true,
      cs: 160,
      trinket: 3340,
    });
    expect(top.items).toEqual([3078, 3006, 3153, 3074, 1037]);
    expect(top.runes).toEqual({
      primaryStyle: 8000,
      subStyle: 8400,
      perks: [8010, 9111, 9104, 8014, 8473, 8451],
      shards: [5008, 5008, 5001],
    });
    expect(e.bans).toEqual([555, 104]);
    expect(e.puuids).toHaveLength(10);
  });
  it('rejects remakes and other queues', () => {
    expect(extractMatch(match('x', { gameDuration: 200 }), 'euw1')).toBeNull();
    expect(extractMatch(match('x', { queueId: 450 }), 'euw1')).toBeNull();
    expect(patchOf('15.1.650.1')).toBe('15.1');
  });
});

describe('championStats', () => {
  it('computes rates, kda and tiers per role', () => {
    const groups: ChampionGroup[] = [...Array(12).keys()].map((i) => ({
      championId: i + 1,
      role: 'MIDDLE' as const,
      games: 100,
      wins: 40 + i * 2,
      kills: 500,
      deaths: 250,
      assists: 500,
    }));
    groups.push({ championId: 99, role: 'TOP', games: 5, wins: 5, kills: 10, deaths: 1, assists: 1 });
    const stats = championStats(groups, { 12: 300, 99: 10 }, 1000, 20);
    const best = stats.find((s) => s.championId === 12)!;
    expect(best).toMatchObject({ winrate: 0.62, pickrate: 0.1, banrate: 0.3, kda: 4, tier: 'S' });
    expect(stats.find((s) => s.championId === 1)!.tier).toBe('D');
    expect(stats.find((s) => s.championId === 99)!.tier).toBe('-');
    expect(stats[0]!.championId).toBe(12);
  });
  it('shrinks small samples', () => {
    expect(shrunkWinrate(5, 5)).toBeLessThan(0.6);
    expect(wilsonLower(60, 100)).toBeGreaterThan(0.5);
    expect(wilsonLower(3, 3)).toBeLessThan(0.5);
  });
});

describe('matchups, counters and bans', () => {
  const groups = [
    { championId: 1, opponentChampionId: 2, role: 'MIDDLE' as const, games: 50, wins: 30 },
    { championId: 3, opponentChampionId: 2, role: 'MIDDLE' as const, games: 40, wins: 22 },
    { championId: 4, opponentChampionId: 2, role: 'MIDDLE' as const, games: 5, wins: 5 },
    { championId: 2, opponentChampionId: 1, role: 'MIDDLE' as const, games: 50, wins: 20 },
    { championId: 7, opponentChampionId: 8, role: 'TOP' as const, games: 30, wins: 10 },
  ];
  const matchups = matchupStats(groups);
  it('ranks counter picks by confident winrate and drops tiny samples', () => {
    const picks = counterPicks(matchups, 2, 'MIDDLE');
    expect(picks.map((p) => p.championId)).toEqual([1, 3]);
    expect(picks[0]!.winrate).toBe(0.6);
  });
  it('suggests bans that counter my champions before meta bans', () => {
    const champions = championStats(
      [
        { championId: 8, role: 'TOP', games: 300, wins: 160, kills: 1, deaths: 1, assists: 1 },
        { championId: 9, role: 'JUNGLE', games: 300, wins: 150, kills: 1, deaths: 1, assists: 1 },
      ],
      { 9: 400, 8: 100 },
      1000,
    );
    const bans = banSuggestions(champions, matchups, [7, 2], undefined, 4);
    expect(bans[0]).toMatchObject({ championId: 8, reason: 'counter', counters: 7, winrate: 0.667 });
    expect(bans[1]).toMatchObject({ championId: 1, reason: 'counter', counters: 2, winrate: 0.6 });
    expect(bans[2]).toMatchObject({ championId: 9, reason: 'meta', banrate: 0.4 });
    expect(bans.map((b) => b.championId)).toEqual([8, 1, 9]);
  });
});

describe('buildStats', () => {
  const row = (items: number[], win: boolean, spells: [number, number] = [4, 12]): ParticipantRow => ({
    matchId: 'm',
    platform: 'euw1',
    patch: '16.17',
    queueId: 420,
    gameCreation: 0,
    durationSec: 1800,
    teamId: 100,
    championId: 1,
    role: 'TOP',
    win,
    kills: 0,
    deaths: 0,
    assists: 0,
    cs: 0,
    gold: 0,
    opponentChampionId: 2,
    items,
    trinket: 3340,
    runes: {
      primaryStyle: 8000,
      subStyle: 8400,
      perks: [8010, 9111, 9104, 8014, 8473, 8451],
      shards: [5008, 5008, 5001],
    },
    spells,
  });
  const helpers = {
    isBoots: (id: number) => id === 3006 || id === 3047,
    isCompleted: (id: number) => id >= 3000 && id !== 3006 && id !== 3047,
  };
  it('finds the core items, boots, runes and spells', () => {
    const rows = [
      row([3078, 3006, 3153, 3074, 1037], true),
      row([3078, 3153, 3074, 3047], true),
      row([3006, 3078, 3153, 3074], false),
      row([3078, 3153, 3071], true, [12, 4]),
    ];
    const b = buildStats(rows, helpers, 1, 'TOP');
    expect(b.games).toBe(4);
    expect(b.core[0]).toEqual({ items: [3078, 3153, 3074], games: 3, wins: 2, winrate: 0.667 });
    expect(b.boots.map((x) => x.itemId)).toEqual([3006, 3047]);
    expect(b.items.find((i) => i.itemId === 3078)).toMatchObject({ games: 4, share: 1 });
    expect(b.items.find((i) => i.itemId === 1037)).toBeUndefined();
    expect(b.runes[0]!.games).toBe(4);
    expect(b.spells[0]).toMatchObject({ spells: [4, 12], games: 4 });
  });
});
