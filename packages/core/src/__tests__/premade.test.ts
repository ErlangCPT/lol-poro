import { describe, expect, it } from 'vitest';
import { detectPremades } from '../premade';
import { makeMatch } from './fixtures';

describe('detectPremades', () => {
  it('groups players who share at least two games on the same team', () => {
    const shared = [
      makeMatch({ gameId: 1, teamId: 100 }),
      makeMatch({ gameId: 2, teamId: 200 }),
      makeMatch({ gameId: 3, teamId: 100 }),
    ];
    const a = shared;
    const b = [
      makeMatch({ gameId: 1, teamId: 100 }),
      makeMatch({ gameId: 2, teamId: 200 }),
      makeMatch({ gameId: 99 }),
    ];
    // c played against a in game 3 -> not a premade
    const c = [makeMatch({ gameId: 3, teamId: 200 }), makeMatch({ gameId: 50 })];
    const result = detectPremades([
      { key: 0, team: 'ally', puuid: 'a', matches: a },
      { key: 1, team: 'ally', puuid: 'b', matches: b },
      { key: 2, team: 'ally', puuid: 'c', matches: c },
      { key: 5, team: 'enemy', puuid: 'e', matches: a },
    ]);
    expect(result.groups.get(0)).toBe(1);
    expect(result.groups.get(1)).toBe(1);
    expect(result.groups.has(2)).toBe(false);
    expect(result.groups.has(5)).toBe(false); // other team, never compared
    expect(result.pairs).toEqual([{ a: 0, b: 1, sharedGames: 2 }]);
  });

  it('numbers groups per team independently', () => {
    const g1 = [makeMatch({ gameId: 1 }), makeMatch({ gameId: 2 })];
    const g2 = [makeMatch({ gameId: 7 }), makeMatch({ gameId: 8 })];
    const result = detectPremades([
      { key: 0, team: 'ally', puuid: 'a', matches: g1 },
      { key: 1, team: 'ally', puuid: 'b', matches: g1 },
      { key: 5, team: 'enemy', puuid: 'c', matches: g2 },
      { key: 6, team: 'enemy', puuid: 'd', matches: g2 },
    ]);
    expect(result.groups.get(0)).toBe(1);
    expect(result.groups.get(5)).toBe(1);
  });

  it('ignores duplicate entries and the game being analysed', () => {
    const a = [makeMatch({ gameId: 1 }), makeMatch({ gameId: 1 }), makeMatch({ gameId: 2 })];
    const b = [makeMatch({ gameId: 1 }), makeMatch({ gameId: 1 }), makeMatch({ gameId: 2 })];
    const players = [
      { key: 0, team: 'ally' as const, puuid: 'a', matches: a },
      { key: 1, team: 'ally' as const, puuid: 'b', matches: b },
    ];
    expect(detectPremades(players).pairs).toEqual([{ a: 0, b: 1, sharedGames: 2 }]);
    expect(detectPremades(players, 2, 2).pairs).toEqual([]);
  });

  it('ignores players without data', () => {
    const result = detectPremades([
      { key: 0, team: 'ally', puuid: 'a' },
      { key: 1, team: 'ally', matches: [makeMatch()] },
    ]);
    expect(result.pairs).toEqual([]);
  });
});
