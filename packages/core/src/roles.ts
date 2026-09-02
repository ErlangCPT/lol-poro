import { ROLES, type Role, type RoleShare } from './types';

export const SPELL_SMITE = 11;
export const SPELL_FLASH = 4;
export const SPELL_TELEPORT = 12;
export const SPELL_HEAL = 7;
export const SPELL_EXHAUST = 3;
export const SPELL_IGNITE = 14;

/** Maps LCU/Riot position strings ("top", "utility", "MIDDLE", ...) to a Role. */
export function roleFromPosition(position: string | undefined | null): Role {
  if (!position) return 'UNKNOWN';
  switch (position.toUpperCase()) {
    case 'TOP':
      return 'TOP';
    case 'JUNGLE':
    case 'JGL':
      return 'JUNGLE';
    case 'MIDDLE':
    case 'MID':
      return 'MIDDLE';
    case 'BOTTOM':
    case 'BOT':
    case 'ADC':
      return 'BOTTOM';
    case 'UTILITY':
    case 'SUPPORT':
    case 'SUP':
      return 'UTILITY';
    default:
      return 'UNKNOWN';
  }
}

/** Maps the legacy lane/role pair of the LCU match history timeline to a Role. */
export function roleFromLaneAndRole(
  lane: string | undefined,
  role: string | undefined,
  spells?: [number, number],
): Role {
  const l = (lane ?? '').toUpperCase();
  const r = (role ?? '').toUpperCase();
  if (spells && (spells[0] === SPELL_SMITE || spells[1] === SPELL_SMITE)) return 'JUNGLE';
  if (l === 'TOP') return 'TOP';
  if (l === 'JUNGLE') return 'JUNGLE';
  if (l === 'MIDDLE' || l === 'MID') return 'MIDDLE';
  // The LCU reports "SUPPORT"/"CARRY" in newer games and "DUO_SUPPORT"/"DUO_CARRY" in older ones.
  if (r.includes('SUPPORT')) return 'UTILITY';
  if (l === 'BOTTOM' || l === 'BOT') return 'BOTTOM';
  if (r.includes('CARRY')) return 'BOTTOM';
  return 'UNKNOWN';
}

export interface RoleCandidate {
  key: number;
  assigned?: Role;
  spells: [number, number];
  /** role distribution of this player's recent games */
  history: RoleShare[];
  /** role distribution of this player's recent games on the champion they play now */
  championHistory: RoleShare[];
}

export interface RoleAssignment {
  key: number;
  role: Role;
  source: 'assigned' | 'inferred' | 'none';
}

function shareOf(shares: RoleShare[], role: Role): number {
  return shares.find((s) => s.role === role)?.share ?? 0;
}

function score(c: RoleCandidate, role: Role): number {
  let s = 0;
  if (c.assigned && c.assigned !== 'UNKNOWN') s += c.assigned === role ? 10 : -2;
  const hasSmite = c.spells.includes(SPELL_SMITE);
  if (hasSmite) s += role === 'JUNGLE' ? 6 : -3;
  else if (role === 'JUNGLE') s -= 4;
  if (role === 'UTILITY' && (c.spells.includes(SPELL_HEAL) || c.spells.includes(SPELL_EXHAUST))) s += 0.5;
  if (role === 'TOP' && c.spells.includes(SPELL_TELEPORT)) s += 0.5;
  s += 4 * shareOf(c.history, role);
  s += 3 * shareOf(c.championHistory, role);
  return s;
}

/**
 * Assigns distinct roles to up to five players of one team by maximising the total score
 * (assigned position > smite > personal history > champion history). Brute force over permutations.
 */
export function assignRoles(candidates: RoleCandidate[]): RoleAssignment[] {
  if (candidates.length === 0) return [];
  const n = Math.min(candidates.length, ROLES.length);
  const players = candidates.slice(0, n);
  let best: { total: number; roles: Role[] } | null = null;
  const used = new Array<boolean>(ROLES.length).fill(false);
  const current: Role[] = [];

  const recurse = (idx: number, total: number) => {
    if (idx === n) {
      if (!best || total > best.total) best = { total, roles: [...current] };
      return;
    }
    const cand = players[idx]!;
    for (let r = 0; r < ROLES.length; r++) {
      if (used[r]) continue;
      used[r] = true;
      current.push(ROLES[r]!);
      recurse(idx + 1, total + score(cand, ROLES[r]!));
      current.pop();
      used[r] = false;
    }
  };
  recurse(0, 0);

  const chosen = best as { total: number; roles: Role[] } | null;
  const result: RoleAssignment[] = players.map((c, i) => {
    const role = chosen?.roles[i] ?? 'UNKNOWN';
    const source: RoleAssignment['source'] = c.assigned && c.assigned !== 'UNKNOWN' ? 'assigned' : 'inferred';
    return { key: c.key, role, source };
  });
  // players beyond five (should not happen) get UNKNOWN
  for (const c of candidates.slice(n)) result.push({ key: c.key, role: 'UNKNOWN', source: 'none' });
  return result;
}

export const ROLE_ORDER: Record<Role, number> = {
  TOP: 0,
  JUNGLE: 1,
  MIDDLE: 2,
  BOTTOM: 3,
  UTILITY: 4,
  UNKNOWN: 5,
};

export const ROLE_LABEL: Record<Role, { de: string; en: string }> = {
  TOP: { de: 'Top', en: 'Top' },
  JUNGLE: { de: 'Jungle', en: 'Jungle' },
  MIDDLE: { de: 'Mid', en: 'Mid' },
  BOTTOM: { de: 'AD Carry', en: 'AD Carry' },
  UTILITY: { de: 'Support', en: 'Support' },
  UNKNOWN: { de: 'Unbekannt', en: 'Unknown' },
};
