import { deriveTraits } from './team';
import type {
  BuildSuggestion,
  ChampionInfo,
  DamageProfile,
  ItemMeta,
  ItemStat,
  MatchSummary,
  MatchupRecord,
  RunePageSuggestion,
} from './types';

/** Default stat shards when a source omits them: adaptive, adaptive, health. */
export const DEFAULT_SHARDS = [5008, 5008, 5001];

/** Rune pages the player used on this champion, most played first. Needs full game data. */
export function personalRunePages(
  matches: MatchSummary[],
  championId: number,
  championName: string,
): RunePageSuggestion[] {
  const groups = new Map<string, { games: number; wins: number; page: RunePageSuggestion }>();
  for (const m of matches) {
    if (m.championId !== championId || !m.runes || m.runes.perks.length < 6) continue;
    const shards = m.runes.shards.length === 3 ? m.runes.shards : DEFAULT_SHARDS;
    const perkIds = [...m.runes.perks.slice(0, 6), ...shards];
    const key = `${m.runes.primaryStyle}-${m.runes.subStyle}-${perkIds.join(',')}`;
    const g = groups.get(key);
    if (g) {
      g.games++;
      if (m.win) g.wins++;
    } else {
      groups.set(key, {
        games: 1,
        wins: m.win ? 1 : 0,
        page: {
          source: 'personal',
          name: `Poro: ${championName}`,
          primaryStyleId: m.runes.primaryStyle,
          subStyleId: m.runes.subStyle,
          perkIds,
          spells: m.spells,
        },
      });
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.games - a.games || b.wins - a.wins)
    .slice(0, 3)
    .map((g) => ({ ...g.page, games: g.games, wins: g.wins }));
}

/** Most frequent final items of the player on this champion. Needs full game data and item metadata. */
export function personalBuild(
  matches: MatchSummary[],
  championId: number,
  itemMeta: (id: number) => ItemMeta | undefined,
): BuildSuggestion | undefined {
  const games = matches.filter((m) => m.championId === championId && m.items && m.items.length > 0);
  if (games.length === 0) return undefined;
  const counts = new Map<number, number>();
  let wins = 0;
  for (const m of games) {
    if (m.win) wins++;
    for (const id of new Set(m.items)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const stats: ItemStat[] = [...counts.entries()]
    .map(([id, n]) => ({ id, games: n, share: n / games.length }))
    .sort((a, b) => b.games - a.games || b.id - a.id);
  const isBoots = (id: number) => {
    const meta = itemMeta(id);
    return !!meta && meta.tags.includes('Boots') && meta.gold >= 800;
  };
  const isCompleted = (id: number) => {
    const meta = itemMeta(id);
    return meta ? meta.completed && meta.gold >= 1000 && !meta.tags.includes('Boots') : false;
  };
  const boots = stats.find((s) => isBoots(s.id));
  const completed = stats.filter((s) => isCompleted(s.id));
  const core = completed.filter((s) => s.share >= 0.4).slice(0, 5);
  const situational = completed.filter((s) => s.share >= 0.15 && !core.includes(s)).slice(0, 6);
  return { source: 'personal', championId, games: games.length, wins, boots, core, situational };
}

/** The player's record against each of the given champions (any opponent, plus direct lane opponent). */
export function matchupRecords(matches: MatchSummary[], opposingChampionIds: number[]): MatchupRecord[] {
  const ids = [...new Set(opposingChampionIds.filter((id) => id > 0))];
  const records = new Map<number, MatchupRecord>(
    ids.map((id) => [id, { championId: id, games: 0, wins: 0, laneGames: 0, laneWins: 0 }]),
  );
  for (const m of matches) {
    if (!m.opponents) continue;
    for (const o of m.opponents) {
      const r = records.get(o.championId);
      if (!r) continue;
      r.games++;
      if (m.win) r.wins++;
      if (o.role !== 'UNKNOWN' && o.role === m.role) {
        r.laneGames++;
        if (m.win) r.laneWins++;
      }
    }
  }
  return ids.map((id) => records.get(id)!);
}

export function teamDamageProfile(
  championIds: number[],
  championInfo: (id: number) => ChampionInfo | undefined,
): DamageProfile {
  let ad = 0;
  let ap = 0;
  let mixed = 0;
  let n = 0;
  for (const id of championIds) {
    const info = id > 0 ? championInfo(id) : undefined;
    if (!info) continue;
    n++;
    const t = deriveTraits(info).damageType;
    if (t === 'AD') ad++;
    else if (t === 'AP') ap++;
    else mixed++;
  }
  const weight = n > 0 ? n : 1;
  return {
    champions: n,
    ad,
    ap,
    mixed,
    adShare: (ad + mixed / 2) / weight,
    apShare: (ap + mixed / 2) / weight,
  };
}
