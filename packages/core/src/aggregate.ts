import { RANKED_QUEUES, SR_5V5_QUEUES } from './queues';
import type { AnalysisOptions, ChampionStats, MatchSummary, PlayerStats, Role, RoleShare } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export function kdaRatio(kills: number, deaths: number, assists: number): number {
  return deaths === 0 ? kills + assists : (kills + assists) / deaths;
}

/** Filters matches to the statistic window (queue set + time window) and sorts them newest first. */
export function selectMatches(
  matches: MatchSummary[],
  options: AnalysisOptions,
  now: number,
): MatchSummary[] {
  const queues = options.rankedOnly ? RANKED_QUEUES : SR_5V5_QUEUES;
  const minCreation = now - options.windowDays * DAY_MS;
  return matches
    .filter((m) => queues.has(m.queueId) && m.gameCreation >= minCreation && m.durationSec >= 300)
    .sort((a, b) => b.gameCreation - a.gameCreation);
}

export function aggregatePlayer(
  matches: MatchSummary[],
  options: AnalysisOptions,
  now = Date.now(),
): PlayerStats {
  const selected = selectMatches(matches, options, now);
  const games = selected.length;
  const empty: PlayerStats = {
    windowDays: options.windowDays,
    games: 0,
    wins: 0,
    winrate: 0,
    kda: { kills: 0, deaths: 0, assists: 0, ratio: 0 },
    csPerMin: 0,
    goldPerMin: 0,
    dmgPerMin: 0,
    wardsPerMin: 0,
    visionPerMin: 0,
    turretKillsPerGame: 0,
    turretDamagePerGame: 0,
    perChampion: [],
    roles: [],
    mainRoles: [],
    last12h: { games: 0, wins: 0 },
    streak: null,
  };
  if (games === 0) return empty;

  let wins = 0;
  let kills = 0;
  let deaths = 0;
  let assists = 0;
  let minutes = 0;
  let cs = 0;
  let gold = 0;
  let dmg = 0;
  let wards = 0;
  let vision = 0;
  let turretKills = 0;
  let turretDamage = 0;
  let kpSum = 0;
  let kpGames = 0;
  const perChampion = new Map<
    number,
    { games: number; wins: number; kills: number; deaths: number; assists: number }
  >();
  const perRole = new Map<Role, number>();
  const last12h = { games: 0, wins: 0 };

  for (const m of selected) {
    const mins = m.durationSec / 60;
    minutes += mins;
    if (m.win) wins++;
    kills += m.kills;
    deaths += m.deaths;
    assists += m.assists;
    cs += m.cs;
    gold += m.gold;
    dmg += m.damageToChampions;
    wards += m.wardsPlaced;
    vision += m.visionScore;
    turretKills += m.turretKills;
    turretDamage += m.damageToTurrets;
    if (typeof m.teamKills === 'number' && m.teamKills > 0) {
      kpSum += Math.min(1, (m.kills + m.assists) / m.teamKills);
      kpGames++;
    }
    const c = perChampion.get(m.championId) ?? { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
    c.games++;
    if (m.win) c.wins++;
    c.kills += m.kills;
    c.deaths += m.deaths;
    c.assists += m.assists;
    perChampion.set(m.championId, c);
    if (m.role !== 'UNKNOWN') perRole.set(m.role, (perRole.get(m.role) ?? 0) + 1);
    if (now - m.gameCreation <= 12 * 60 * 60 * 1000) {
      last12h.games++;
      if (m.win) last12h.wins++;
    }
  }

  const champions: ChampionStats[] = [...perChampion.entries()]
    .map(([championId, c]) => ({
      championId,
      games: c.games,
      wins: c.wins,
      winrate: c.wins / c.games,
      kills: c.kills / c.games,
      deaths: c.deaths / c.games,
      assists: c.assists / c.games,
      kdaRatio: kdaRatio(c.kills, c.deaths, c.assists),
    }))
    .sort((a, b) => b.games - a.games || b.wins - a.wins);

  const roleGames = [...perRole.values()].reduce((a, b) => a + b, 0);
  const roles: RoleShare[] = [...perRole.entries()]
    .map(([role, g]) => ({ role, games: g, share: roleGames > 0 ? g / roleGames : 0 }))
    .sort((a, b) => b.games - a.games);
  const mainRoles = roles
    .filter((r) => r.share >= 0.2)
    .slice(0, 2)
    .map((r) => r.role);

  // streak: consecutive identical results starting from the most recent game
  const first = selected[0]!;
  let length = 0;
  for (const m of selected) {
    if (m.win === first.win) length++;
    else break;
  }

  return {
    windowDays: options.windowDays,
    games,
    wins,
    winrate: wins / games,
    kda: {
      kills: kills / games,
      deaths: deaths / games,
      assists: assists / games,
      ratio: kdaRatio(kills, deaths, assists),
    },
    csPerMin: minutes > 0 ? cs / minutes : 0,
    goldPerMin: minutes > 0 ? gold / minutes : 0,
    dmgPerMin: minutes > 0 ? dmg / minutes : 0,
    wardsPerMin: minutes > 0 ? wards / minutes : 0,
    visionPerMin: minutes > 0 ? vision / minutes : 0,
    turretKillsPerGame: turretKills / games,
    turretDamagePerGame: turretDamage / games,
    killParticipation: kpGames >= 5 ? kpSum / kpGames : undefined,
    perChampion: champions,
    roles,
    mainRoles,
    last12h,
    streak: length >= 2 ? { type: first.win ? 'win' : 'loss', length } : null,
  };
}

export function championStatsOf(
  stats: PlayerStats | undefined,
  championId: number,
): ChampionStats | undefined {
  return stats?.perChampion.find((c) => c.championId === championId);
}

/** Role distribution of the games a player played on a specific champion. */
export function championRoleShares(matches: MatchSummary[], championId: number): RoleShare[] {
  const perRole = new Map<Role, number>();
  let total = 0;
  for (const m of matches) {
    if (m.championId !== championId || m.role === 'UNKNOWN') continue;
    perRole.set(m.role, (perRole.get(m.role) ?? 0) + 1);
    total++;
  }
  return [...perRole.entries()]
    .map(([role, games]) => ({ role, games, share: total > 0 ? games / total : 0 }))
    .sort((a, b) => b.games - a.games);
}
