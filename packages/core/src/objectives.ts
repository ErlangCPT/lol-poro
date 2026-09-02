import type { Localized } from './types';

export type LiveTeam = 'ORDER' | 'CHAOS';

/** Spawn rules in game seconds. Season 2026 (patch 26.x): grubs once at 8:00, herald 15:00, baron 20:00, no Atakhan. */
export interface ObjectiveRules {
  dragon: { firstSpawn: number; respawn: number };
  elder: { afterSoul: number; respawn: number };
  grubs: { spawn: number; despawn: number; count: number };
  herald: { spawn: number; despawn: number };
  baron: { spawn: number; respawn: number };
  inhibitor: { respawn: number };
}

export const OBJECTIVE_RULES: ObjectiveRules = {
  dragon: { firstSpawn: 300, respawn: 300 },
  elder: { afterSoul: 360, respawn: 360 },
  grubs: { spawn: 480, despawn: 885, count: 3 },
  herald: { spawn: 900, despawn: 1185 },
  baron: { spawn: 1200, respawn: 360 },
  inhibitor: { respawn: 300 },
};

/** The subset of a Live Client event the objective model needs. */
export interface ObjectiveEventInput {
  EventID: number;
  EventName: string;
  EventTime: number;
  KillerName?: string;
  DragonType?: string;
  Stolen?: string;
  TurretKilled?: string;
  InhibKilled?: string;
  InhibRespawned?: string;
}

export type ObjectiveKind = 'dragon' | 'elder' | 'grubs' | 'herald' | 'baron' | 'inhibitor';
export type ObjectiveStatus = 'upcoming' | 'alive' | 'respawning' | 'gone';

export interface ObjectiveTimer {
  id: string;
  kind: ObjectiveKind;
  label: Localized;
  status: ObjectiveStatus;
  /** game time (s) of the next spawn while upcoming / respawning */
  spawnAt?: number;
  /** game time (s) when it leaves the map for good (grubs, herald) */
  despawnAt?: number;
  /** owner (inhibitors) or the team that took it last */
  team?: LiveTeam;
  detail?: Localized;
}

export interface TeamObjectiveScore {
  kills: number;
  turrets: number;
  dragons: string[];
  grubs: number;
  heralds: number;
  barons: number;
  inhibitors: number;
}

export interface ObjectiveState {
  timers: ObjectiveTimer[];
  score: Record<LiveTeam, TeamObjectiveScore>;
  /** the element of the rift once the third dragon is known */
  soulType?: string;
  soul?: LiveTeam;
}

const ELDER_NAME: Localized = { de: 'Ältester Drache', en: 'Elder dragon' };

const DRAGON_NAMES: Record<string, Localized> = {
  Fire: { de: 'Infernodrache', en: 'Infernal drake' },
  Earth: { de: 'Bergdrache', en: 'Mountain drake' },
  Water: { de: 'Ozeandrache', en: 'Ocean drake' },
  Air: { de: 'Wolkendrache', en: 'Cloud drake' },
  Hextech: { de: 'Hextech-Drache', en: 'Hextech drake' },
  Chemtech: { de: 'Chemtech-Drache', en: 'Chemtech drake' },
  Elder: ELDER_NAME,
};

export function dragonName(type: string | undefined): Localized {
  return (type ? DRAGON_NAMES[type] : undefined) ?? { de: 'Drache', en: 'Dragon' };
}

const LANE_NAMES: Record<string, Localized> = {
  L: { de: 'Top', en: 'Top' },
  C: { de: 'Mid', en: 'Mid' },
  R: { de: 'Bot', en: 'Bot' },
};

/** "Barracks_T1_C1" → owner ORDER, lane mid. */
export function parseStructureName(name: string): { team: LiveTeam; lane: Localized } | null {
  const m = /_T([12])_([LCR])/.exec(name);
  if (!m) return null;
  return { team: m[1] === '1' ? 'ORDER' : 'CHAOS', lane: LANE_NAMES[m[2] ?? ''] ?? { de: '?', en: '?' } };
}

/** Team from a minion or structure killer name such as "Minion_T100L1S12" or "Turret_T2_L_03_A". */
export function teamFromUnitName(name: string | undefined): LiveTeam | undefined {
  if (!name) return undefined;
  if (/_T100|_T1_/.test(name)) return 'ORDER';
  if (/_T200|_T2_/.test(name)) return 'CHAOS';
  return undefined;
}

const other = (team: LiveTeam): LiveTeam => (team === 'ORDER' ? 'CHAOS' : 'ORDER');

function emptyScore(): TeamObjectiveScore {
  return { kills: 0, turrets: 0, dragons: [], grubs: 0, heralds: 0, barons: 0, inhibitors: 0 };
}

/**
 * Derives objective timers and the objective score from the game events seen so far.
 * `teamOf` resolves a killer name (player) to a team; unit names are parsed here.
 */
export function computeObjectives(
  events: ObjectiveEventInput[],
  gameTime: number,
  teamOf: (killerName: string | undefined) => LiveTeam | undefined,
  rules: ObjectiveRules = OBJECTIVE_RULES,
): ObjectiveState {
  const sorted = [...events].sort((a, b) => a.EventTime - b.EventTime || a.EventID - b.EventID);
  const score: Record<LiveTeam, TeamObjectiveScore> = { ORDER: emptyScore(), CHAOS: emptyScore() };
  const killer = (e: ObjectiveEventInput) => teamOf(e.KillerName) ?? teamFromUnitName(e.KillerName);

  let lastDragonKill: number | undefined;
  let lastDragonType: string | undefined;
  let soulType: string | undefined;
  let soul: LiveTeam | undefined;
  let soulAt: number | undefined;
  let grubsKilled = 0;
  let heraldKilled = false;
  let lastBaronKill: number | undefined;
  const inhibsDown = new Map<string, { at: number; owner: LiveTeam; lane: Localized }>();
  let elementalKills = 0;

  for (const e of sorted) {
    const team = killer(e);
    switch (e.EventName) {
      case 'ChampionKill':
        if (team) score[team].kills += 1;
        break;
      case 'TurretKilled': {
        const owner = teamFromUnitName(e.TurretKilled);
        const by = team ?? (owner ? other(owner) : undefined);
        if (by) score[by].turrets += 1;
        break;
      }
      case 'InhibKilled': {
        const parsed = e.InhibKilled ? parseStructureName(e.InhibKilled) : null;
        if (parsed) {
          inhibsDown.set(e.InhibKilled!, { at: e.EventTime, owner: parsed.team, lane: parsed.lane });
          score[other(parsed.team)].inhibitors += 1;
        }
        break;
      }
      case 'InhibRespawned':
        if (e.InhibRespawned) inhibsDown.delete(e.InhibRespawned);
        break;
      case 'DragonKill': {
        lastDragonKill = e.EventTime;
        lastDragonType = e.DragonType;
        if (team) score[team].dragons.push(e.DragonType ?? 'Unknown');
        if (e.DragonType !== 'Elder') {
          elementalKills += 1;
          if (elementalKills === 3) soulType = e.DragonType;
          if (team && !soul && score[team].dragons.filter((d) => d !== 'Elder').length >= 4) {
            soul = team;
            soulAt = e.EventTime;
          }
        }
        break;
      }
      case 'HordeKill':
        grubsKilled += 1;
        if (team) score[team].grubs += 1;
        break;
      case 'HeraldKill':
        heraldKilled = true;
        if (team) score[team].heralds += 1;
        break;
      case 'BaronKill':
        lastBaronKill = e.EventTime;
        if (team) score[team].barons += 1;
        break;
      default:
        break;
    }
  }

  const timers: ObjectiveTimer[] = [];

  // Dragon / Elder
  {
    const elder = soul !== undefined;
    const kind: ObjectiveKind = elder ? 'elder' : 'dragon';
    let spawnAt: number;
    if (lastDragonKill === undefined) spawnAt = rules.dragon.firstSpawn;
    else if (elder && soulAt !== undefined && lastDragonKill <= soulAt)
      spawnAt = soulAt + rules.elder.afterSoul;
    else spawnAt = lastDragonKill + (elder ? rules.elder.respawn : rules.dragon.respawn);
    const status: ObjectiveStatus =
      gameTime < spawnAt ? (lastDragonKill === undefined ? 'upcoming' : 'respawning') : 'alive';
    const label = elder ? ELDER_NAME : { de: 'Drache', en: 'Dragon' };
    let detail: Localized | undefined;
    if (elder) detail = { de: `Soul: ${dragonName(soulType).de}`, en: `Soul: ${dragonName(soulType).en}` };
    else if (soulType)
      detail = { de: `Rift: ${dragonName(soulType).de}`, en: `Rift: ${dragonName(soulType).en}` };
    else if (lastDragonType)
      detail = {
        de: `zuletzt ${dragonName(lastDragonType).de}`,
        en: `last ${dragonName(lastDragonType).en}`,
      };
    timers.push({
      id: 'dragon',
      kind,
      label,
      status,
      spawnAt: status === 'alive' ? undefined : spawnAt,
      detail,
    });
  }

  // Voidgrubs (one camp per game)
  {
    const remaining = Math.max(0, rules.grubs.count - grubsKilled);
    let status: ObjectiveStatus;
    if (remaining === 0 || gameTime >= rules.grubs.despawn) status = 'gone';
    else if (gameTime < rules.grubs.spawn) status = 'upcoming';
    else status = 'alive';
    timers.push({
      id: 'grubs',
      kind: 'grubs',
      label: { de: 'Leerenbruten', en: 'Voidgrubs' },
      status,
      spawnAt: status === 'upcoming' ? rules.grubs.spawn : undefined,
      despawnAt: status === 'alive' ? rules.grubs.despawn : undefined,
      detail:
        status === 'gone'
          ? {
              de: `${score.ORDER.grubs} : ${score.CHAOS.grubs}`,
              en: `${score.ORDER.grubs} : ${score.CHAOS.grubs}`,
            }
          : status === 'alive' && grubsKilled > 0
            ? { de: `${remaining} übrig`, en: `${remaining} left` }
            : undefined,
    });
  }

  // Rift Herald (no respawn)
  {
    let status: ObjectiveStatus;
    if (heraldKilled || gameTime >= rules.herald.despawn) status = 'gone';
    else if (gameTime < rules.herald.spawn) status = 'upcoming';
    else status = 'alive';
    timers.push({
      id: 'herald',
      kind: 'herald',
      label: { de: 'Herold', en: 'Rift Herald' },
      status,
      spawnAt: status === 'upcoming' ? rules.herald.spawn : undefined,
      despawnAt: status === 'alive' ? rules.herald.despawn : undefined,
      team: heraldKilled
        ? score.ORDER.heralds
          ? 'ORDER'
          : score.CHAOS.heralds
            ? 'CHAOS'
            : undefined
        : undefined,
    });
  }

  // Baron
  {
    const spawnAt = lastBaronKill === undefined ? rules.baron.spawn : lastBaronKill + rules.baron.respawn;
    const status: ObjectiveStatus =
      gameTime < spawnAt ? (lastBaronKill === undefined ? 'upcoming' : 'respawning') : 'alive';
    timers.push({
      id: 'baron',
      kind: 'baron',
      label: { de: 'Baron', en: 'Baron' },
      status,
      spawnAt: status === 'alive' ? undefined : spawnAt,
    });
  }

  // Inhibitors currently down
  for (const [name, inhib] of inhibsDown) {
    const spawnAt = inhib.at + rules.inhibitor.respawn;
    if (gameTime >= spawnAt) continue;
    timers.push({
      id: `inhib-${name}`,
      kind: 'inhibitor',
      label: { de: `Inhibitor ${inhib.lane.de}`, en: `Inhibitor ${inhib.lane.en}` },
      status: 'respawning',
      spawnAt,
      team: inhib.owner,
    });
  }

  return { timers, score, soulType, soul };
}

/** 754 → "12:34" */
export function formatGameTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
