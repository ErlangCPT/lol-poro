import { describe, expect, it } from 'vitest';
import { aggregatePlayer } from '../aggregate';
import { computeTags, type TagContext } from '../tags';
import type { MatchSummary } from '../types';
import { championInfo, makeMatches, NOW } from './fixtures';

const opts = { windowDays: 30, rankedOnly: false };

function ctxFor(matches: MatchSummary[], extra: Partial<TagContext> = {}): TagContext {
  return {
    role: 'MIDDLE',
    championId: 50,
    stats: aggregatePlayer(matches, opts, NOW),
    matches,
    bans: [],
    opposingChampionIds: [],
    championName: (id) => championInfo(id)?.name ?? `#${id}`,
    ...extra,
  };
}

const ids = (tags: { id: string }[]) => tags.map((t) => t.id);

describe('computeTags', () => {
  it('hot streak and godlike + OTP on the current champion', () => {
    const matches = makeMatches(20, () => ({ championId: 50, win: true, kills: 10, deaths: 2, assists: 8 }));
    const tags = computeTags(ctxFor(matches));
    expect(ids(tags)).toContain('hot-streak');
    expect(ids(tags)).toContain('godlike');
    expect(ids(tags)).toContain('otp');
    expect(tags.find((t) => t.id === 'godlike')?.label.en).toBe('Godlike Swain');
  });

  it('cold streak', () => {
    const matches = makeMatches(8, (i) => ({ win: i >= 4 }));
    expect(ids(computeTags(ctxFor(matches)))).toContain('cold-streak');
  });

  it('first time on champion when no games and low mastery', () => {
    const matches = makeMatches(10, () => ({ championId: 238 }));
    const tags = computeTags(
      ctxFor(matches, { championId: 50, mastery: [{ championId: 50, level: 1, points: 800 }] }),
    );
    expect(ids(tags)).toContain('first-time');
    const withMastery = computeTags(
      ctxFor(matches, { championId: 50, mastery: [{ championId: 50, level: 7, points: 200000 }] }),
    );
    expect(ids(withMastery)).not.toContain('first-time');
  });

  it('main banned / main picked by enemy', () => {
    const matches = makeMatches(10, () => ({ championId: 238 })); // main = Zed, now playing Swain
    expect(ids(computeTags(ctxFor(matches, { bans: [238] })))).toContain('main-banned');
    expect(ids(computeTags(ctxFor(matches, { opposingChampionIds: [238] })))).toContain('main-picked');
    expect(ids(computeTags(ctxFor(matches)))).not.toContain('main-banned');
  });

  it('performance tags follow role benchmarks', () => {
    const good = makeMatches(10, () => ({
      cs: 270,
      durationSec: 1800,
      damageToChampions: 24000,
      visionScore: 40,
    }));
    const tags = computeTags(ctxFor(good));
    expect(ids(tags)).toEqual(expect.arrayContaining(['good-cser', 'high-damage', 'good-vision']));
    const bad = makeMatches(10, () => ({
      cs: 120,
      durationSec: 1800,
      damageToChampions: 9000,
      visionScore: 10,
      deaths: 8,
    }));
    const badTags = computeTags(ctxFor(bad));
    expect(ids(badTags)).toEqual(
      expect.arrayContaining(['bad-cser', 'low-damage', 'bad-vision', 'vulnerable-laner']),
    );
  });

  it('does not emit performance tags for supports based on CS', () => {
    const matches = makeMatches(10, () => ({ cs: 40, role: 'UTILITY' }));
    const tags = computeTags(ctxFor(matches, { role: 'UTILITY' }));
    expect(ids(tags)).not.toContain('bad-cser');
  });

  it('off-role when current role is rarely played', () => {
    const matches = makeMatches(20, () => ({ role: 'MIDDLE' }));
    expect(ids(computeTags(ctxFor(matches, { role: 'UTILITY' })))).toContain('off-role');
    expect(ids(computeTags(ctxFor(matches, { role: 'MIDDLE' })))).not.toContain('off-role');
  });

  it('stomper needs opponent data for the lane opponent champion', () => {
    const matches = makeMatches(6, () => ({
      win: true,
      opponents: [{ puuid: 'x', championId: 238, role: 'MIDDLE' }],
    }));
    const tags = computeTags(ctxFor(matches, { laneOpponentChampionId: 238 }));
    expect(tags.find((t) => t.id === 'stomper')?.label.en).toBe('Zed stomper');
    expect(ids(computeTags(ctxFor(matches, { laneOpponentChampionId: 18 })))).not.toContain('stomper');
  });

  it('smurf suspicion uses account level and winrate', () => {
    const matches = makeMatches(20, (i) => ({ win: i % 4 !== 0 }));
    const tags = computeTags(
      ctxFor(matches, { identity: { puuid: 'p', gameName: 'a', tagLine: 'b', level: 35 } }),
    );
    expect(ids(tags)).toContain('smurf');
  });

  it('returns nothing without stats', () => {
    expect(computeTags(ctxFor([], { stats: undefined, matches: undefined }))).toEqual([]);
  });
});
