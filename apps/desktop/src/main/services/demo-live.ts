import type { LobbyAnalysis } from '@poro/core';
import type { LiveAllGameData, LiveEvent, LivePlayer, LiveTeam } from '@poro/live-client';

/**
 * Developer aid (`--demo-live`): a synthetic running game that advances in real time, starting at 13:40
 * so grubs, herald, dragon respawn and a down inhibitor are all visible at once.
 */
export class DemoLiveFeed {
  private readonly startedAt = Date.now();
  private readonly startGameTime = 13 * 60 + 40;
  private readonly events: LiveEvent[];
  private readonly players: LivePlayer[];

  constructor(analysis: LobbyAnalysis | undefined, championKey: (id: number) => string | undefined) {
    const players = analysis?.players ?? [];
    const names = players.map((p) => ({
      name: p.identity ? `${p.identity.gameName}#${p.identity.tagLine}` : `Player${p.cellId}#DEMO`,
      team: (p.team === 'ally' ? 'ORDER' : 'CHAOS') as LiveTeam,
      champion: championKey(p.championId) ?? 'Annie',
      role: p.role,
    }));
    const order = names.filter((n) => n.team === 'ORDER');
    const chaos = names.filter((n) => n.team === 'CHAOS');
    const k = (team: LiveTeam, i: number) => (team === 'ORDER' ? order : chaos)[i]?.name ?? `${team}${i}`;
    this.events = [
      { EventID: 0, EventName: 'GameStart', EventTime: 0 },
      { EventID: 1, EventName: 'MinionsSpawning', EventTime: 65 },
      { EventID: 2, EventName: 'FirstBlood', EventTime: 190, Recipient: k('ORDER', 1) },
      {
        EventID: 3,
        EventName: 'ChampionKill',
        EventTime: 190,
        KillerName: k('ORDER', 1),
        VictimName: k('CHAOS', 1),
        Assisters: [],
      },
      {
        EventID: 4,
        EventName: 'DragonKill',
        EventTime: 345,
        KillerName: k('ORDER', 1),
        DragonType: 'Fire',
        Stolen: 'False',
        Assisters: [k('ORDER', 3)],
      },
      {
        EventID: 5,
        EventName: 'ChampionKill',
        EventTime: 402,
        KillerName: k('CHAOS', 2),
        VictimName: k('ORDER', 2),
        Assisters: [],
      },
      {
        EventID: 6,
        EventName: 'HordeKill',
        EventTime: 531,
        KillerName: k('CHAOS', 1),
        Stolen: 'False',
        Assisters: [],
      },
      {
        EventID: 7,
        EventName: 'HordeKill',
        EventTime: 536,
        KillerName: k('CHAOS', 1),
        Stolen: 'False',
        Assisters: [],
      },
      { EventID: 8, EventName: 'FirstBrick', EventTime: 610, KillerName: k('ORDER', 3) },
      {
        EventID: 9,
        EventName: 'TurretKilled',
        EventTime: 610,
        KillerName: k('ORDER', 3),
        TurretKilled: 'Turret_T2_R_03_A',
        Assisters: [],
      },
      {
        EventID: 10,
        EventName: 'DragonKill',
        EventTime: 671,
        KillerName: k('CHAOS', 1),
        DragonType: 'Earth',
        Stolen: 'False',
        Assisters: [],
      },
      {
        EventID: 11,
        EventName: 'ChampionKill',
        EventTime: 700,
        KillerName: k('ORDER', 0),
        VictimName: k('CHAOS', 0),
        Assisters: [k('ORDER', 1)],
      },
      {
        EventID: 12,
        EventName: 'TurretKilled',
        EventTime: 745,
        KillerName: 'Minion_T200L1S12',
        TurretKilled: 'Turret_T1_L_03_A',
        Assisters: [],
      },
      {
        EventID: 13,
        EventName: 'ChampionKill',
        EventTime: 760,
        KillerName: k('CHAOS', 4),
        VictimName: k('ORDER', 4),
        Assisters: [k('CHAOS', 3)],
      },
      {
        EventID: 14,
        EventName: 'InhibKilled',
        EventTime: 790,
        KillerName: k('CHAOS', 3),
        InhibKilled: 'Barracks_T1_L1',
        Assisters: [],
      },
    ];
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    this.players = names.map((n, i) => {
      const jungle = n.role === 'JUNGLE';
      const support = n.role === 'UTILITY';
      const cs = support
        ? 20 + Math.floor(rnd() * 15)
        : jungle
          ? 70 + Math.floor(rnd() * 20)
          : 85 + Math.floor(rnd() * 40);
      const kills = Math.floor(rnd() * 4);
      return {
        championName: n.champion,
        rawChampionName: `game_character_displayname_${n.champion}`,
        isBot: false,
        isDead: i === 4,
        respawnTimer: i === 4 ? 18 : 0,
        level: 8 + Math.floor(rnd() * 3),
        position: n.role === 'UNKNOWN' ? '' : n.role,
        riotId: n.name,
        riotIdGameName: n.name.split('#')[0],
        riotIdTagLine: n.name.split('#')[1],
        summonerName: n.name,
        scores: {
          kills,
          deaths: Math.floor(rnd() * 3),
          assists: Math.floor(rnd() * 5),
          creepScore: cs,
          wardScore: support ? 14 : 4 + Math.floor(rnd() * 6),
        },
        skinID: 0,
        team: n.team,
        items: [
          {
            itemID: 1055,
            price: 500,
            count: 1,
            canUse: false,
            consumable: false,
            displayName: '',
            rawDescription: '',
            rawDisplayName: '',
            slot: 0,
          },
          {
            itemID: 3006,
            price: 1000,
            count: 1,
            canUse: false,
            consumable: false,
            displayName: '',
            rawDescription: '',
            rawDisplayName: '',
            slot: 1,
          },
          {
            itemID: 3031,
            price: 3400,
            count: 1,
            canUse: false,
            consumable: false,
            displayName: '',
            rawDescription: '',
            rawDisplayName: '',
            slot: 2,
          },
          {
            itemID: 3340,
            price: 0,
            count: 1,
            canUse: true,
            consumable: false,
            displayName: '',
            rawDescription: '',
            rawDisplayName: '',
            slot: 6,
          },
        ].slice(0, support ? 2 : 4),
      };
    });
  }

  gameTime(): number {
    return this.startGameTime + (Date.now() - this.startedAt) / 1000;
  }

  data(): LiveAllGameData {
    const t = this.gameTime();
    const me = this.players[0];
    return {
      activePlayer: {
        currentGold: 1240,
        level: me?.level ?? 1,
        summonerName: me?.summonerName ?? 'Demo#EUW',
        riotId: me?.riotId,
      },
      allPlayers: this.players,
      events: { Events: this.events.filter((e) => e.EventTime <= t) },
      gameData: { gameMode: 'CLASSIC', gameTime: t, mapName: 'Map11', mapNumber: 11, mapTerrain: 'Default' },
    };
  }
}
