import { describe, expect, it } from 'vitest';
import { assignRoles, roleFromLaneAndRole, roleFromPosition } from '../roles';

describe('roleFromPosition', () => {
  it('maps LCU strings', () => {
    expect(roleFromPosition('top')).toBe('TOP');
    expect(roleFromPosition('utility')).toBe('UTILITY');
    expect(roleFromPosition('middle')).toBe('MIDDLE');
    expect(roleFromPosition('')).toBe('UNKNOWN');
    expect(roleFromPosition(undefined)).toBe('UNKNOWN');
  });
});

describe('roleFromLaneAndRole', () => {
  it('uses smite as strongest signal and lane/role otherwise', () => {
    expect(roleFromLaneAndRole('TOP', 'SOLO', [4, 11])).toBe('JUNGLE');
    expect(roleFromLaneAndRole('BOTTOM', 'DUO_SUPPORT', [4, 14])).toBe('UTILITY');
    expect(roleFromLaneAndRole('BOTTOM', 'DUO_CARRY', [4, 7])).toBe('BOTTOM');
    expect(roleFromLaneAndRole('BOTTOM', 'CARRY', [4, 7])).toBe('BOTTOM');
    expect(roleFromLaneAndRole('BOTTOM', 'SUPPORT', [4, 14])).toBe('UTILITY');
    expect(roleFromLaneAndRole('NONE', 'NONE', [4, 7])).toBe('UNKNOWN');
  });
});

describe('assignRoles', () => {
  it('uses assigned positions when present', () => {
    const result = assignRoles([
      { key: 0, assigned: 'UTILITY', spells: [4, 14], history: [], championHistory: [] },
      { key: 1, assigned: 'TOP', spells: [4, 12], history: [], championHistory: [] },
    ]);
    expect(result).toEqual([
      { key: 0, role: 'UTILITY', source: 'assigned' },
      { key: 1, role: 'TOP', source: 'assigned' },
    ]);
  });

  it('infers jungle from smite and other roles from history without duplicates', () => {
    const result = assignRoles([
      { key: 0, spells: [4, 11], history: [{ role: 'MIDDLE', games: 10, share: 1 }], championHistory: [] },
      { key: 1, spells: [4, 14], history: [{ role: 'MIDDLE', games: 10, share: 1 }], championHistory: [] },
      { key: 2, spells: [4, 12], history: [{ role: 'TOP', games: 10, share: 1 }], championHistory: [] },
      { key: 3, spells: [4, 7], history: [{ role: 'BOTTOM', games: 10, share: 1 }], championHistory: [] },
      { key: 4, spells: [4, 3], history: [{ role: 'UTILITY', games: 10, share: 1 }], championHistory: [] },
    ]);
    const roles = Object.fromEntries(result.map((r) => [r.key, r.role]));
    expect(roles).toEqual({ 0: 'JUNGLE', 1: 'MIDDLE', 2: 'TOP', 3: 'BOTTOM', 4: 'UTILITY' });
    expect(new Set(result.map((r) => r.role)).size).toBe(5);
  });
});
