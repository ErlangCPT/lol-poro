import { describe, expect, it } from 'vitest';
import {
  buildPostGameReport,
  compareToAverage,
  historyEntryFromReport,
  summarizeTrend,
  type PostGameInput,
  type PostGameParticipant,
  type PostGameTimeline,
} from '../postgame';
import type { PlayerStats, Role } from '../types';

function participant(
  id: number,
  teamId: 100 | 200,
  role: Role,
  extra: Partial<PostGameParticipant> = {},
): PostGameParticipant {
  return {
    participantId: id,
    puuid: `p${id}`,
    name: `Player${id}`,
    teamId,
    championId: 100 + id,
    role,
    spells: [4, 12],
    win: teamId === 100,
    kills: 2,
    deaths: 2,
    assists: 4,
    gold: 10000,
    cs: 150,
    level: 14,
    damage: { total: 15000, physical: 10000, magic: 4000, true: 1000 },
    damageTaken: 20000,
    damageMitigated: 8000,
    healing: 1000,
    damageToObjectives: 5000,
    damageToTurrets: 2000,
    visionScore: 20,
    wardsPlaced: 8,
    wardsKilled: 2,
    controlWards: 1,
    turretKills: 1,
    ccTime: 20,
    largestMultiKill: 1,
    firstBlood: false,
    items: [],
    ...extra,
  };
}

const ROLES: Role[] = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];

function tenPlayers(): PostGameParticipant[] {
  const out: PostGameParticipant[] = [];
  for (let i = 0; i < 5; i++) out.push(participant(i + 1, 100, ROLES[i]!));
  for (let i = 0; i < 5; i++) out.push(participant(i + 6, 200, ROLES[i]!));
  return out;
}

function timeline(): PostGameTimeline {
  const frames = [];
  for (let m = 0; m <= 25; m++) {
    const participants: Record<number, { gold: number; xp: number; level: number; cs: number }> = {};
    for (let id = 1; id <= 10; id++) {
      const bonus = id === 3 ? 40 * m : 0; // self (mid, id 3) is ahead
      participants[id] = {
        gold: 500 + 350 * m + bonus,
        xp: 400 * m + bonus,
        level: Math.min(18, 1 + Math.floor(m / 1.5)),
        cs: 7 * m + (id === 3 ? m : 0),
      };
    }
    frames.push({ minute: m, participants });
  }
  return {
    frames,
    events: [
      { t: 200, type: 'CHAMPION_KILL', killerId: 8, victimId: 3, assisters: [] },
      { t: 400, type: 'CHAMPION_KILL', killerId: 3, victimId: 8, assisters: [2] },
      { t: 420, type: 'ELITE_MONSTER_KILL', killerId: 2, assisters: [3], monsterType: 'DRAGON' },
      { t: 700, type: 'ELITE_MONSTER_KILL', killerId: 7, assisters: [], monsterType: 'DRAGON' },
      { t: 800, type: 'ELITE_MONSTER_KILL', killerId: 2, assisters: [], monsterType: 'HORDE' },
      {
        t: 900,
        type: 'BUILDING_KILL',
        killerId: 3,
        assisters: [],
        buildingType: 'TOWER_BUILDING',
        teamId: 200,
      },
      {
        t: 950,
        type: 'BUILDING_KILL',
        killerId: 6,
        assisters: [],
        buildingType: 'TOWER_BUILDING',
        teamId: 100,
      },
      {
        t: 1300,
        type: 'ELITE_MONSTER_KILL',
        killerId: 2,
        assisters: [1, 3, 4, 5],
        monsterType: 'BARON_NASHOR',
      },
      {
        t: 1400,
        type: 'BUILDING_KILL',
        killerId: 1,
        assisters: [3],
        buildingType: 'INHIBITOR_BUILDING',
        teamId: 200,
      },
    ],
  };
}

const input = (withTimeline: boolean): PostGameInput => ({
  gameId: 42,
  platform: 'euw1',
  matchId: 'EUW1_42',
  queueId: 420,
  gameCreation: 1_700_000_000_000,
  durationSec: 1500,
  selfPuuid: 'p3',
  participants: tenPlayers(),
  timeline: withTimeline ? timeline() : undefined,
});

describe('buildPostGameReport', () => {
  it('computes the summary and lane opponent without a timeline', () => {
    const r = buildPostGameReport(input(false));
    expect(r.hasTimeline).toBe(false);
    expect(r.self.participantId).toBe(3);
    expect(r.opponent?.participantId).toBe(8);
    expect(r.allies.map((p) => p.role)).toEqual(ROLES);
    expect(r.summary.csPerMin).toBe(6);
    expect(r.summary.killParticipation).toBe(0.6); // (2+4)/10
    expect(r.summary.dmgShare).toBe(0.2);
    expect(r.summary.goldPerMin).toBe(400);
    expect(r.curves).toBeUndefined();
    expect(r.objectives).toBeUndefined();
  });

  it('derives curves, lane diffs, objectives and kill events from the timeline', () => {
    const r = buildPostGameReport(input(true));
    expect(r.hasTimeline).toBe(true);
    expect(r.curves?.gold).toHaveLength(26);
    expect(r.curves?.gold[10]).toEqual({ minute: 10, self: 4400, opponent: 4000 });
    expect(r.curves?.teamGoldDiff[10]?.diff).toBe(400);
    expect(r.laneDiff).toEqual([
      { at: 10, gold: 400, cs: 10, xp: 400, level: 0 },
      { at: 15, gold: 600, cs: 15, xp: 600, level: 0 },
      { at: 20, gold: 800, cs: 20, xp: 800, level: 0 },
    ]);
    expect(r.objectives).toEqual({
      dragons: { team: 1, enemy: 1, participated: 1 },
      barons: { team: 1, enemy: 0, participated: 1 },
      heralds: { team: 0, enemy: 0, participated: 0 },
      grubs: { team: 1, enemy: 0, participated: 0 },
      turrets: { team: 1, enemy: 1, participated: 1 },
      inhibitors: { team: 1, enemy: 0, participated: 1 },
    });
    expect(r.deaths).toEqual([{ minute: 3.3, killerChampionId: 108 }]);
    expect(r.kills).toEqual([{ minute: 6.7, victimChampionId: 108 }]);
  });

  it('throws when the player is not in the game', () => {
    expect(() => buildPostGameReport({ ...input(false), selfPuuid: 'nope' })).toThrow();
  });
});

describe('history and comparison', () => {
  it('builds a history entry with lane diffs', () => {
    const e = historyEntryFromReport(buildPostGameReport(input(true)));
    expect(e).toMatchObject({
      gameId: 42,
      championId: 103,
      role: 'MIDDLE',
      win: true,
      goldDiff10: 400,
      csDiff10: 10,
      goldDiff15: 600,
      hasTimeline: true,
    });
  });

  it('compares against the own average only with enough games', () => {
    const report = buildPostGameReport(input(false));
    const stats = {
      games: 10,
      csPerMin: 6.8,
      goldPerMin: 410,
      dmgPerMin: 700,
      kda: { kills: 5, deaths: 4, assists: 6, ratio: 2.75 },
      killParticipation: 0.55,
      visionPerMin: 1.1,
      wardsPerMin: 0.4,
    } as unknown as PlayerStats;
    const rows = compareToAverage(report, stats);
    expect(rows.find((r) => r.key === 'csPerMin')).toEqual({ key: 'csPerMin', value: 6, average: 6.8 });
    expect(rows.find((r) => r.key === 'kda')?.average).toBe(2.75);
    expect(compareToAverage(report, { ...stats, games: 2 }).every((r) => r.average === undefined)).toBe(true);
  });

  it('summarises a trend', () => {
    const entries = [1, 2, 3].map((i) => ({
      ...historyEntryFromReport(buildPostGameReport(input(i !== 2))),
      gameId: i,
      win: i !== 3,
    }));
    const t = summarizeTrend(entries);
    expect(t).toMatchObject({
      games: 3,
      wins: 2,
      winrate: 0.667,
      avgCsPerMin: 6,
      avgKda: 3,
      avgGoldDiff10: 400,
    });
    expect(summarizeTrend([]).games).toBe(0);
  });
});
