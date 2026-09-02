import { describe, expect, it } from 'vitest';
import { recommendationToPage } from '../runes';
import type { LcuRecommendedPage } from '../types';

const perk = (id: number) => ({ id });

describe('recommendationToPage', () => {
  it('builds 9 perk ids from keystone, perks and shards', () => {
    const rec: LcuRecommendedPage = {
      position: 'MIDDLE',
      keystone: perk(8112),
      perks: [
        perk(8112),
        perk(8126),
        perk(8138),
        perk(8135),
        perk(8345),
        perk(8347),
        perk(5008),
        perk(5008),
        perk(5001),
      ],
      primaryPerkStyleId: 8100,
      secondaryPerkStyleId: 8300,
      summonerSpellIds: [4, 14],
      recommendationId: 'abc',
    };
    const page = recommendationToPage(rec, 'Poro: Zed');
    expect(page.perkIds).toEqual([8112, 8126, 8138, 8135, 8345, 8347, 5008, 5008, 5001]);
    expect(page.spells).toEqual([4, 14]);
    expect(page.position).toBe('MIDDLE');
    expect(page.source).toBe('riot');
  });

  it('prepends a missing keystone and fills default shards', () => {
    const rec: LcuRecommendedPage = {
      position: 'top',
      keystone: perk(8010),
      perks: [perk(9111), perk(9104), perk(8299), perk(8444), perk(8451)],
      primaryPerkStyleId: 8000,
      secondaryPerkStyleId: 8400,
    };
    const page = recommendationToPage(rec, 'Poro: Aatrox');
    expect(page.perkIds).toEqual([8010, 9111, 9104, 8299, 8444, 8451, 5008, 5008, 5001]);
    expect(page.position).toBe('TOP');
    expect(page.spells).toBeUndefined();
  });
});
