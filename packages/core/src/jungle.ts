import type { LiveTeam } from './objectives';
import type { Localized } from './types';

export interface JungleCamp {
  id: string;
  label: Localized;
  short: string;
  /** first spawn (game seconds) */
  firstSpawn: number;
  /** respawn after clear (game seconds) */
  respawn: number;
}

/** Summoner's Rift camps, season 2026 values: buffs 5:00, small camps 2:15, scuttle 2:30. */
export const JUNGLE_CAMPS: JungleCamp[] = [
  { id: 'blue', label: { de: 'Blauer Buff', en: 'Blue buff' }, short: 'Blue', firstSpawn: 90, respawn: 300 },
  { id: 'gromp', label: { de: 'Gromp', en: 'Gromp' }, short: 'Gromp', firstSpawn: 102, respawn: 135 },
  { id: 'wolves', label: { de: 'Wölfe', en: 'Wolves' }, short: 'Wolves', firstSpawn: 90, respawn: 135 },
  { id: 'raptors', label: { de: 'Raptoren', en: 'Raptors' }, short: 'Raptors', firstSpawn: 90, respawn: 135 },
  { id: 'red', label: { de: 'Roter Buff', en: 'Red buff' }, short: 'Red', firstSpawn: 90, respawn: 300 },
  { id: 'krugs', label: { de: 'Krugs', en: 'Krugs' }, short: 'Krugs', firstSpawn: 102, respawn: 135 },
  {
    id: 'scuttle',
    label: { de: 'Krabbler', en: 'Scuttle crab' },
    short: 'Crab',
    firstSpawn: 210,
    respawn: 150,
  },
];

export interface JungleMark {
  side: LiveTeam;
  campId: string;
  /** game time (s) when the camp was cleared */
  clearedAt: number;
}

export interface JungleTimer extends JungleMark {
  respawnAt: number;
}

/** Sets or clears a manual camp timer (a second click on a running timer removes it). */
export function toggleJungleMark(
  marks: JungleMark[],
  side: LiveTeam,
  campId: string,
  gameTime: number,
): JungleMark[] {
  const existing = marks.find((m) => m.side === side && m.campId === campId);
  const rest = marks.filter((m) => m !== existing);
  if (existing) return rest;
  return [...rest, { side, campId, clearedAt: gameTime }];
}

/** Active timers (respawn still pending); expired marks are dropped. */
export function jungleTimers(
  marks: JungleMark[],
  gameTime: number,
  camps: JungleCamp[] = JUNGLE_CAMPS,
): JungleTimer[] {
  const out: JungleTimer[] = [];
  for (const m of marks) {
    const camp = camps.find((c) => c.id === m.campId);
    if (!camp) continue;
    const respawnAt = m.clearedAt + camp.respawn;
    if (respawnAt <= gameTime) continue;
    out.push({ ...m, respawnAt });
  }
  return out;
}
