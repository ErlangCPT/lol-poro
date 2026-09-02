// Domain types shared by all packages. Pure data, no runtime dependencies.

export type Role = 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'UTILITY' | 'UNKNOWN';
export const ROLES: readonly Role[] = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];

export type TeamSide = 'ally' | 'enemy';

/** How much we are allowed to know about a lobby member. */
export type Visibility =
  | 'self' // the local player
  | 'party' // premade party member, always visible
  | 'visible' // visible according to queue rules (normals, flex, loading screen)
  | 'hidden'; // anonymised by Riot (ranked solo/duo champ select) or streamer mode

export type Locale = 'de' | 'en';
export interface Localized {
  de: string;
  en: string;
}

export interface PlayerIdentity {
  puuid: string;
  gameName: string;
  tagLine: string;
  summonerId?: number;
  level?: number;
  profileIconId?: number;
}

export type RankedQueue = 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR';

export interface RankedEntry {
  queue: RankedQueue;
  /** IRON, BRONZE, ..., CHALLENGER or NONE */
  tier: string;
  /** I, II, III, IV or NA */
  division: string;
  lp: number;
  wins: number;
  losses: number;
  previousSeasonTier?: string;
  previousSeasonDivision?: string;
}

/** One game from the perspective of one player. */
export interface MatchSummary {
  gameId: number;
  queueId: number;
  /** epoch milliseconds */
  gameCreation: number;
  durationSec: number;
  win: boolean;
  teamId: 100 | 200;
  championId: number;
  role: Role;
  spells: [number, number];
  kills: number;
  deaths: number;
  assists: number;
  /** lane minions + neutral monsters */
  cs: number;
  gold: number;
  damageToChampions: number;
  damageToTurrets: number;
  turretKills: number;
  wardsPlaced: number;
  wardsKilled: number;
  visionScore: number;
  /** Only known when the full game (all 10 participants) was loaded. */
  teamKills?: number;
  opponents?: Array<{ puuid: string; championId: number; role: Role }>;
  /** PUUIDs of the other four teammates, only with full game data. */
  teammates?: string[];
  /** Final inventory (slots 0-5, zero-free), only with full game data. */
  items?: number[];
  trinket?: number;
  /** Rune page used in this game, only with full game data. */
  runes?: RuneSet;
}

export interface RuneSet {
  primaryStyle: number;
  subStyle: number;
  /** keystone + 3 primary + 2 secondary */
  perks: number[];
  /** 3 stat shards */
  shards: number[];
}

export interface RunePageSuggestion {
  source: 'riot' | 'personal' | 'meta';
  name: string;
  primaryStyleId: number;
  subStyleId: number;
  /** 9 ids: keystone, 3 primary, 2 secondary, 3 shards */
  perkIds: number[];
  spells?: [number, number];
  position?: Role;
  games?: number;
  wins?: number;
  recommendationId?: string;
}

export interface ItemMeta {
  id: number;
  name: string;
  gold: number;
  tags: string[];
  /** no further upgrade path and a real item (not a component) */
  completed: boolean;
}

export interface ItemStat {
  id: number;
  games: number;
  share: number;
}

export interface BuildSuggestion {
  source: 'personal' | 'meta';
  championId: number;
  games: number;
  wins: number;
  boots?: ItemStat;
  core: ItemStat[];
  situational: ItemStat[];
}

export interface MatchupRecord {
  championId: number;
  games: number;
  wins: number;
  /** games where that champion was the direct lane opponent */
  laneGames: number;
  laneWins: number;
}

export interface DamageProfile {
  champions: number;
  ad: number;
  ap: number;
  mixed: number;
  /** weighted share 0..1 (mixed counts half) */
  adShare: number;
  apShare: number;
}

export interface ChampionMastery {
  championId: number;
  level: number;
  points: number;
}

export interface ChampionStats {
  championId: number;
  games: number;
  wins: number;
  winrate: number;
  kills: number;
  deaths: number;
  assists: number;
  kdaRatio: number;
}

export interface RoleShare {
  role: Role;
  games: number;
  share: number;
}

export interface PlayerStats {
  windowDays: number;
  games: number;
  wins: number;
  winrate: number;
  /** averages per game */
  kda: { kills: number; deaths: number; assists: number; ratio: number };
  csPerMin: number;
  goldPerMin: number;
  dmgPerMin: number;
  wardsPerMin: number;
  visionPerMin: number;
  turretKillsPerGame: number;
  turretDamagePerGame: number;
  /** 0..1, only when team kills are known for at least 5 games */
  killParticipation?: number;
  perChampion: ChampionStats[];
  roles: RoleShare[];
  mainRoles: Role[];
  last12h: { games: number; wins: number };
  streak: { type: 'win' | 'loss'; length: number } | null;
}

export type TagTone = 'good' | 'neutral' | 'bad' | 'info';
export type TagCategory =
  'farming' | 'fighting' | 'objectives' | 'vision' | 'champion' | 'form' | 'meta' | 'team';

export interface Tag {
  id: string;
  label: Localized;
  tone: TagTone;
  category: TagCategory;
  reason: Localized;
}

/** Static champion data (subset of Data Dragon). */
export interface ChampionInfo {
  id: number;
  /** Data Dragon key, e.g. "MonkeyKing" */
  key: string;
  name: string;
  tags: string[];
  info: { attack: number; defense: number; magic: number; difficulty: number };
  attackRange: number;
}

export interface ChampionTraits {
  frontline: number;
  engage: number;
  dive: number;
  backline: number;
  waveclear: number;
  siege: number;
  splitpush: number;
  disengage: number;
  melee: boolean;
  damageType: 'AD' | 'AP' | 'MIXED';
}

export interface AnalysisOptions {
  windowDays: number;
  rankedOnly: boolean;
}

export interface LobbyPlayerInput {
  cellId: number;
  team: TeamSide;
  visibility: Visibility;
  identity?: PlayerIdentity;
  championId: number;
  assignedPosition?: Role;
  spells: [number, number];
  matches?: MatchSummary[];
  ranked?: RankedEntry[];
  mastery?: ChampionMastery[];
  /** Set when loading this player's data failed. */
  error?: string;
  loading?: boolean;
  /** display name from the local pro player list, e.g. "T1 Faker" */
  pro?: string;
}

export interface LobbyInput {
  queueId: number;
  /** id of the game being analysed; excluded from premade detection (relevant for post-game reviews) */
  currentGameId?: number;
  localPuuid?: string;
  bans: { ally: number[]; enemy: number[] };
  players: LobbyPlayerInput[];
  options: AnalysisOptions;
  /** epoch ms, defaults to Date.now() */
  now?: number;
  championInfo: (championId: number) => ChampionInfo | undefined;
}

export interface LobbyPlayer {
  cellId: number;
  team: TeamSide;
  visibility: Visibility;
  identity?: PlayerIdentity;
  championId: number;
  role: Role;
  roleSource: 'assigned' | 'inferred' | 'none';
  spells: [number, number];
  stats?: PlayerStats;
  championStats?: ChampionStats;
  ranked: RankedEntry[];
  masteryPoints?: number;
  masteryLevel?: number;
  tags: Tag[];
  premadeGroup?: number;
  pro?: string;
  error?: string;
  loading?: boolean;
}

export interface TeamStats {
  playersWithData: number;
  avgWinrate?: number;
  avgKda?: { kills: number; deaths: number; assists: number; ratio: number };
  avgGoldPerMin?: number;
  avgDmgPerMin?: number;
  avgWardsPerMin?: number;
  tags: Tag[];
}

export interface LobbyAnalysis {
  queueId: number;
  generatedAt: number;
  options: AnalysisOptions;
  bans: { ally: number[]; enemy: number[] };
  players: LobbyPlayer[];
  teams: { ally: TeamStats; enemy: TeamStats };
}
