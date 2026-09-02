import type { MatchSummary, TeamSide } from './types';

export interface PremadeCandidate {
  key: number;
  team: TeamSide;
  puuid?: string;
  matches?: MatchSummary[];
}

export interface PremadePair {
  a: number;
  b: number;
  sharedGames: number;
}

export interface PremadeResult {
  /** key -> group number (1..n, numbered per team) */
  groups: Map<number, number>;
  pairs: PremadePair[];
}

/**
 * Detects premade groups: players on the same lobby team who appear together (same game, same team)
 * in at least `minShared` recent games. Works with per-player match lists only (no full game data needed).
 */
export function detectPremades(
  players: PremadeCandidate[],
  minShared = 2,
  excludeGameId?: number,
): PremadeResult {
  const pairs: PremadePair[] = [];
  const parent = new Map<number, number>();
  const find = (k: number): number => {
    let p = parent.get(k) ?? k;
    while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p;
    parent.set(k, p);
    return p;
  };
  const union = (a: number, b: number) => parent.set(find(a), find(b));

  const withData = players.filter((p) => p.puuid && p.matches && p.matches.length > 0);
  for (let i = 0; i < withData.length; i++) {
    const a = withData[i]!;
    const gamesA = new Map<number, 100 | 200>();
    for (const m of a.matches!) if (m.gameId !== excludeGameId) gamesA.set(m.gameId, m.teamId);
    for (let j = i + 1; j < withData.length; j++) {
      const b = withData[j]!;
      if (b.team !== a.team) continue;
      const counted = new Set<number>();
      let shared = 0;
      for (const m of b.matches!) {
        if (counted.has(m.gameId)) continue; // duplicate entries must not inflate the count
        if (gamesA.get(m.gameId) === m.teamId) {
          shared++;
          counted.add(m.gameId);
        }
      }
      if (shared >= minShared) {
        pairs.push({ a: a.key, b: b.key, sharedGames: shared });
        union(a.key, b.key);
      }
    }
  }

  const groups = new Map<number, number>();
  for (const team of ['ally', 'enemy'] as TeamSide[]) {
    const rootToGroup = new Map<number, number>();
    let next = 1;
    for (const p of players.filter((p) => p.team === team)) {
      const inPair = pairs.some((pr) => pr.a === p.key || pr.b === p.key);
      if (!inPair) continue;
      const root = find(p.key);
      let g = rootToGroup.get(root);
      if (g === undefined) {
        g = next++;
        rootToGroup.set(root, g);
      }
      groups.set(p.key, g);
    }
  }
  return { groups, pairs };
}
