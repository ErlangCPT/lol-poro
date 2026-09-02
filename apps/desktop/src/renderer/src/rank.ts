import type { LobbyPlayer, RankedEntry } from '@poro/core';

const TIERS = [
  'IRON',
  'BRONZE',
  'SILVER',
  'GOLD',
  'PLATINUM',
  'EMERALD',
  'DIAMOND',
  'MASTER',
  'GRANDMASTER',
  'CHALLENGER',
];
const DIVISION_STEP: Record<string, number> = { IV: 0, III: 1, II: 2, I: 3 };
const STEP_DIVISION = ['IV', 'III', 'II', 'I'];

/** The entry shown for a player: solo queue when ranked there, otherwise flex. */
export function mainRanked(ranked: RankedEntry[]): RankedEntry | undefined {
  const solo = ranked.find((r) => r.queue === 'RANKED_SOLO_5x5');
  const flex = ranked.find((r) => r.queue === 'RANKED_FLEX_SR');
  if (solo && solo.tier !== 'NONE') return solo;
  if (flex && flex.tier !== 'NONE') return flex;
  return solo ?? flex;
}

/** Linear rank scale: 4 steps per tier, apex tiers without divisions. */
export function rankScore(entry: RankedEntry | undefined): number | undefined {
  if (!entry) return undefined;
  const tier = TIERS.indexOf(entry.tier.toUpperCase());
  if (tier < 0) return undefined;
  const apex = tier >= 7;
  return tier * 4 + (apex ? 0 : (DIVISION_STEP[entry.division] ?? 0));
}

/** Average rank of the players with a rank, e.g. { tier: 'PLATINUM', division: 'IV' }. */
export function averageRank(players: LobbyPlayer[]): { tier: string; division: string } | undefined {
  const scores = players
    .map((p) => rankScore(mainRanked(p.ranked)))
    .filter((s): s is number => s !== undefined);
  if (scores.length === 0) return undefined;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const tierIndex = Math.min(TIERS.length - 1, Math.floor(avg / 4));
  const tier = TIERS[tierIndex] ?? 'IRON';
  const division = tierIndex >= 7 ? 'NA' : (STEP_DIVISION[Math.round(avg - tierIndex * 4)] ?? 'IV');
  return { tier, division };
}
