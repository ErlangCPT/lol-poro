import {
  roleFromPosition,
  type PostGameInput,
  type PostGameParticipant,
  type PostGameTimeline,
} from '@poro/core';
import type { MatchV5, MatchV5Timeline } from './types';

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Riot hides some names behind empty strings or numeric ids; those fall back to the champion. */
function displayName(...candidates: Array<string | undefined>): string | undefined {
  return candidates.find((c) => !!c && c.trim().length > 0 && !/^d+$/.test(c.trim()));
}

/** Match-V5 (plus optional timeline) → post-game input. `selfPuuid` is the Riot API PUUID. */
export function postGameInputFromMatchV5(
  match: MatchV5,
  timeline: MatchV5Timeline | undefined,
  selfPuuid: string,
  platform: string,
): PostGameInput {
  const info = match.info;
  const durationSec = info.gameDuration > 100000 ? Math.round(info.gameDuration / 1000) : info.gameDuration;
  const participants: PostGameParticipant[] = info.participants.map((p, i) => ({
    participantId: p.participantId ?? i + 1,
    puuid: p.puuid,
    name: displayName(p.riotIdGameName, p.summonerName) ?? p.championName ?? `Player ${i + 1}`,
    tagLine: p.riotIdTagline,
    teamId: p.teamId === 200 ? 200 : 100,
    championId: p.championId,
    role: roleFromPosition(p.teamPosition || p.individualPosition),
    spells: [p.summoner1Id, p.summoner2Id],
    win: p.win,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    gold: p.goldEarned,
    cs: num(p.totalMinionsKilled) + num(p.neutralMinionsKilled),
    level: num(p.champLevel),
    damage: {
      total: num(p.totalDamageDealtToChampions),
      physical: num(p.physicalDamageDealtToChampions),
      magic: num(p.magicDamageDealtToChampions),
      true: num(p.trueDamageDealtToChampions),
    },
    damageTaken: num(p.totalDamageTaken),
    damageMitigated: num(p.damageSelfMitigated),
    healing: num(p.totalHeal),
    damageToObjectives: num(p.damageDealtToObjectives),
    damageToTurrets: num(p.damageDealtToTurrets),
    visionScore: num(p.visionScore),
    wardsPlaced: num(p.wardsPlaced),
    wardsKilled: num(p.wardsKilled),
    controlWards: num(p.visionWardsBoughtInGame),
    turretKills: num(p.turretKills),
    ccTime: num(p.timeCCingOthers),
    largestMultiKill: num(p.largestMultiKill),
    firstBlood: !!p.firstBloodKill,
    items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5].filter((id) => id > 0),
  }));
  return {
    gameId: info.gameId,
    platform,
    matchId: match.metadata.matchId,
    queueId: info.queueId,
    gameCreation: info.gameCreation,
    durationSec,
    selfPuuid,
    participants,
    timeline: timeline ? timelineFromMatchV5(timeline) : undefined,
  };
}

export function timelineFromMatchV5(timeline: MatchV5Timeline): PostGameTimeline {
  const frames = timeline.info.frames.map((f) => {
    const participants: PostGameTimeline['frames'][number]['participants'] = {};
    for (const pf of Object.values(f.participantFrames)) {
      participants[pf.participantId] = {
        gold: pf.totalGold,
        xp: pf.xp,
        level: pf.level,
        cs: num(pf.minionsKilled) + num(pf.jungleMinionsKilled),
      };
    }
    return { minute: Math.round(f.timestamp / 60000), participants };
  });
  const events: PostGameTimeline['events'] = [];
  for (const f of timeline.info.frames) {
    for (const e of f.events ?? []) {
      if (e.type !== 'CHAMPION_KILL' && e.type !== 'ELITE_MONSTER_KILL' && e.type !== 'BUILDING_KILL')
        continue;
      events.push({
        t: Math.round(e.timestamp / 1000),
        type: e.type,
        killerId: e.killerId,
        victimId: e.victimId,
        assisters: e.assistingParticipantIds,
        monsterType: e.monsterType,
        buildingType: e.buildingType,
        teamId: e.teamId,
      });
    }
  }
  return { frames, events };
}
