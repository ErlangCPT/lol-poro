import {
  analyzeLobby,
  type ChampionInfo,
  type ChampionMastery,
  type LobbyInput,
  type LobbyPlayerInput,
  type MatchSummary,
  type RankedEntry,
  type Role,
} from '@poro/core';
import type { LobbySnapshot } from '@shared/ipc';

/** Deterministic pseudo random numbers so the demo always looks the same. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DemoPlayer {
  name: string;
  team: 'ally' | 'enemy';
  championId: number;
  role: Role;
  spells: [number, number];
  skill: number; // 0..1 influences win rate / kda
  mainChampion?: number;
  hidden?: boolean;
  tier: string;
  division: string;
  lp: number;
  level: number;
  sharedGroup?: number;
}

const HOUR = 60 * 60 * 1000;

function makeMatches(
  p: DemoPlayer,
  seed: number,
  now: number,
  shared: Map<number, number[]>,
): MatchSummary[] {
  const rand = rng(seed);
  const out: MatchSummary[] = [];
  const count = 20 + Math.floor(rand() * 40);
  for (let i = 0; i < count; i++) {
    const win = rand() < 0.35 + p.skill * 0.4;
    const onMain = rand() < 0.55;
    const championId = onMain
      ? (p.mainChampion ?? p.championId)
      : [1, 22, 34, 45, 67, 81, 99, 120][Math.floor(rand() * 8)]!;
    const durationSec = 1500 + Math.floor(rand() * 900);
    const mins = durationSec / 60;
    const gameId = 7_000_000 + seed * 1000 + i;
    const role =
      rand() < 0.85
        ? p.role
        : (['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as Role[])[Math.floor(rand() * 5)]!;
    out.push({
      gameId,
      queueId: rand() < 0.7 ? 420 : 400,
      gameCreation: now - (i + 1) * (2 + rand() * 20) * HOUR,
      durationSec,
      win,
      teamId: rand() < 0.5 ? 100 : 200,
      championId,
      role,
      spells: p.spells,
      kills: Math.round((2 + rand() * 8) * (0.6 + p.skill)),
      deaths: Math.round(2 + rand() * 6 * (1.4 - p.skill)),
      assists: Math.round(3 + rand() * 10),
      cs: Math.round(mins * (p.role === 'UTILITY' ? 1.2 : p.role === 'JUNGLE' ? 5.2 : 5.5 + p.skill * 3)),
      gold: Math.round(mins * (300 + p.skill * 160)),
      damageToChampions: Math.round(mins * (p.role === 'UTILITY' ? 250 : 400 + p.skill * 450)),
      damageToTurrets: Math.round(rand() * 9000),
      turretKills: Math.round(rand() * 3),
      wardsPlaced: Math.round(mins * (p.role === 'UTILITY' ? 1.3 : 0.35)),
      wardsKilled: Math.round(rand() * 5),
      visionScore: Math.round(mins * (p.role === 'UTILITY' ? 2.3 : 0.5 + p.skill * 0.9)),
    });
  }
  if (p.sharedGroup !== undefined) {
    const ids = shared.get(p.sharedGroup) ?? [9_990_001, 9_990_002, 9_990_003];
    shared.set(p.sharedGroup, ids);
    for (const gameId of ids) {
      out.push({ ...out[0]!, gameId, teamId: 100, gameCreation: now - 30 * HOUR, win: true });
    }
  }
  return out;
}

export function buildDemoSnapshot(
  championInfo: (id: number) => ChampionInfo | undefined,
  now = Date.now(),
): LobbySnapshot {
  const players: DemoPlayer[] = [
    {
      name: 'Du#EUW',
      team: 'ally',
      championId: 266,
      role: 'TOP',
      spells: [4, 12],
      skill: 0.6,
      tier: 'PLATINUM',
      division: 'II',
      lp: 45,
      level: 312,
    },
    {
      name: 'JungleDiff#1337',
      team: 'ally',
      championId: 64,
      role: 'JUNGLE',
      spells: [4, 11],
      skill: 0.75,
      mainChampion: 64,
      tier: 'EMERALD',
      division: 'IV',
      lp: 12,
      level: 540,
      sharedGroup: 1,
    },
    {
      name: 'MidOrFeed#EUW',
      team: 'ally',
      championId: 103,
      role: 'MIDDLE',
      spells: [4, 14],
      skill: 0.3,
      mainChampion: 238,
      tier: 'GOLD',
      division: 'I',
      lp: 78,
      level: 201,
      sharedGroup: 1,
    },
    {
      name: '',
      team: 'ally',
      championId: 51,
      role: 'BOTTOM',
      spells: [4, 7],
      skill: 0.5,
      tier: 'NONE',
      division: 'NA',
      lp: 0,
      level: 0,
      hidden: true,
    },
    {
      name: 'WardBot#SUP',
      team: 'ally',
      championId: 412,
      role: 'UTILITY',
      spells: [4, 3],
      skill: 0.55,
      mainChampion: 412,
      tier: 'PLATINUM',
      division: 'IV',
      lp: 3,
      level: 288,
    },
    {
      name: 'Garen Enjoyer#TOP',
      team: 'enemy',
      championId: 86,
      role: 'TOP',
      spells: [4, 12],
      skill: 0.65,
      mainChampion: 86,
      tier: 'PLATINUM',
      division: 'I',
      lp: 60,
      level: 450,
    },
    {
      name: 'xXViXx#EUW',
      team: 'enemy',
      championId: 254,
      role: 'JUNGLE',
      spells: [4, 11],
      skill: 0.45,
      mainChampion: 254,
      tier: 'GOLD',
      division: 'II',
      lp: 20,
      level: 130,
    },
    {
      name: 'Smurfington#0001',
      team: 'enemy',
      championId: 238,
      role: 'MIDDLE',
      spells: [4, 14],
      skill: 0.9,
      mainChampion: 238,
      tier: 'GOLD',
      division: 'III',
      lp: 99,
      level: 41,
    },
    {
      name: 'Jinxed#ADC',
      team: 'enemy',
      championId: 222,
      role: 'BOTTOM',
      spells: [4, 7],
      skill: 0.35,
      mainChampion: 222,
      tier: 'SILVER',
      division: 'I',
      lp: 55,
      level: 620,
      sharedGroup: 2,
    },
    {
      name: 'SunnyD#LEO',
      team: 'enemy',
      championId: 89,
      role: 'UTILITY',
      spells: [4, 14],
      skill: 0.6,
      mainChampion: 89,
      tier: 'PLATINUM',
      division: 'III',
      lp: 31,
      level: 333,
      sharedGroup: 2,
    },
  ];
  const shared = new Map<number, number[]>();
  const inputs: LobbyPlayerInput[] = players.map((p, i) => {
    if (p.hidden) {
      return {
        cellId: i,
        team: p.team,
        visibility: 'hidden',
        championId: p.championId,
        spells: p.spells,
        assignedPosition: p.role,
      };
    }
    const ranked: RankedEntry[] = [
      {
        queue: 'RANKED_SOLO_5x5',
        tier: p.tier,
        division: p.division,
        lp: p.lp,
        wins: 60 + i * 7,
        losses: 50 + Math.round((1 - p.skill) * 40),
        previousSeasonTier: i % 3 === 0 ? 'GOLD' : 'PLATINUM',
      },
    ];
    const mastery: ChampionMastery[] = [
      {
        championId: p.mainChampion ?? p.championId,
        level: 7 + i,
        points: 120_000 + i * 200_000 + (i === 6 ? 1_000_000 : 0),
      },
    ];
    return {
      cellId: i,
      team: p.team,
      visibility: i === 0 ? 'self' : 'visible',
      identity: {
        puuid: `demo-${i}`,
        gameName: p.name.split('#')[0] ?? p.name,
        tagLine: p.name.split('#')[1] ?? '',
        level: p.level,
        profileIconId: 1,
      },
      championId: p.championId,
      assignedPosition: p.team === 'ally' ? p.role : undefined,
      spells: p.spells,
      matches: makeMatches(p, i + 1, now, shared),
      ranked,
      mastery,
    };
  });
  const input: LobbyInput = {
    queueId: 420,
    localPuuid: 'demo-0',
    bans: { ally: [157, 555, 777, 245, 105], enemy: [67, 99, 21, 350, 11] },
    players: inputs,
    options: { windowDays: 30, rankedOnly: false },
    now,
    championInfo,
  };
  return {
    source: 'loading',
    queueId: 420,
    gameId: 123456789,
    updatedAt: now,
    loadingPlayers: 0,
    analysis: analyzeLobby(input),
    message: 'Demo-Daten',
  };
}
