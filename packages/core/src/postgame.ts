import { kdaRatio } from './aggregate';
import { ROLE_ORDER } from './roles';
import type { PlayerStats, Role } from './types';

// ---- input (built by the LCU and Riot API adapters) ----

export interface PostGameParticipant {
  participantId: number;
  puuid: string;
  name: string;
  tagLine?: string;
  teamId: 100 | 200;
  championId: number;
  role: Role;
  spells: [number, number];
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  gold: number;
  /** lane minions + neutral monsters */
  cs: number;
  level: number;
  damage: { total: number; physical: number; magic: number; true: number };
  damageTaken: number;
  damageMitigated: number;
  healing: number;
  damageToObjectives: number;
  damageToTurrets: number;
  visionScore: number;
  wardsPlaced: number;
  wardsKilled: number;
  controlWards: number;
  turretKills: number;
  /** seconds of crowd control applied */
  ccTime: number;
  largestMultiKill: number;
  firstBlood: boolean;
  items: number[];
}

export interface PostGameFrameStats {
  gold: number;
  xp: number;
  level: number;
  cs: number;
}

export interface PostGameTimelineFrame {
  minute: number;
  participants: Record<number, PostGameFrameStats>;
}

export interface PostGameEvent {
  /** game seconds */
  t: number;
  type: string;
  killerId?: number;
  victimId?: number;
  assisters?: number[];
  /** DRAGON, BARON_NASHOR, RIFTHERALD, HORDE (voidgrubs) */
  monsterType?: string;
  /** TOWER_BUILDING, INHIBITOR_BUILDING */
  buildingType?: string;
  /** owner of a destroyed building */
  teamId?: number;
}

export interface PostGameTimeline {
  frames: PostGameTimelineFrame[];
  events: PostGameEvent[];
}

export interface PostGameInput {
  gameId: number;
  platform: string;
  matchId?: string;
  queueId: number;
  gameCreation: number;
  durationSec: number;
  selfPuuid: string;
  participants: PostGameParticipant[];
  timeline?: PostGameTimeline;
}

// ---- report ----

export interface StatPoint {
  minute: number;
  self: number;
  opponent?: number;
}

export interface LaneDiff {
  at: number;
  gold: number;
  cs: number;
  xp: number;
  level: number;
}

export interface ObjectiveCount {
  team: number;
  enemy: number;
  /** self was killer or assisted */
  participated: number;
}

export interface PostGameObjectives {
  dragons: ObjectiveCount;
  barons: ObjectiveCount;
  heralds: ObjectiveCount;
  grubs: ObjectiveCount;
  turrets: ObjectiveCount;
  inhibitors: ObjectiveCount;
}

export interface PostGameSummary {
  kdaRatio: number;
  csPerMin: number;
  goldPerMin: number;
  dmgPerMin: number;
  /** share of the team's damage to champions */
  dmgShare: number;
  dmgTakenShare: number;
  killParticipation: number;
  visionPerMin: number;
  wardsPerMin: number;
  teamKills: number;
  teamDamage: number;
}

export interface PostGameReport {
  gameId: number;
  platform: string;
  matchId?: string;
  queueId: number;
  gameCreation: number;
  durationSec: number;
  hasTimeline: boolean;
  win: boolean;
  self: PostGameParticipant;
  opponent?: PostGameParticipant;
  allies: PostGameParticipant[];
  enemies: PostGameParticipant[];
  summary: PostGameSummary;
  /** lane difference against the opponent at 10 / 15 / 20 minutes (timeline only) */
  laneDiff?: LaneDiff[];
  curves?: {
    gold: StatPoint[];
    cs: StatPoint[];
    xp: StatPoint[];
    teamGoldDiff: Array<{ minute: number; diff: number }>;
  };
  objectives?: PostGameObjectives;
  deaths?: Array<{ minute: number; killerChampionId?: number }>;
  kills?: Array<{ minute: number; victimChampionId?: number }>;
}

/** Compact row stored per game for the trend and the history list. */
export interface PostGameHistoryEntry {
  gameId: number;
  platform: string;
  gameCreation: number;
  queueId: number;
  durationSec: number;
  championId: number;
  role: Role;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  csPerMin: number;
  goldPerMin: number;
  dmgPerMin: number;
  dmgShare: number;
  killParticipation: number;
  visionPerMin: number;
  goldDiff10?: number;
  csDiff10?: number;
  xpDiff10?: number;
  goldDiff15?: number;
  hasTimeline: boolean;
}

export type ComparisonKey =
  'csPerMin' | 'goldPerMin' | 'dmgPerMin' | 'visionPerMin' | 'wardsPerMin' | 'kda' | 'killParticipation';

export interface ComparisonRow {
  key: ComparisonKey;
  value: number;
  /** own average over the statistics window; undefined without enough games */
  average?: number;
}

const LANE_DIFF_MINUTES = [10, 15, 20];

const byRole = (a: PostGameParticipant, b: PostGameParticipant) =>
  ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.participantId - b.participantId;

const round = (v: number, digits = 2) => Math.round(v * 10 ** digits) / 10 ** digits;

/** Computes the post-game report for the player identified by `selfPuuid`. Throws when the player is missing. */
export function buildPostGameReport(input: PostGameInput): PostGameReport {
  const self = input.participants.find((p) => p.puuid === input.selfPuuid);
  if (!self) throw new Error('player not part of this game');
  const allies = input.participants.filter((p) => p.teamId === self.teamId).sort(byRole);
  const enemies = input.participants.filter((p) => p.teamId !== self.teamId).sort(byRole);
  const opponent = self.role !== 'UNKNOWN' ? enemies.find((p) => p.role === self.role) : undefined;
  const minutes = Math.max(1, input.durationSec / 60);

  const teamKills = allies.reduce((s, p) => s + p.kills, 0);
  const teamDamage = allies.reduce((s, p) => s + p.damage.total, 0);
  const teamTaken = allies.reduce((s, p) => s + p.damageTaken, 0);
  const summary: PostGameSummary = {
    kdaRatio: round(kdaRatio(self.kills, self.deaths, self.assists)),
    csPerMin: round(self.cs / minutes, 1),
    goldPerMin: Math.round(self.gold / minutes),
    dmgPerMin: Math.round(self.damage.total / minutes),
    dmgShare: teamDamage > 0 ? round(self.damage.total / teamDamage, 3) : 0,
    dmgTakenShare: teamTaken > 0 ? round(self.damageTaken / teamTaken, 3) : 0,
    killParticipation: teamKills > 0 ? round((self.kills + self.assists) / teamKills, 3) : 0,
    visionPerMin: round(self.visionScore / minutes),
    wardsPerMin: round(self.wardsPlaced / minutes),
    teamKills,
    teamDamage,
  };

  const report: PostGameReport = {
    gameId: input.gameId,
    platform: input.platform,
    matchId: input.matchId,
    queueId: input.queueId,
    gameCreation: input.gameCreation,
    durationSec: input.durationSec,
    hasTimeline: !!input.timeline,
    win: self.win,
    self,
    opponent,
    allies,
    enemies,
    summary,
  };

  const tl = input.timeline;
  if (!tl) return report;

  const maxMinute = Math.ceil(input.durationSec / 60);
  const frames = tl.frames.filter((f) => f.minute <= maxMinute + 1).sort((a, b) => a.minute - b.minute);
  const allyIds = new Set(allies.map((p) => p.participantId));
  const gold: StatPoint[] = [];
  const cs: StatPoint[] = [];
  const xp: StatPoint[] = [];
  const teamGoldDiff: Array<{ minute: number; diff: number }> = [];
  const laneDiff: LaneDiff[] = [];
  for (const f of frames) {
    const me = f.participants[self.participantId];
    if (!me) continue;
    const op = opponent ? f.participants[opponent.participantId] : undefined;
    gold.push({ minute: f.minute, self: me.gold, opponent: op?.gold });
    cs.push({ minute: f.minute, self: me.cs, opponent: op?.cs });
    xp.push({ minute: f.minute, self: me.xp, opponent: op?.xp });
    let diff = 0;
    for (const [id, stats] of Object.entries(f.participants))
      diff += allyIds.has(Number(id)) ? stats.gold : -stats.gold;
    teamGoldDiff.push({ minute: f.minute, diff });
    if (op && LANE_DIFF_MINUTES.includes(f.minute)) {
      laneDiff.push({
        at: f.minute,
        gold: me.gold - op.gold,
        cs: me.cs - op.cs,
        xp: me.xp - op.xp,
        level: me.level - op.level,
      });
    }
  }
  report.curves = { gold, cs, xp, teamGoldDiff };
  report.laneDiff = laneDiff;

  const teamOf = new Map(input.participants.map((p) => [p.participantId, p.teamId]));
  const champOf = new Map(input.participants.map((p) => [p.participantId, p.championId]));
  const count = (): ObjectiveCount => ({ team: 0, enemy: 0, participated: 0 });
  const objectives: PostGameObjectives = {
    dragons: count(),
    barons: count(),
    heralds: count(),
    grubs: count(),
    turrets: count(),
    inhibitors: count(),
  };
  const deaths: PostGameReport['deaths'] = [];
  const kills: PostGameReport['kills'] = [];
  const involved = (e: PostGameEvent) =>
    e.killerId === self.participantId || (e.assisters ?? []).includes(self.participantId);
  const credit = (c: ObjectiveCount, takerTeam: number | undefined, e: PostGameEvent) => {
    if (takerTeam === self.teamId) c.team += 1;
    else if (takerTeam !== undefined) c.enemy += 1;
    if (involved(e)) c.participated += 1;
  };
  for (const e of tl.events) {
    if (e.type === 'ELITE_MONSTER_KILL') {
      const taker = e.killerId ? teamOf.get(e.killerId) : e.teamId;
      const bucket =
        e.monsterType === 'DRAGON'
          ? objectives.dragons
          : e.monsterType === 'BARON_NASHOR'
            ? objectives.barons
            : e.monsterType === 'RIFTHERALD'
              ? objectives.heralds
              : e.monsterType === 'HORDE'
                ? objectives.grubs
                : undefined;
      if (bucket) credit(bucket, taker, e);
    } else if (e.type === 'BUILDING_KILL') {
      // teamId is the owner of the building; the other team took it
      const taker =
        e.teamId !== undefined
          ? e.teamId === 100
            ? 200
            : 100
          : e.killerId
            ? teamOf.get(e.killerId)
            : undefined;
      const bucket = e.buildingType === 'INHIBITOR_BUILDING' ? objectives.inhibitors : objectives.turrets;
      credit(bucket, taker, e);
    } else if (e.type === 'CHAMPION_KILL') {
      if (e.victimId === self.participantId)
        deaths.push({
          minute: round(e.t / 60, 1),
          killerChampionId: e.killerId ? champOf.get(e.killerId) : undefined,
        });
      if (e.killerId === self.participantId)
        kills.push({
          minute: round(e.t / 60, 1),
          victimChampionId: e.victimId ? champOf.get(e.victimId) : undefined,
        });
    }
  }
  report.objectives = objectives;
  report.deaths = deaths;
  report.kills = kills;
  return report;
}

export function historyEntryFromReport(report: PostGameReport): PostGameHistoryEntry {
  const at = (minute: number) => report.laneDiff?.find((d) => d.at === minute);
  return {
    gameId: report.gameId,
    platform: report.platform,
    gameCreation: report.gameCreation,
    queueId: report.queueId,
    durationSec: report.durationSec,
    championId: report.self.championId,
    role: report.self.role,
    win: report.win,
    kills: report.self.kills,
    deaths: report.self.deaths,
    assists: report.self.assists,
    csPerMin: report.summary.csPerMin,
    goldPerMin: report.summary.goldPerMin,
    dmgPerMin: report.summary.dmgPerMin,
    dmgShare: report.summary.dmgShare,
    killParticipation: report.summary.killParticipation,
    visionPerMin: report.summary.visionPerMin,
    goldDiff10: at(10)?.gold,
    csDiff10: at(10)?.cs,
    xpDiff10: at(10)?.xp,
    goldDiff15: at(15)?.gold,
    hasTimeline: report.hasTimeline,
  };
}

/** This game against the player's own averages from the statistics window (Phase 1 aggregation). */
export function compareToAverage(report: PostGameReport, stats: PlayerStats | undefined): ComparisonRow[] {
  const enough = !!stats && stats.games >= 3;
  const s = report.summary;
  return [
    { key: 'csPerMin', value: s.csPerMin, average: enough ? round(stats!.csPerMin, 1) : undefined },
    { key: 'goldPerMin', value: s.goldPerMin, average: enough ? Math.round(stats!.goldPerMin) : undefined },
    { key: 'dmgPerMin', value: s.dmgPerMin, average: enough ? Math.round(stats!.dmgPerMin) : undefined },
    { key: 'kda', value: s.kdaRatio, average: enough ? round(stats!.kda.ratio) : undefined },
    {
      key: 'killParticipation',
      value: s.killParticipation,
      average:
        enough && stats!.killParticipation !== undefined ? round(stats!.killParticipation, 3) : undefined,
    },
    { key: 'visionPerMin', value: s.visionPerMin, average: enough ? round(stats!.visionPerMin) : undefined },
    { key: 'wardsPerMin', value: s.wardsPerMin, average: enough ? round(stats!.wardsPerMin) : undefined },
  ];
}

export interface TrendSummary {
  games: number;
  wins: number;
  winrate: number;
  avgCsPerMin: number;
  avgKda: number;
  avgKillParticipation: number;
  /** only games with a timeline */
  avgGoldDiff10?: number;
}

export function summarizeTrend(entries: PostGameHistoryEntry[]): TrendSummary {
  const games = entries.length;
  if (games === 0)
    return { games: 0, wins: 0, winrate: 0, avgCsPerMin: 0, avgKda: 0, avgKillParticipation: 0 };
  const wins = entries.filter((e) => e.win).length;
  const avg = (f: (e: PostGameHistoryEntry) => number) => entries.reduce((s, e) => s + f(e), 0) / games;
  const withDiff = entries.filter((e) => e.goldDiff10 !== undefined);
  return {
    games,
    wins,
    winrate: round(wins / games, 3),
    avgCsPerMin: round(
      avg((e) => e.csPerMin),
      1,
    ),
    avgKda: round(avg((e) => kdaRatio(e.kills, e.deaths, e.assists))),
    avgKillParticipation: round(
      avg((e) => e.killParticipation),
      3,
    ),
    avgGoldDiff10: withDiff.length
      ? Math.round(withDiff.reduce((s, e) => s + (e.goldDiff10 ?? 0), 0) / withDiff.length)
      : undefined,
  };
}
