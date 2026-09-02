// Types of the Riot Live Client Data API (https://127.0.0.1:2999/liveclientdata/...).
// Only the fields Poro uses are typed; unknown fields are kept via index signatures where useful.

export type LiveTeam = 'ORDER' | 'CHAOS';

export interface LiveItem {
  canUse: boolean;
  consumable: boolean;
  count: number;
  displayName: string;
  itemID: number;
  price: number;
  rawDescription: string;
  rawDisplayName: string;
  slot: number;
}

export interface LiveScores {
  assists: number;
  creepScore: number;
  deaths: number;
  kills: number;
  wardScore: number;
}

export interface LiveSummonerSpell {
  displayName: string;
  rawDescription: string;
  rawDisplayName: string;
}

export interface LivePlayer {
  championName: string;
  isBot: boolean;
  isDead: boolean;
  items: LiveItem[];
  level: number;
  /** TOP, JUNGLE, MIDDLE, BOTTOM, UTILITY or "" outside Summoner's Rift */
  position: string;
  /** e.g. game_character_displayname_MonkeyKing */
  rawChampionName: string;
  respawnTimer: number;
  riotId?: string;
  riotIdGameName?: string;
  riotIdTagLine?: string;
  scores: LiveScores;
  skinID: number;
  summonerName: string;
  summonerSpells?: { summonerSpellOne: LiveSummonerSpell; summonerSpellTwo: LiveSummonerSpell };
  team: LiveTeam;
}

export interface LiveActivePlayer {
  currentGold: number;
  level: number;
  riotId?: string;
  riotIdGameName?: string;
  riotIdTagLine?: string;
  summonerName: string;
  teamRelativeColors?: boolean;
  championStats?: Record<string, number>;
}

/**
 * Game events. Known names: GameStart, MinionsSpawning, FirstBrick, TurretKilled, InhibKilled,
 * DragonKill, HeraldKill, BaronKill, HordeKill (voidgrubs), ChampionKill, Multikill, Ace, FirstBlood,
 * InhibRespawningSoon, InhibRespawned, GameEnd.
 */
export interface LiveEvent {
  EventID: number;
  EventName: string;
  EventTime: number;
  KillerName?: string;
  VictimName?: string;
  Assisters?: string[];
  /** DragonKill: Fire, Earth, Water, Air, Hextech, Chemtech, Elder */
  DragonType?: string;
  /** "True" / "False" as strings */
  Stolen?: string;
  /** e.g. Turret_T1_L_03_A */
  TurretKilled?: string;
  /** e.g. Barracks_T1_C1 */
  InhibKilled?: string;
  InhibRespawningSoon?: string;
  InhibRespawned?: string;
  Recipient?: string;
  Acer?: string;
  AcingTeam?: LiveTeam;
  KillStreak?: number;
  Result?: string;
}

export interface LiveGameData {
  gameMode: string;
  gameTime: number;
  mapName: string;
  mapNumber: number;
  mapTerrain: string;
}

export interface LiveAllGameData {
  activePlayer: LiveActivePlayer;
  allPlayers: LivePlayer[];
  events: { Events: LiveEvent[] };
  gameData: LiveGameData;
}
