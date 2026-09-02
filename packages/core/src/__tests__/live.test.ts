import { describe, expect, it } from 'vitest';
import { jungleTimers, toggleJungleMark } from '../jungle';
import { computeLiveStats, recordMilestones, type LivePlayerInput } from '../live-stats';

const player = (
  key: string,
  team: 'ORDER' | 'CHAOS',
  extra: Partial<LivePlayerInput> = {},
): LivePlayerInput => ({
  key,
  team,
  kills: 0,
  deaths: 0,
  assists: 0,
  cs: 0,
  wardScore: 0,
  itemGold: 0,
  ...extra,
});

describe('jungle timers', () => {
  it('toggles marks and computes respawns', () => {
    let marks = toggleJungleMark([], 'ORDER', 'blue', 600);
    marks = toggleJungleMark(marks, 'CHAOS', 'raptors', 610);
    expect(jungleTimers(marks, 620)).toEqual([
      { side: 'ORDER', campId: 'blue', clearedAt: 600, respawnAt: 900 },
      { side: 'CHAOS', campId: 'raptors', clearedAt: 610, respawnAt: 745 },
    ]);
    expect(jungleTimers(marks, 800)).toHaveLength(1);
    marks = toggleJungleMark(marks, 'ORDER', 'blue', 700);
    expect(marks).toEqual([{ side: 'CHAOS', campId: 'raptors', clearedAt: 610 }]);
  });
});

describe('live stats', () => {
  it('records the 10 and 20 minute milestones once', () => {
    const players = [player('a', 'ORDER', { cs: 80, wardScore: 5 })];
    let m = recordMilestones({}, 590, players);
    expect(m).toEqual({});
    m = recordMilestones(m, 601, players);
    expect(m[10]?.a).toEqual({ cs: 80, wards: 5 });
    const again = recordMilestones(m, 605, [player('a', 'ORDER', { cs: 82 })]);
    expect(again).toBe(m);
    // starting the app at minute 25 must not record a bogus 20 minute value
    const late = recordMilestones(m, 1500, players);
    expect(late[20]).toBeUndefined();
  });

  it('computes kill participation, cs per minute and team totals', () => {
    const players = [
      player('a', 'ORDER', { kills: 3, assists: 2, cs: 150, itemGold: 4000 }),
      player('b', 'ORDER', { kills: 1, assists: 4, cs: 50, itemGold: 2000 }),
      player('c', 'CHAOS', { deaths: 4, cs: 120, itemGold: 3000 }),
    ];
    const { players: stats, teams } = computeLiveStats(900, players, { 10: { a: { cs: 90, wards: 3 } } });
    expect(stats[0]).toMatchObject({ key: 'a', csPerMin: 10, killParticipation: 1, cs10: 90, wards10: 3 });
    expect(stats[1]?.killParticipation).toBe(1);
    expect(stats[2]?.killParticipation).toBeUndefined();
    expect(teams.ORDER).toEqual({ kills: 4, deaths: 0, assists: 6, cs: 200, itemGold: 6000 });
    expect(teams.CHAOS.deaths).toBe(4);
  });
});
