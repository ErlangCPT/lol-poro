import { SR_5V5_QUEUES, roleFromPosition, type RuneSet } from '@poro/core';
import type { MatchV5, MatchV5Participant } from '@poro/riot-api';
import type { MatchExtract, ParticipantRow } from './types';

/** "16.17.712.1234" → "16.17" */
export function patchOf(gameVersion: string | undefined): string {
  if (!gameVersion) return '';
  const parts = gameVersion.split('.');
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : gameVersion;
}

/** Data Dragon "16.17.1" → "16.17" */
export function patchOfDataDragon(version: string | undefined): string {
  return patchOf(version);
}

const MIN_DURATION_SEC = 600;

function runesOf(p: MatchV5Participant): RuneSet | undefined {
  const perks = p.perks;
  if (!perks?.styles?.length) return undefined;
  const primary = perks.styles.find((s) => s.description === 'primaryStyle') ?? perks.styles[0];
  const sub = perks.styles.find((s) => s.description === 'subStyle') ?? perks.styles[1];
  if (!primary || !sub) return undefined;
  const ids = [...primary.selections.map((s) => s.perk), ...sub.selections.map((s) => s.perk)];
  if (ids.length < 6) return undefined;
  return {
    primaryStyle: primary.style,
    subStyle: sub.style,
    perks: ids.slice(0, 6),
    shards: [perks.statPerks.offense, perks.statPerks.flex, perks.statPerks.defense],
  };
}

/**
 * Reduces a Match-V5 match to the rows the statistics need. Returns null for remakes, non-Summoner's-Rift
 * queues and matches without ten participants.
 */
export function extractMatch(match: MatchV5, platform: string): MatchExtract | null {
  const info = match.info;
  if (!SR_5V5_QUEUES.has(info.queueId)) return null;
  const durationSec = info.gameDuration > 100000 ? Math.round(info.gameDuration / 1000) : info.gameDuration;
  if (durationSec < MIN_DURATION_SEC) return null;
  if (info.participants.length !== 10) return null;
  if (info.participants.some((p) => p.gameEndedInEarlySurrender)) return null;
  const patch = patchOf(info.gameVersion);
  if (!patch) return null;

  const roles = info.participants.map((p) => roleFromPosition(p.teamPosition || p.individualPosition));
  const participants: ParticipantRow[] = info.participants.map((p, i) => {
    const role = roles[i]!;
    const opponent = info.participants.find(
      (o, j) => o.teamId !== p.teamId && roles[j] === role && role !== 'UNKNOWN',
    );
    return {
      matchId: match.metadata.matchId,
      platform,
      patch,
      queueId: info.queueId,
      gameCreation: info.gameCreation,
      durationSec,
      teamId: p.teamId,
      championId: p.championId,
      role,
      win: p.win,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      cs: (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0),
      gold: p.goldEarned,
      opponentChampionId: opponent?.championId ?? 0,
      items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5].filter((id) => id > 0),
      trinket: p.item6 ?? 0,
      runes: runesOf(p),
      spells: [p.summoner1Id, p.summoner2Id],
    };
  });
  const bans: number[] = [];
  for (const team of info.teams ?? [])
    for (const b of team.bans ?? []) if (b.championId > 0) bans.push(b.championId);
  return {
    matchId: match.metadata.matchId,
    platform,
    patch,
    queueId: info.queueId,
    gameCreation: info.gameCreation,
    durationSec,
    participants,
    bans,
    puuids: match.metadata.participants ?? info.participants.map((p) => p.puuid),
  };
}
