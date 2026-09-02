import type { ChampionInfo, MatchSummary } from '../types';

export const NOW = Date.UTC(2026, 8, 1, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

let nextGameId = 1000;

export function makeMatch(overrides: Partial<MatchSummary> = {}): MatchSummary {
  return {
    gameId: nextGameId++,
    queueId: 420,
    gameCreation: NOW - 2 * HOUR,
    durationSec: 1800,
    win: true,
    teamId: 100,
    championId: 50, // Swain
    role: 'MIDDLE',
    spells: [4, 14],
    kills: 6,
    deaths: 4,
    assists: 7,
    cs: 200,
    gold: 12000,
    damageToChampions: 20000,
    damageToTurrets: 3000,
    turretKills: 1,
    wardsPlaced: 8,
    wardsKilled: 2,
    visionScore: 25,
    ...overrides,
  };
}

/** n matches, newest first, `hoursApart` between games */
export function makeMatches(
  n: number,
  overrides: Partial<MatchSummary> | ((i: number) => Partial<MatchSummary>) = {},
): MatchSummary[] {
  return Array.from({ length: n }, (_, i) => {
    const o = typeof overrides === 'function' ? overrides(i) : overrides;
    return makeMatch({ gameCreation: NOW - (i + 1) * 3 * HOUR, ...o });
  });
}

const CHAMPIONS: ChampionInfo[] = [
  {
    id: 50,
    key: 'Swain',
    name: 'Swain',
    tags: ['Mage', 'Fighter'],
    info: { attack: 2, defense: 6, magic: 9, difficulty: 8 },
    attackRange: 525,
  },
  {
    id: 18,
    key: 'Tristana',
    name: 'Tristana',
    tags: ['Marksman', 'Assassin'],
    info: { attack: 9, defense: 3, magic: 5, difficulty: 4 },
    attackRange: 525,
  },
  {
    id: 54,
    key: 'Malphite',
    name: 'Malphite',
    tags: ['Tank', 'Fighter'],
    info: { attack: 5, defense: 9, magic: 7, difficulty: 2 },
    attackRange: 125,
  },
  {
    id: 64,
    key: 'LeeSin',
    name: 'Lee Sin',
    tags: ['Fighter', 'Assassin'],
    info: { attack: 8, defense: 5, magic: 3, difficulty: 6 },
    attackRange: 125,
  },
  {
    id: 89,
    key: 'Leona',
    name: 'Leona',
    tags: ['Tank', 'Support'],
    info: { attack: 4, defense: 8, magic: 3, difficulty: 4 },
    attackRange: 125,
  },
  {
    id: 238,
    key: 'Zed',
    name: 'Zed',
    tags: ['Assassin'],
    info: { attack: 9, defense: 2, magic: 1, difficulty: 7 },
    attackRange: 125,
  },
  {
    id: 115,
    key: 'Ziggs',
    name: 'Ziggs',
    tags: ['Mage'],
    info: { attack: 2, defense: 4, magic: 9, difficulty: 4 },
    attackRange: 550,
  },
  {
    id: 51,
    key: 'Caitlyn',
    name: 'Caitlyn',
    tags: ['Marksman'],
    info: { attack: 8, defense: 2, magic: 2, difficulty: 6 },
    attackRange: 650,
  },
  {
    id: 40,
    key: 'Janna',
    name: 'Janna',
    tags: ['Support', 'Mage'],
    info: { attack: 3, defense: 5, magic: 7, difficulty: 5 },
    attackRange: 550,
  },
  {
    id: 24,
    key: 'Jax',
    name: 'Jax',
    tags: ['Fighter'],
    info: { attack: 7, defense: 5, magic: 7, difficulty: 5 },
    attackRange: 125,
  },
  {
    id: 266,
    key: 'Aatrox',
    name: 'Aatrox',
    tags: ['Fighter', 'Tank'],
    info: { attack: 8, defense: 4, magic: 3, difficulty: 4 },
    attackRange: 175,
  },
  {
    id: 1,
    key: 'Annie',
    name: 'Annie',
    tags: ['Mage'],
    info: { attack: 2, defense: 3, magic: 10, difficulty: 6 },
    attackRange: 625,
  },
];

export function championInfo(id: number): ChampionInfo | undefined {
  return CHAMPIONS.find((c) => c.id === id);
}
