import type { LiveTeam } from './objectives';

/** Per-player input derived from the Live Client player list. */
export interface LivePlayerInput {
  /** unique key, e.g. riot id "Name#TAG" */
  key: string;
  team: LiveTeam;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  wardScore: number;
  /** sum of item prices (count × price) */
  itemGold: number;
}

/** CS / ward score captured at fixed minutes (10, 20) per player key. */
export type Milestones = Record<number, Record<string, { cs: number; wards: number }>>;

export const MILESTONE_MINUTES = [10, 20];

/**
 * Captures the first sample at or after each milestone minute. Returns the same object when nothing changed.
 */
export function recordMilestones(
  prev: Milestones,
  gameTime: number,
  players: LivePlayerInput[],
  minutes = MILESTONE_MINUTES,
): Milestones {
  let next = prev;
  for (const minute of minutes) {
    if (gameTime < minute * 60 || prev[minute]) continue;
    // ignore samples that are far too late (e.g. app started at minute 25): the value would be misleading
    if (gameTime > minute * 60 + 45) continue;
    const sample: Record<string, { cs: number; wards: number }> = {};
    for (const p of players) sample[p.key] = { cs: p.cs, wards: p.wardScore };
    next = { ...next, [minute]: sample };
  }
  return next;
}

export interface LivePlayerStats {
  key: string;
  team: LiveTeam;
  csPerMin: number;
  /** 0..1 share of the team's kills the player took part in; undefined before the first team kill */
  killParticipation?: number;
  cs10?: number;
  cs20?: number;
  wards10?: number;
  wards20?: number;
}

export interface LiveTeamStats {
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  /** item value in gold; clearly an estimate of the gold spent, not the total gold */
  itemGold: number;
}

export function computeLiveStats(
  gameTime: number,
  players: LivePlayerInput[],
  milestones: Milestones,
): { players: LivePlayerStats[]; teams: Record<LiveTeam, LiveTeamStats> } {
  const teams: Record<LiveTeam, LiveTeamStats> = {
    ORDER: { kills: 0, deaths: 0, assists: 0, cs: 0, itemGold: 0 },
    CHAOS: { kills: 0, deaths: 0, assists: 0, cs: 0, itemGold: 0 },
  };
  for (const p of players) {
    const t = teams[p.team];
    t.kills += p.kills;
    t.deaths += p.deaths;
    t.assists += p.assists;
    t.cs += p.cs;
    t.itemGold += p.itemGold;
  }
  const minutes = Math.max(gameTime / 60, 1);
  const out: LivePlayerStats[] = players.map((p) => {
    const teamKills = teams[p.team].kills;
    return {
      key: p.key,
      team: p.team,
      csPerMin: Math.round((p.cs / minutes) * 10) / 10,
      killParticipation: teamKills > 0 ? Math.min(1, (p.kills + p.assists) / teamKills) : undefined,
      cs10: milestones[10]?.[p.key]?.cs,
      cs20: milestones[20]?.[p.key]?.cs,
      wards10: milestones[10]?.[p.key]?.wards,
      wards20: milestones[20]?.[p.key]?.wards,
    };
  });
  return { players: out, teams };
}
