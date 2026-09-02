import { describe, expect, it } from 'vitest';
import { computeTeamTags, deriveTraits } from '../team';
import { championInfo } from './fixtures';

describe('deriveTraits', () => {
  it('applies overrides on top of tag heuristics', () => {
    const malphite = deriveTraits(championInfo(54)!);
    expect(malphite).toMatchObject({ frontline: 2, engage: 2, melee: true });
    const ziggs = deriveTraits(championInfo(115)!);
    expect(ziggs).toMatchObject({ siege: 2, waveclear: 2, melee: false, damageType: 'AP' });
    const caitlyn = deriveTraits(championInfo(51)!);
    expect(caitlyn.damageType).toBe('AD');
  });
});

describe('computeTeamTags', () => {
  it('flags a tanky engage composition', () => {
    const traits = [54, 89, 64, 266, 24].map((id) => deriveTraits(championInfo(id)!));
    const ids = computeTeamTags(traits).map((t) => t.id);
    expect(ids).toContain('team-frontline-good');
    expect(ids).toContain('team-engage-good');
    expect(ids).toContain('team-gank-setup');
    expect(ids).toContain('team-melee-high');
  });

  it('flags a squishy poke composition', () => {
    const traits = [115, 51, 40, 1, 18].map((id) => deriveTraits(championInfo(id)!));
    const ids = computeTeamTags(traits).map((t) => t.id);
    expect(ids).toContain('team-frontline-weak');
    expect(ids).toContain('team-siege');
    expect(ids).toContain('team-melee-low');
  });

  it('returns nothing for an empty team', () => {
    expect(computeTeamTags([])).toEqual([]);
  });
});
