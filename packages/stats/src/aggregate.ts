import type { Role } from '@poro/core';
import type {
  BanSuggestion,
  ChampionBuildStats,
  ChampionGroup,
  ChampionRoleStats,
  ItemSetStats,
  ItemStats,
  MatchupGroup,
  MatchupStats,
  ParticipantRow,
  RuneSetStats,
  SpellStats,
  Tier,
} from './types';

const round = (v: number, digits = 3) => Math.round(v * 10 ** digits) / 10 ** digits;

/** Lower bound of the Wilson score interval (95 %): ranks small samples below large ones with the same rate. */
export function wilsonLower(wins: number, games: number, z = 1.96): number {
  if (games <= 0) return 0;
  const p = wins / games;
  const denom = 1 + (z * z) / games;
  const centre = p + (z * z) / (2 * games);
  const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * games)) / games);
  return Math.max(0, (centre - spread) / denom);
}

/** Winrate pulled towards 50 % for small samples (Bayesian shrinkage with a prior of `prior` games). */
export function shrunkWinrate(wins: number, games: number, prior = 50): number {
  return (wins + prior * 0.5) / (games + prior);
}

export const TIER_SHARES: Array<[Tier, number]> = [
  ['S', 0.08],
  ['A', 0.17],
  ['B', 0.3],
  ['C', 0.25],
  ['D', 0.2],
];

/**
 * Champion statistics per role. `matches` is the number of crawled matches of the patch; pick and ban rate are
 * relative to it. Tiers are percentiles of the ranking score inside each role among champions with enough games.
 */
export function championStats(
  groups: ChampionGroup[],
  banCounts: Record<number, number>,
  matches: number,
  minGames = 20,
): ChampionRoleStats[] {
  const total = Math.max(1, matches);
  const out: ChampionRoleStats[] = groups
    .filter((g) => g.role !== 'UNKNOWN' && g.games > 0)
    .map((g) => {
      const winrate = g.wins / g.games;
      const pickrate = g.games / total;
      const banrate = (banCounts[g.championId] ?? 0) / total;
      const score = (shrunkWinrate(g.wins, g.games) - 0.5) * 100 + pickrate * 25 + banrate * 10;
      return {
        championId: g.championId,
        role: g.role,
        games: g.games,
        wins: g.wins,
        winrate: round(winrate),
        pickrate: round(pickrate),
        banrate: round(banrate),
        kda: round((g.kills + g.assists) / Math.max(1, g.deaths), 2),
        score: round(score, 2),
        tier: '-',
      };
    });
  const roles = new Set(out.map((c) => c.role));
  for (const role of roles) {
    const ranked = out
      .filter((c) => c.role === role && c.games >= minGames)
      .sort((a, b) => b.score - a.score);
    let index = 0;
    for (const [tier, share] of TIER_SHARES) {
      const count = tier === 'D' ? ranked.length - index : Math.max(1, Math.round(ranked.length * share));
      for (let i = 0; i < count && index < ranked.length; i++, index++) ranked[index]!.tier = tier;
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

export function matchupStats(groups: MatchupGroup[]): MatchupStats[] {
  return groups
    .filter((g) => g.role !== 'UNKNOWN' && g.opponentChampionId > 0 && g.games > 0)
    .map((g) => ({
      championId: g.championId,
      opponentChampionId: g.opponentChampionId,
      role: g.role,
      games: g.games,
      wins: g.wins,
      winrate: round(g.wins / g.games),
      confidence: round(wilsonLower(g.wins, g.games)),
    }));
}

/** Best picks against one enemy champion in a role, ranked by the confident winrate. */
export function counterPicks(
  matchups: MatchupStats[],
  enemyChampionId: number,
  role: Role,
  minGames = 10,
  limit = 5,
): MatchupStats[] {
  return matchups
    .filter((m) => m.opponentChampionId === enemyChampionId && m.role === role && m.games >= minGames)
    .sort((a, b) => b.confidence - a.confidence || b.games - a.games)
    .slice(0, limit);
}

/**
 * Bans worth considering: champions that beat the player's own main champions (reason "counter") first,
 * then the most banned / strongest champions of the patch (reason "meta").
 */
export function banSuggestions(
  champions: ChampionRoleStats[],
  matchups: MatchupStats[],
  myChampionIds: number[],
  role: Role | undefined,
  limit = 6,
  minGames = 10,
): BanSuggestion[] {
  const out: BanSuggestion[] = [];
  const seen = new Set<number>();
  const counters: BanSuggestion[] = [];
  for (const mine of myChampionIds) {
    const bad = matchups
      .filter(
        (m) => m.championId === mine && (!role || m.role === role) && m.games >= minGames && m.winrate < 0.48,
      )
      .sort((a, b) => a.winrate - b.winrate)
      .slice(0, 3);
    for (const m of bad) {
      counters.push({
        championId: m.opponentChampionId,
        reason: 'counter',
        counters: mine,
        role: m.role,
        winrate: round(1 - m.winrate),
        games: m.games,
      });
    }
  }
  counters.sort((a, b) => (b.winrate ?? 0) - (a.winrate ?? 0));
  for (const c of counters) {
    if (seen.has(c.championId) || out.length >= limit) continue;
    seen.add(c.championId);
    out.push(c);
  }
  const meta = [...champions].sort((a, b) => b.banrate - a.banrate || b.score - a.score);
  for (const c of meta) {
    if (out.length >= limit) break;
    if (seen.has(c.championId) || c.banrate <= 0) continue;
    seen.add(c.championId);
    out.push({ championId: c.championId, reason: 'meta', role: c.role, banrate: c.banrate, games: c.games });
  }
  return out;
}

export interface ItemHelpers {
  isBoots: (id: number) => boolean;
  /** legendary / fully upgraded item, not a component or consumable */
  isCompleted: (id: number) => boolean;
}

/** Build statistics for one champion in one role from its participant rows. */
export function buildStats(
  rows: ParticipantRow[],
  helpers: ItemHelpers,
  championId: number,
  role: Role,
): ChampionBuildStats {
  const games = rows.length;
  const coreCount = new Map<string, ItemSetStats>();
  const itemCount = new Map<number, ItemStats>();
  const bootsCount = new Map<number, ItemStats>();
  const runeCount = new Map<string, RuneSetStats>();
  const spellCount = new Map<string, SpellStats>();
  const bump = <T extends { games: number; wins: number }>(
    map: Map<string | number, T>,
    key: string | number,
    make: () => T,
    win: boolean,
  ) => {
    const entry = map.get(key) ?? make();
    entry.games += 1;
    if (win) entry.wins += 1;
    map.set(key, entry);
  };

  for (const r of rows) {
    const completed = r.items.filter((id) => helpers.isCompleted(id) && !helpers.isBoots(id));
    const core = completed.slice(0, 3);
    if (core.length === 3)
      bump(coreCount, core.join(','), () => ({ items: core, games: 0, wins: 0, winrate: 0 }), r.win);
    for (const id of new Set(completed))
      bump(itemCount, id, () => ({ itemId: id, games: 0, wins: 0, winrate: 0, share: 0 }), r.win);
    const boots = r.items.find((id) => helpers.isBoots(id));
    if (boots)
      bump(bootsCount, boots, () => ({ itemId: boots, games: 0, wins: 0, winrate: 0, share: 0 }), r.win);
    if (r.runes) {
      const key = `${r.runes.primaryStyle}|${r.runes.subStyle}|${r.runes.perks.join(',')}|${r.runes.shards.join(',')}`;
      bump(runeCount, key, () => ({ runes: r.runes!, games: 0, wins: 0, winrate: 0 }), r.win);
    }
    const spells = [...r.spells].sort((a, b) => a - b) as [number, number];
    bump(spellCount, spells.join(','), () => ({ spells, games: 0, wins: 0, winrate: 0 }), r.win);
  }
  const finish = <T extends { games: number; wins: number; winrate: number }>(
    list: T[],
    limit: number,
  ): T[] =>
    list
      .map((e) => ({ ...e, winrate: round(e.wins / Math.max(1, e.games)) }))
      .sort((a, b) => b.games - a.games)
      .slice(0, limit);
  const withShare = (list: ItemStats[]) =>
    list.map((i) => ({ ...i, share: round(i.games / Math.max(1, games)) }));
  return {
    championId,
    role,
    games,
    core: finish([...coreCount.values()], 5),
    boots: withShare(finish([...bootsCount.values()], 3)),
    items: withShare(finish([...itemCount.values()], 12)),
    runes: finish([...runeCount.values()], 3),
    spells: finish([...spellCount.values()], 3),
  };
}
