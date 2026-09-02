import { describe, expect, it } from 'vitest';
import { aggregatePlayer, championRoleShares, selectMatches } from '../aggregate';
import { makeMatch, makeMatches, NOW } from './fixtures';

const opts = { windowDays: 30, rankedOnly: false };
const DAY = 24 * 60 * 60 * 1000;

describe('selectMatches', () => {
  it('keeps only SR 5v5 games inside the window, newest first', () => {
    const matches = [
      makeMatch({ queueId: 450, gameCreation: NOW - DAY }), // ARAM -> out
      makeMatch({ queueId: 420, gameCreation: NOW - 40 * DAY }), // too old -> out
      makeMatch({ queueId: 400, gameCreation: NOW - 5 * DAY }),
      makeMatch({ queueId: 420, gameCreation: NOW - DAY }),
      makeMatch({ queueId: 420, gameCreation: NOW - DAY, durationSec: 200 }), // remake -> out
    ];
    const selected = selectMatches(matches, opts, NOW);
    expect(selected.map((m) => m.queueId)).toEqual([420, 400]);
  });

  it('respects rankedOnly', () => {
    const matches = [makeMatch({ queueId: 400 }), makeMatch({ queueId: 420 }), makeMatch({ queueId: 440 })];
    expect(selectMatches(matches, { ...opts, rankedOnly: true }, NOW)).toHaveLength(2);
  });
});

describe('aggregatePlayer', () => {
  it('returns an empty stats object without games', () => {
    const s = aggregatePlayer([], opts, NOW);
    expect(s.games).toBe(0);
    expect(s.streak).toBeNull();
    expect(s.perChampion).toEqual([]);
  });

  it('computes winrate, kda, per-minute values and streaks', () => {
    const matches = makeMatches(10, (i) => ({
      win: i < 4,
      kills: 10,
      deaths: 2,
      assists: 5,
      cs: 300,
      durationSec: 1800,
    }));
    const s = aggregatePlayer(matches, opts, NOW);
    expect(s.games).toBe(10);
    expect(s.wins).toBe(4);
    expect(s.winrate).toBeCloseTo(0.4);
    expect(s.kda.kills).toBe(10);
    expect(s.kda.ratio).toBeCloseTo(7.5);
    expect(s.csPerMin).toBeCloseTo(10);
    expect(s.streak).toEqual({ type: 'win', length: 4 });
  });

  it('detects loss streaks and 12h activity', () => {
    const matches = makeMatches(6, (i) => ({ win: i >= 3 }));
    const s = aggregatePlayer(matches, opts, NOW);
    expect(s.streak).toEqual({ type: 'loss', length: 3 });
    // games are 3h apart: 3h, 6h, 9h, 12h fall inside 12h
    expect(s.last12h.games).toBe(4);
  });

  it('builds champion and role distributions', () => {
    const matches = makeMatches(10, (i) => ({
      championId: i < 7 ? 50 : 238,
      role: i < 8 ? 'MIDDLE' : 'TOP',
    }));
    const s = aggregatePlayer(matches, opts, NOW);
    expect(s.perChampion[0]).toMatchObject({ championId: 50, games: 7 });
    expect(s.roles[0]).toMatchObject({ role: 'MIDDLE', games: 8 });
    expect(s.mainRoles).toEqual(['MIDDLE', 'TOP']);
  });

  it('computes kill participation only with team kills known for at least 5 games', () => {
    const withoutKp = aggregatePlayer(makeMatches(6), opts, NOW);
    expect(withoutKp.killParticipation).toBeUndefined();
    const withKp = aggregatePlayer(
      makeMatches(6, () => ({ kills: 5, assists: 5, teamKills: 20 })),
      opts,
      NOW,
    );
    expect(withKp.killParticipation).toBeCloseTo(0.5);
  });

  it('championRoleShares only counts games on that champion', () => {
    const matches = makeMatches(4, (i) => ({ championId: i < 2 ? 50 : 238, role: i < 2 ? 'TOP' : 'MIDDLE' }));
    expect(championRoleShares(matches, 50)).toEqual([{ role: 'TOP', games: 2, share: 1 }]);
  });
});
