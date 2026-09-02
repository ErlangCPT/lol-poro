import {
  roleFromLaneAndRole,
  roleFromPosition,
  type ChampionMastery,
  type MatchSummary,
  type PlayerIdentity,
  type RankedEntry,
} from '@poro/core';
import type { LcuChampionMastery, LcuGame, LcuRankedStats, LcuSummoner } from './types';

export function normalizeSummoner(s: LcuSummoner): PlayerIdentity {
  return {
    puuid: s.puuid,
    gameName: s.gameName || s.displayName || s.internalName || '',
    tagLine: s.tagLine || '',
    summonerId: s.summonerId,
    level: s.summonerLevel,
    profileIconId: s.profileIconId,
  };
}

export function normalizeRanked(stats: LcuRankedStats | undefined): RankedEntry[] {
  if (!stats) return [];
  const queues = stats.queues?.length ? stats.queues : Object.values(stats.queueMap ?? {});
  return queues
    .filter((q) => q.queueType === 'RANKED_SOLO_5x5' || q.queueType === 'RANKED_FLEX_SR')
    .map((q) => ({
      queue: q.queueType as RankedEntry['queue'],
      tier: q.tier || 'NONE',
      division: q.division || 'NA',
      lp: q.leaguePoints ?? 0,
      wins: q.wins ?? 0,
      losses: q.losses ?? 0,
      previousSeasonTier: q.previousSeasonEndTier || undefined,
      previousSeasonDivision: q.previousSeasonEndDivision || undefined,
    }));
}

export function normalizeMastery(list: LcuChampionMastery[] | undefined): ChampionMastery[] {
  return (list ?? []).map((m) => ({
    championId: m.championId,
    level: m.championLevel,
    points: m.championPoints,
  }));
}

/**
 * Converts one LCU game into the summary of the given player. Works with the abbreviated games of the
 * match list (single participant) and with full games (10 participants, enables team kills and opponents).
 */
export function normalizeGame(game: LcuGame, puuid: string): MatchSummary | null {
  const identities = game.participantIdentities ?? [];
  const identity = identities.find((i) => i.player?.puuid === puuid);
  let participant = identity
    ? game.participants.find((p) => p.participantId === identity.participantId)
    : undefined;
  // Abbreviated match-list games contain exactly one participant (the requested player). Fall back to it
  // only when the identities carry no PUUID at all; a PUUID mismatch means the game belongs to someone else.
  const identitiesHavePuuid = identities.some((i) => !!i.player?.puuid);
  if (!participant && !identitiesHavePuuid && game.participants.length === 1)
    participant = game.participants[0];
  if (!participant) return null;

  const s = participant.stats;
  const spells: [number, number] = [participant.spell1Id, participant.spell2Id];
  const role = roleFromLaneAndRole(participant.timeline?.lane, participant.timeline?.role, spells);
  const full = game.participants.length === 10 && identities.length === 10;
  const teamId = (participant.teamId === 200 ? 200 : 100) as 100 | 200;

  const summary: MatchSummary = {
    gameId: game.gameId,
    queueId: game.queueId,
    gameCreation: game.gameCreation,
    durationSec: game.gameDuration,
    win: !!s.win,
    teamId,
    championId: participant.championId,
    role,
    spells,
    kills: s.kills ?? 0,
    deaths: s.deaths ?? 0,
    assists: s.assists ?? 0,
    cs: (s.totalMinionsKilled ?? 0) + (s.neutralMinionsKilled ?? 0),
    gold: s.goldEarned ?? 0,
    damageToChampions: s.totalDamageDealtToChampions ?? 0,
    damageToTurrets: s.damageDealtToTurrets ?? 0,
    turretKills: s.turretKills ?? 0,
    wardsPlaced: s.wardsPlaced ?? 0,
    wardsKilled: s.wardsKilled ?? 0,
    visionScore: s.visionScore ?? 0,
  };

  const items = [s.item0, s.item1, s.item2, s.item3, s.item4, s.item5].filter(
    (i): i is number => typeof i === 'number' && i > 0,
  );
  if (items.length > 0) summary.items = items;
  if (typeof s.item6 === 'number' && s.item6 > 0) summary.trinket = s.item6;
  const perks = [s.perk0, s.perk1, s.perk2, s.perk3, s.perk4, s.perk5].filter(
    (p): p is number => typeof p === 'number' && p > 0,
  );
  if (perks.length === 6 && typeof s.perkPrimaryStyle === 'number' && typeof s.perkSubStyle === 'number') {
    summary.runes = {
      primaryStyle: s.perkPrimaryStyle,
      subStyle: s.perkSubStyle,
      perks,
      shards: [s.statPerk0, s.statPerk1, s.statPerk2].filter(
        (p): p is number => typeof p === 'number' && p > 0,
      ),
    };
  }

  if (full) {
    const byId = new Map(identities.map((i) => [i.participantId, i.player.puuid]));
    let teamKills = 0;
    const opponents: NonNullable<MatchSummary['opponents']> = [];
    const teammates: string[] = [];
    for (const p of game.participants) {
      const pp = byId.get(p.participantId) ?? '';
      if (p.teamId === participant.teamId) {
        teamKills += p.stats.kills ?? 0;
        if (p.participantId !== participant.participantId) teammates.push(pp);
      } else {
        opponents.push({
          puuid: pp,
          championId: p.championId,
          role: roleFromLaneAndRole(p.timeline?.lane, p.timeline?.role, [p.spell1Id, p.spell2Id]),
        });
      }
    }
    summary.teamKills = teamKills;
    summary.opponents = opponents;
    summary.teammates = teammates;
  }
  return summary;
}

export { roleFromPosition };
