import { describe, expect, it } from 'vitest';
import {
  computeObjectives,
  formatGameTime,
  parseStructureName,
  teamFromUnitName,
  type LiveTeam,
  type ObjectiveEventInput,
} from '../objectives';

const teamOf = (name: string | undefined): LiveTeam | undefined =>
  name === 'Blue#EUW' ? 'ORDER' : name === 'Red#EUW' ? 'CHAOS' : undefined;

let nextId = 0;
const ev = (
  EventName: string,
  EventTime: number,
  extra: Partial<ObjectiveEventInput> = {},
): ObjectiveEventInput => ({
  EventID: nextId++,
  EventName,
  EventTime,
  ...extra,
});

const byId = (state: ReturnType<typeof computeObjectives>, id: string) =>
  state.timers.find((t) => t.id === id)!;

describe('computeObjectives', () => {
  it('shows first spawns before anything happened', () => {
    const s = computeObjectives([ev('GameStart', 0)], 120, teamOf);
    expect(byId(s, 'dragon')).toMatchObject({ kind: 'dragon', status: 'upcoming', spawnAt: 300 });
    expect(byId(s, 'grubs')).toMatchObject({ status: 'upcoming', spawnAt: 480 });
    expect(byId(s, 'herald')).toMatchObject({ status: 'upcoming', spawnAt: 900 });
    expect(byId(s, 'baron')).toMatchObject({ status: 'upcoming', spawnAt: 1200 });
    expect(s.timers.filter((t) => t.kind === 'inhibitor')).toHaveLength(0);
  });

  it('tracks dragon respawns, the rift element and the soul / elder switch', () => {
    const events = [
      ev('DragonKill', 340, { KillerName: 'Blue#EUW', DragonType: 'Fire' }),
      ev('DragonKill', 660, { KillerName: 'Blue#EUW', DragonType: 'Earth' }),
      ev('DragonKill', 980, { KillerName: 'Red#EUW', DragonType: 'Water' }),
    ];
    let s = computeObjectives(events, 1000, teamOf);
    expect(byId(s, 'dragon')).toMatchObject({ kind: 'dragon', status: 'respawning', spawnAt: 1280 });
    expect(s.soulType).toBe('Water');
    expect(s.score.ORDER.dragons).toEqual(['Fire', 'Earth']);
    expect(s.score.CHAOS.dragons).toEqual(['Water']);
    expect(byId(s, 'dragon').detail?.en).toBe('Rift: Ocean drake');

    s = computeObjectives(events, 1300, teamOf);
    expect(byId(s, 'dragon').status).toBe('alive');

    events.push(ev('DragonKill', 1310, { KillerName: 'Blue#EUW', DragonType: 'Water' }));
    events.push(ev('DragonKill', 1620, { KillerName: 'Blue#EUW', DragonType: 'Water' }));
    s = computeObjectives(events, 1700, teamOf);
    expect(s.soul).toBe('ORDER');
    expect(byId(s, 'dragon')).toMatchObject({ kind: 'elder', status: 'respawning', spawnAt: 1620 + 360 });

    events.push(ev('DragonKill', 2000, { KillerName: 'Red#EUW', DragonType: 'Elder' }));
    s = computeObjectives(events, 2010, teamOf);
    expect(byId(s, 'dragon')).toMatchObject({ kind: 'elder', spawnAt: 2360 });
    expect(s.score.CHAOS.dragons).toEqual(['Water', 'Elder']);
  });

  it('handles grubs, herald and baron lifecycles', () => {
    const events = [
      ev('HordeKill', 520, { KillerName: 'Blue#EUW' }),
      ev('HordeKill', 525, { KillerName: 'Blue#EUW' }),
    ];
    let s = computeObjectives(events, 600, teamOf);
    expect(byId(s, 'grubs')).toMatchObject({ status: 'alive', despawnAt: 885 });
    expect(byId(s, 'grubs').detail?.en).toBe('1 left');
    s = computeObjectives(events, 900, teamOf);
    expect(byId(s, 'grubs').status).toBe('gone');
    expect(byId(s, 'grubs').detail?.en).toBe('2 : 0');
    expect(byId(s, 'herald')).toMatchObject({ status: 'alive', despawnAt: 1185 });

    events.push(ev('HeraldKill', 950, { KillerName: 'Red#EUW' }));
    s = computeObjectives(events, 960, teamOf);
    expect(byId(s, 'herald')).toMatchObject({ status: 'gone', team: 'CHAOS' });
    expect(s.score.CHAOS.heralds).toBe(1);

    events.push(ev('BaronKill', 1500, { KillerName: 'Blue#EUW' }));
    s = computeObjectives(events, 1510, teamOf);
    expect(byId(s, 'baron')).toMatchObject({ status: 'respawning', spawnAt: 1860 });
    s = computeObjectives(events, 1900, teamOf);
    expect(byId(s, 'baron').status).toBe('alive');
  });

  it('shows down inhibitors until they respawn and counts turrets and kills', () => {
    const events = [
      ev('TurretKilled', 700, { KillerName: 'Minion_T100L1S10', TurretKilled: 'Turret_T2_L_03_A' }),
      ev('TurretKilled', 800, { KillerName: 'Red#EUW', TurretKilled: 'Turret_T1_C_05_A' }),
      ev('ChampionKill', 810, {
        KillerName: 'Red#EUW',
        VictimName: 'Blue#EUW',
      } as Partial<ObjectiveEventInput>),
      ev('InhibKilled', 1000, { KillerName: 'Red#EUW', InhibKilled: 'Barracks_T1_C1' }),
    ];
    let s = computeObjectives(events, 1100, teamOf);
    const inhib = s.timers.find((t) => t.kind === 'inhibitor')!;
    expect(inhib).toMatchObject({ team: 'ORDER', status: 'respawning', spawnAt: 1300 });
    expect(inhib.label.de).toBe('Inhibitor Mid');
    expect(s.score.ORDER.turrets).toBe(1);
    expect(s.score.CHAOS.turrets).toBe(1);
    expect(s.score.CHAOS.kills).toBe(1);
    expect(s.score.CHAOS.inhibitors).toBe(1);

    s = computeObjectives(events, 1301, teamOf);
    expect(s.timers.filter((t) => t.kind === 'inhibitor')).toHaveLength(0);

    events.push(ev('InhibRespawned', 1250, { InhibRespawned: 'Barracks_T1_C1' }));
    s = computeObjectives(events, 1260, teamOf);
    expect(s.timers.filter((t) => t.kind === 'inhibitor')).toHaveLength(0);
  });
});

describe('helpers', () => {
  it('parses structure and unit names', () => {
    expect(parseStructureName('Barracks_T2_R1')).toEqual({ team: 'CHAOS', lane: { de: 'Bot', en: 'Bot' } });
    expect(parseStructureName('Turret_T1_L_03_A')?.team).toBe('ORDER');
    expect(parseStructureName('Dragon')).toBeNull();
    expect(teamFromUnitName('Minion_T200L2S5')).toBe('CHAOS');
    expect(teamFromUnitName('Turret_T1_C_05_A')).toBe('ORDER');
    expect(teamFromUnitName('SomePlayer')).toBeUndefined();
  });
  it('formats game time', () => {
    expect(formatGameTime(754.6)).toBe('12:34');
    expect(formatGameTime(-3)).toBe('0:00');
  });
});
