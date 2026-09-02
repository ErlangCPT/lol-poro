import { aggregatePlayer, championRoleShares, championStatsOf, selectMatches } from './aggregate';
import { detectPremades } from './premade';
import { assignRoles, type RoleCandidate } from './roles';
import { computeTags } from './tags';
import { computeTeamStats } from './team';
import type { LobbyAnalysis, LobbyInput, LobbyPlayer, TeamSide } from './types';

/** Full lobby analysis: stats, roles, premades, tags and team stats. Pure and deterministic. */
export function analyzeLobby(input: LobbyInput): LobbyAnalysis {
  const now = input.now ?? Date.now();
  const championName = (id: number) => input.championInfo(id)?.name ?? `Champion ${id}`;

  // 1. per-player statistics
  const players: LobbyPlayer[] = input.players.map((p) => {
    const stats = p.matches ? aggregatePlayer(p.matches, input.options, now) : undefined;
    const mastery = p.mastery?.find((m) => m.championId === p.championId);
    return {
      cellId: p.cellId,
      team: p.team,
      visibility: p.visibility,
      identity: p.identity,
      championId: p.championId,
      role: p.assignedPosition ?? 'UNKNOWN',
      roleSource: p.assignedPosition && p.assignedPosition !== 'UNKNOWN' ? 'assigned' : 'none',
      spells: p.spells,
      stats,
      championStats: championStatsOf(stats, p.championId),
      ranked: p.ranked ?? [],
      masteryPoints: mastery?.points,
      masteryLevel: mastery?.level,
      pro: p.pro,
      tags: [],
      error: p.error,
      loading: p.loading,
    };
  });

  // 2. role assignment per team
  for (const team of ['ally', 'enemy'] as TeamSide[]) {
    const members = players.filter((p) => p.team === team);
    const candidates: RoleCandidate[] = members.map((p) => {
      const inputPlayer = input.players.find((ip) => ip.cellId === p.cellId)!;
      const selected = inputPlayer.matches ? selectMatches(inputPlayer.matches, input.options, now) : [];
      return {
        key: p.cellId,
        assigned: inputPlayer.assignedPosition,
        spells: p.spells,
        history: p.stats?.roles ?? [],
        championHistory: championRoleShares(selected, p.championId),
      };
    });
    for (const a of assignRoles(candidates)) {
      const p = players.find((x) => x.cellId === a.key)!;
      p.role = a.role;
      p.roleSource = a.source;
    }
  }

  // 3. premades
  const premades = detectPremades(
    input.players.map((p) => ({ key: p.cellId, team: p.team, puuid: p.identity?.puuid, matches: p.matches })),
    2,
    input.currentGameId,
  );
  for (const p of players) {
    const g = premades.groups.get(p.cellId);
    if (g !== undefined) p.premadeGroup = g;
  }

  // 4. tags
  const allBans = [...input.bans.ally, ...input.bans.enemy];
  for (const p of players) {
    if (!p.stats) continue;
    const inputPlayer = input.players.find((ip) => ip.cellId === p.cellId)!;
    const opposing = players.filter((o) => o.team !== p.team && o.championId > 0);
    const laneOpponent = opposing.find((o) => o.role === p.role && p.role !== 'UNKNOWN');
    p.tags = computeTags({
      role: p.role,
      championId: p.championId,
      identity: p.identity,
      stats: p.stats,
      ranked: p.ranked,
      mastery: inputPlayer.mastery,
      matches: inputPlayer.matches ? selectMatches(inputPlayer.matches, input.options, now) : undefined,
      bans: allBans,
      opposingChampionIds: opposing.map((o) => o.championId),
      laneOpponentChampionId: laneOpponent?.championId,
      championName,
    });
    const pair = premades.pairs.find((pr) => pr.a === p.cellId || pr.b === p.cellId);
    if (pair) {
      p.tags.unshift({
        id: 'premade',
        tone: 'info',
        category: 'meta',
        label: { de: `Premade ${p.premadeGroup ?? ''}`.trim(), en: `Premade ${p.premadeGroup ?? ''}`.trim() },
        reason: {
          de: `Mindestens ${pair.sharedGames} gemeinsame Spiele mit einem Mitspieler`,
          en: `At least ${pair.sharedGames} shared games with a teammate`,
        },
      });
    }
  }

  // 4b. pro players from the local list get a leading tag, with or without match data
  for (const p of players) {
    if (!p.pro) continue;
    p.tags.unshift({
      id: 'pro',
      tone: 'info',
      category: 'meta',
      label: { de: `Pro: ${p.pro}`, en: `Pro: ${p.pro}` },
      reason: {
        de: 'Steht in der lokalen Pro-Spieler-Liste (pros.json in den Poro-Daten)',
        en: 'Listed in the local pro player list (pros.json in the Poro data folder)',
      },
    });
  }

  // 5. team stats
  const ally = computeTeamStats(
    players.filter((p) => p.team === 'ally'),
    input.championInfo,
  );
  const enemy = computeTeamStats(
    players.filter((p) => p.team === 'enemy'),
    input.championInfo,
  );

  return {
    queueId: input.queueId,
    generatedAt: now,
    options: input.options,
    bans: input.bans,
    players,
    teams: { ally, enemy },
  };
}
