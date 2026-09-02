import { roleFromLaneAndRole, type PostGameInput, type PostGameParticipant } from '@poro/core';
import type { LcuGame } from './types';

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Full LCU game (all ten participants, no timeline) → post-game input. `selfPuuid` is the LCU PUUID. */
export function postGameInputFromLcuGame(game: LcuGame, selfPuuid: string, platform: string): PostGameInput {
  const identities = new Map(game.participantIdentities.map((i) => [i.participantId, i.player]));
  const participants: PostGameParticipant[] = game.participants.map((p) => {
    const id = identities.get(p.participantId);
    const s = p.stats;
    const spells: [number, number] = [p.spell1Id, p.spell2Id];
    return {
      participantId: p.participantId,
      puuid: id?.puuid ?? '',
      name: id?.gameName ?? id?.summonerName ?? `Player ${p.participantId}`,
      tagLine: id?.tagLine,
      teamId: p.teamId === 200 ? 200 : 100,
      championId: p.championId,
      role: roleFromLaneAndRole(p.timeline?.lane, p.timeline?.role, spells),
      spells,
      win: s.win,
      kills: s.kills,
      deaths: s.deaths,
      assists: s.assists,
      gold: s.goldEarned,
      cs: num(s.totalMinionsKilled) + num(s.neutralMinionsKilled),
      level: num(s.champLevel),
      damage: {
        total: num(s.totalDamageDealtToChampions),
        physical: num(s.physicalDamageDealtToChampions),
        magic: num(s.magicDamageDealtToChampions),
        true: num(s.trueDamageDealtToChampions),
      },
      damageTaken: num(s.totalDamageTaken),
      damageMitigated: num(s.damageSelfMitigated),
      healing: num(s.totalHeal),
      damageToObjectives: num(s.damageDealtToObjectives),
      damageToTurrets: num(s.damageDealtToTurrets),
      visionScore: num(s.visionScore),
      wardsPlaced: num(s.wardsPlaced),
      wardsKilled: num(s.wardsKilled),
      controlWards: num(s.visionWardsBoughtInGame),
      turretKills: num(s.turretKills),
      ccTime: num(s.timeCCingOthers),
      largestMultiKill: num(s.largestMultiKill),
      firstBlood: !!s.firstBloodKill,
      items: [s.item0, s.item1, s.item2, s.item3, s.item4, s.item5].map(num).filter((id) => id > 0),
    };
  });
  return {
    gameId: game.gameId,
    platform,
    queueId: game.queueId,
    gameCreation: game.gameCreation,
    durationSec: game.gameDuration,
    selfPuuid,
    participants,
  };
}
