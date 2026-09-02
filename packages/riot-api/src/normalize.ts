import { roleFromPosition, SPELL_SMITE, type MatchSummary, type Role } from '@poro/core';
import type { MatchV5, MatchV5Participant } from './types';

function roleOf(p: MatchV5Participant): Role {
  if (p.summoner1Id === SPELL_SMITE || p.summoner2Id === SPELL_SMITE) return 'JUNGLE';
  const r = roleFromPosition(p.teamPosition);
  return r !== 'UNKNOWN' ? r : roleFromPosition(p.individualPosition);
}

/** Converts a Match-V5 match into the summary of the given (Riot API) PUUID. Always full data. */
export function normalizeMatchV5(match: MatchV5, puuid: string): MatchSummary | null {
  const info = match.info;
  const me = info.participants.find((p) => p.puuid === puuid);
  if (!me) return null;
  const durationSec = info.gameDuration > 100_000 ? Math.round(info.gameDuration / 1000) : info.gameDuration;
  const teamId = (me.teamId === 200 ? 200 : 100) as 100 | 200;
  const team = info.teams.find((t) => t.teamId === me.teamId);
  const teamKills =
    team?.objectives?.champion?.kills ??
    info.participants.filter((p) => p.teamId === me.teamId).reduce((a, p) => a + (p.kills ?? 0), 0);
  const items = [me.item0, me.item1, me.item2, me.item3, me.item4, me.item5].filter(
    (i) => typeof i === 'number' && i > 0,
  );
  const primary = me.perks?.styles.find((s) => s.description === 'primaryStyle') ?? me.perks?.styles[0];
  const sub = me.perks?.styles.find((s) => s.description === 'subStyle') ?? me.perks?.styles[1];
  const perks = [...(primary?.selections ?? []), ...(sub?.selections ?? [])]
    .map((s) => s.perk)
    .filter((p) => p > 0);

  const summary: MatchSummary = {
    gameId: info.gameId,
    queueId: info.queueId,
    gameCreation: info.gameCreation,
    durationSec,
    win: !!me.win,
    teamId,
    championId: me.championId,
    role: roleOf(me),
    spells: [me.summoner1Id, me.summoner2Id],
    kills: me.kills ?? 0,
    deaths: me.deaths ?? 0,
    assists: me.assists ?? 0,
    cs: (me.totalMinionsKilled ?? 0) + (me.neutralMinionsKilled ?? 0),
    gold: me.goldEarned ?? 0,
    damageToChampions: me.totalDamageDealtToChampions ?? 0,
    damageToTurrets: me.damageDealtToTurrets ?? 0,
    turretKills: me.turretKills ?? 0,
    wardsPlaced: me.wardsPlaced ?? 0,
    wardsKilled: me.wardsKilled ?? 0,
    visionScore: me.visionScore ?? 0,
    teamKills,
    opponents: info.participants
      .filter((p) => p.teamId !== me.teamId)
      .map((p) => ({ puuid: p.puuid, championId: p.championId, role: roleOf(p) })),
    teammates: info.participants
      .filter((p) => p.teamId === me.teamId && p.puuid !== me.puuid)
      .map((p) => p.puuid),
  };
  if (items.length) summary.items = items;
  if (me.item6 > 0) summary.trinket = me.item6;
  if (primary && sub && perks.length === 6 && me.perks?.statPerks) {
    summary.runes = {
      primaryStyle: primary.style,
      subStyle: sub.style,
      perks,
      shards: [me.perks.statPerks.offense, me.perks.statPerks.flex, me.perks.statPerks.defense],
    };
  }
  return summary;
}
