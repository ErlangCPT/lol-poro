import { describe, expect, it } from 'vitest';
import { matchupRecords, personalBuild, personalRunePages, teamDamageProfile } from '../builds';
import type { ItemMeta } from '../types';
import { championInfo, makeMatches } from './fixtures';

const runesA = {
  primaryStyle: 8100,
  subStyle: 8300,
  perks: [8112, 8126, 8138, 8135, 8345, 8347],
  shards: [5008, 5008, 5001],
};
const runesB = {
  primaryStyle: 8200,
  subStyle: 8100,
  perks: [8229, 8226, 8210, 8237, 8139, 8135],
  shards: [5008, 5008, 5011],
};

describe('personalRunePages', () => {
  it('groups identical pages and sorts by games', () => {
    const matches = makeMatches(7, (i) => ({
      championId: 50,
      runes: i < 5 ? runesA : runesB,
      win: i % 2 === 0,
    }));
    const pages = personalRunePages(matches, 50, 'Swain');
    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({
      source: 'personal',
      games: 5,
      wins: 3,
      primaryStyleId: 8100,
      subStyleId: 8300,
    });
    expect(pages[0]?.perkIds).toEqual([8112, 8126, 8138, 8135, 8345, 8347, 5008, 5008, 5001]);
    expect(pages[0]?.name).toBe('Poro: Swain');
  });

  it('ignores games without rune data or on other champions', () => {
    const matches = [
      ...makeMatches(3, () => ({ championId: 50 })),
      ...makeMatches(2, () => ({ championId: 238, runes: runesA })),
    ];
    expect(personalRunePages(matches, 50, 'Swain')).toEqual([]);
  });
});

const ITEMS: Record<number, ItemMeta> = {
  3020: { id: 3020, name: "Sorcerer's Shoes", gold: 1100, tags: ['Boots'], completed: true },
  1001: { id: 1001, name: 'Boots', gold: 300, tags: ['Boots'], completed: false },
  6653: { id: 6653, name: "Liandry's Torment", gold: 3000, tags: ['Damage'], completed: true },
  3116: { id: 3116, name: "Rylai's", gold: 2600, tags: ['Health'], completed: true },
  4645: { id: 4645, name: 'Shadowflame', gold: 3200, tags: ['Damage'], completed: true },
  1058: { id: 1058, name: 'Needlessly Large Rod', gold: 1250, tags: ['Damage'], completed: false },
  2003: { id: 2003, name: 'Health Potion', gold: 50, tags: ['Consumable'], completed: true },
};

describe('personalBuild', () => {
  it('picks boots, core and situational items by frequency', () => {
    const matches = makeMatches(10, (i) => ({
      championId: 50,
      win: i < 6,
      items: i < 8 ? [3020, 6653, 3116, i < 1 ? 4645 : 1058, 2003] : [1001, 6653, 4645],
    }));
    const build = personalBuild(matches, 50, (id) => ITEMS[id]);
    expect(build).toBeDefined();
    expect(build?.games).toBe(10);
    expect(build?.wins).toBe(6);
    expect(build?.boots?.id).toBe(3020);
    expect(build?.core.map((s) => s.id)).toEqual([6653, 3116]);
    expect(build?.situational.map((s) => s.id)).toEqual([4645]);
  });

  it('returns undefined without item data', () => {
    expect(personalBuild(makeMatches(3), 50, () => undefined)).toBeUndefined();
  });
});

describe('matchupRecords', () => {
  it('counts games and lane games against lobby champions', () => {
    const matches = makeMatches(4, (i) => ({
      role: 'MIDDLE',
      win: i < 2,
      opponents: [
        { puuid: 'a', championId: 238, role: i < 3 ? 'MIDDLE' : 'TOP' },
        { puuid: 'b', championId: 18, role: 'BOTTOM' },
      ],
    }));
    const records = matchupRecords(matches, [238, 18, 999]);
    expect(records.find((r) => r.championId === 238)).toEqual({
      championId: 238,
      games: 4,
      wins: 2,
      laneGames: 3,
      laneWins: 2,
    });
    expect(records.find((r) => r.championId === 18)).toMatchObject({ games: 4, laneGames: 0 });
    expect(records.find((r) => r.championId === 999)).toMatchObject({ games: 0 });
  });
});

describe('teamDamageProfile', () => {
  it('classifies damage types', () => {
    // Ziggs AP, Annie AP, Caitlyn AD, Tristana AD, Malphite AP (magic 7 vs attack 5), Jax mixed (7/7)
    const p = teamDamageProfile([115, 1, 51, 18, 54, 24], championInfo);
    expect(p.champions).toBe(6);
    expect(p.ap).toBe(3);
    expect(p.ad).toBe(2);
    expect(p.mixed).toBe(1);
    expect(p.adShare).toBeCloseTo(2.5 / 6);
  });
});
