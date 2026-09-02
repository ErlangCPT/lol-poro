// Raw DTOs of the League Client (LCU) API. Only the fields we use are typed; everything else is passed through.

export type GameflowPhase =
  | 'None'
  | 'Lobby'
  | 'Matchmaking'
  | 'CheckedIntoTournament'
  | 'ReadyCheck'
  | 'ChampSelect'
  | 'GameStart'
  | 'FailedToLaunch'
  | 'InProgress'
  | 'Reconnect'
  | 'WaitingForStats'
  | 'PreEndOfGame'
  | 'EndOfGame'
  | 'TerminatedInError';

export interface LcuCredentials {
  port: number;
  password: string;
  pid?: number;
  protocol: 'https';
}

export interface LcuSummoner {
  puuid: string;
  summonerId: number;
  accountId?: number;
  gameName: string;
  tagLine: string;
  displayName?: string;
  internalName?: string;
  summonerLevel: number;
  profileIconId: number;
  privacy?: 'PUBLIC' | 'PRIVATE';
}

export interface LcuRegionLocale {
  region: string;
  locale: string;
  webRegion?: string;
  webLanguage?: string;
}

export type NameVisibility = 'VISIBLE' | 'HIDDEN' | 'UNHIDDEN' | '';

export interface LcuChampSelectPlayer {
  cellId: number;
  championId: number;
  championPickIntent: number;
  summonerId: number;
  puuid: string;
  assignedPosition: string;
  spell1Id: number;
  spell2Id: number;
  team: number;
  nameVisibilityType: NameVisibility;
  gameName?: string;
  tagLine?: string;
  playerType?: string;
  selectedSkinId?: number;
  wardSkinId?: number;
  obfuscatedPuuid?: string;
  obfuscatedSummonerId?: number;
}

export interface LcuChampSelectAction {
  id: number;
  actorCellId: number;
  championId: number;
  completed: boolean;
  isAllyAction: boolean;
  isInProgress: boolean;
  pickTurn: number;
  type: 'pick' | 'ban' | 'ten_bans_reveal' | string;
}

export interface LcuChampSelectSession {
  gameId?: number;
  localPlayerCellId: number;
  isSpectating?: boolean;
  myTeam: LcuChampSelectPlayer[];
  theirTeam: LcuChampSelectPlayer[];
  bans: { myTeamBans: number[]; theirTeamBans: number[]; numBans: number };
  actions: LcuChampSelectAction[][];
  timer: {
    phase: string;
    timeLeftInPhase: number;
    adjustedTimeLeftInPhase: number;
    totalTimeInPhase: number;
    isInfinite: boolean;
  };
}

export interface LcuGameflowPlayer {
  puuid?: string;
  summonerId?: number;
  summonerName?: string;
  summonerInternalName?: string;
  championId?: number;
  selectedPosition?: string;
  selectedRole?: string;
  teamId?: number;
  profileIconId?: number;
  teamParticipantId?: number;
}

export interface LcuChampionSelection {
  championId: number;
  puuid?: string;
  summonerInternalName?: string;
  selectedSkinIndex?: number;
  spell1Id?: number;
  spell2Id?: number;
}

export interface LcuGameflowSession {
  phase: GameflowPhase;
  gameData: {
    gameId: number;
    isCustomGame?: boolean;
    queue: {
      id: number;
      type?: string;
      gameMode?: string;
      mapId?: number;
      isRanked?: boolean;
      name?: string;
    };
    teamOne: LcuGameflowPlayer[];
    teamTwo: LcuGameflowPlayer[];
    playerChampionSelections: LcuChampionSelection[];
  };
  gameClient?: { running: boolean; visible: boolean; serverIp?: string; serverPort?: number };
  map?: { id: number; name?: string; gameMode?: string };
}

export interface LcuRankedQueue {
  queueType: string;
  tier: string;
  division: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  previousSeasonEndTier?: string;
  previousSeasonEndDivision?: string;
  highestTier?: string;
  isProvisional?: boolean;
  provisionalGamesRemaining?: number;
}

export interface LcuRankedStats {
  queues: LcuRankedQueue[];
  queueMap?: Record<string, LcuRankedQueue>;
  highestPreviousSeasonEndTier?: string;
  highestPreviousSeasonEndDivision?: string;
}

export interface LcuParticipantStats {
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  champLevel?: number;
  goldEarned: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  totalDamageDealtToChampions: number;
  damageDealtToTurrets?: number;
  damageDealtToObjectives?: number;
  turretKills?: number;
  inhibitorKills?: number;
  wardsPlaced?: number;
  wardsKilled?: number;
  visionScore?: number;
  visionWardsBoughtInGame?: number;
  item0?: number;
  item1?: number;
  item2?: number;
  item3?: number;
  item4?: number;
  item5?: number;
  item6?: number;
  perk0?: number;
  perk1?: number;
  perk2?: number;
  perk3?: number;
  perk4?: number;
  perk5?: number;
  perkPrimaryStyle?: number;
  perkSubStyle?: number;
  statPerk0?: number;
  statPerk1?: number;
  statPerk2?: number;
  [key: string]: unknown;
}

// ---- runes (lol-perks) ----

export interface LcuPerkPage {
  id: number;
  name: string;
  current: boolean;
  isActive?: boolean;
  isValid?: boolean;
  isEditable: boolean;
  isDeletable: boolean;
  isTemporary?: boolean;
  order?: number;
  primaryStyleId: number;
  subStyleId: number;
  selectedPerkIds: number[];
  lastModified?: number;
}

export interface LcuPerkInventory {
  ownedPageCount: number;
  customPageCount?: number;
  canAddCustomPage?: boolean;
}

export interface LcuUiPerk {
  id: number;
  styleId?: number;
  name?: string;
  iconPath?: string;
  slotType?: string;
}

export interface LcuRecommendedPage {
  position: string;
  isDefaultPosition?: boolean;
  keystone: LcuUiPerk;
  perks: LcuUiPerk[];
  primaryPerkStyleId: number;
  secondaryPerkStyleId: number;
  summonerSpellIds?: number[];
  recommendationId?: string;
  recommendationChampionId?: number;
  isRecommendationOverride?: boolean;
}

// ---- item sets ----

export interface LcuItemSetItem {
  id: string;
  count: number;
}

export interface LcuItemSetBlock {
  type: string;
  items: LcuItemSetItem[];
  hideIfSummonerSpell?: string;
  showIfSummonerSpell?: string;
}

export interface LcuItemSet {
  uid: string;
  title: string;
  mode: string;
  map: string;
  type: string;
  sortrank: number;
  startedFrom?: string;
  associatedChampions: number[];
  associatedMaps: number[];
  blocks: LcuItemSetBlock[];
  preferredItemSlots?: Array<{ id: string; preferredItemSlot: number }>;
}

export interface LcuItemSets {
  timestamp: number;
  accountId: number;
  itemSets: LcuItemSet[];
}

export interface LcuMySelection {
  selectedSkinId?: number;
  spell1Id?: number;
  spell2Id?: number;
}

export interface LcuParticipant {
  participantId: number;
  teamId: number;
  championId: number;
  spell1Id: number;
  spell2Id: number;
  highestAchievedSeasonTier?: string;
  stats: LcuParticipantStats;
  timeline?: { lane?: string; role?: string; participantId?: number; [key: string]: unknown };
}

export interface LcuParticipantIdentity {
  participantId: number;
  player: {
    puuid: string;
    summonerId?: number;
    accountId?: number;
    gameName?: string;
    tagLine?: string;
    summonerName?: string;
    profileIcon?: number;
    platformId?: string;
  };
}

export interface LcuGame {
  gameId: number;
  gameCreation: number;
  gameDuration: number;
  gameMode?: string;
  gameType?: string;
  gameVersion?: string;
  mapId?: number;
  platformId?: string;
  queueId: number;
  seasonId?: number;
  endOfGameResult?: string;
  participantIdentities: LcuParticipantIdentity[];
  participants: LcuParticipant[];
  teams?: Array<{
    teamId: number;
    win: 'Win' | 'Fail' | string;
    bans?: Array<{ championId: number; pickTurn: number }>;
    [key: string]: unknown;
  }>;
}

export interface LcuMatchHistory {
  accountId?: number;
  platformId?: string;
  games: {
    gameBeginDate?: string;
    gameCount: number;
    gameEndDate?: string;
    gameIndexBegin: number;
    gameIndexEnd: number;
    games: LcuGame[];
  };
}

export interface LcuChampionMastery {
  championId: number;
  championLevel: number;
  championPoints: number;
  lastPlayTime?: number;
  puuid?: string;
}

export interface LcuEvent<T = unknown> {
  topic: string;
  uri: string;
  eventType: 'Create' | 'Update' | 'Delete';
  data: T;
}

// ---- end of game ----

export interface LcuEogStatsBlock {
  gameId: number;
  /** seconds */
  gameLength: number;
  gameMode?: string;
  queueId?: number;
  localPlayer?: {
    puuid?: string;
    championId?: number;
    stats?: Record<string, unknown>;
    [key: string]: unknown;
  };
  teams?: Array<{ teamId: number; isWinningTeam?: boolean; players?: Array<Record<string, unknown>> }>;
  [key: string]: unknown;
}
