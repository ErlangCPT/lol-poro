// Riot Games API DTOs (subset).

export interface RiotAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export interface MatchV5PerkStyleSelection {
  perk: number;
  var1?: number;
  var2?: number;
  var3?: number;
}

export interface MatchV5Perks {
  statPerks: { defense: number; flex: number; offense: number };
  styles: Array<{
    description: 'primaryStyle' | 'subStyle' | string;
    style: number;
    selections: MatchV5PerkStyleSelection[];
  }>;
}

export interface MatchV5Participant {
  puuid: string;
  riotIdGameName?: string;
  riotIdTagline?: string;
  summonerName?: string;
  teamId: number;
  championId: number;
  championName?: string;
  summoner1Id: number;
  summoner2Id: number;
  teamPosition?: string;
  individualPosition?: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  goldEarned: number;
  totalDamageDealtToChampions: number;
  damageDealtToTurrets?: number;
  turretKills?: number;
  turretTakedowns?: number;
  wardsPlaced?: number;
  wardsKilled?: number;
  visionScore?: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  perks?: MatchV5Perks;
  challenges?: Record<string, number>;
  gameEndedInEarlySurrender?: boolean;
  participantId?: number;
  champLevel?: number;
  physicalDamageDealtToChampions?: number;
  magicDamageDealtToChampions?: number;
  trueDamageDealtToChampions?: number;
  totalDamageTaken?: number;
  damageSelfMitigated?: number;
  totalHeal?: number;
  damageDealtToObjectives?: number;
  timeCCingOthers?: number;
  largestMultiKill?: number;
  firstBloodKill?: boolean;
  visionWardsBoughtInGame?: number;
  inhibitorKills?: number;
}

export interface MatchV5Team {
  teamId: number;
  win: boolean;
  bans?: Array<{ championId: number; pickTurn: number }>;
  objectives?: { champion?: { kills: number } };
}

export interface MatchV5 {
  metadata: { matchId: string; participants: string[] };
  info: {
    gameId: number;
    gameCreation: number;
    /** seconds (patch 11.20+), milliseconds before that */
    gameDuration: number;
    gameEndTimestamp?: number;
    gameMode?: string;
    gameVersion?: string;
    mapId?: number;
    queueId: number;
    endOfGameResult?: string;
    participants: MatchV5Participant[];
    teams: MatchV5Team[];
  };
}

export interface MatchIdsQuery {
  /** epoch seconds */
  startTime?: number;
  endTime?: number;
  queue?: number;
  type?: 'ranked' | 'normal' | 'tourney' | 'tutorial';
  start?: number;
  count?: number;
}

// ---- Match-V5 timeline ----

export interface MatchV5ParticipantFrame {
  participantId: number;
  totalGold: number;
  currentGold: number;
  xp: number;
  level: number;
  minionsKilled: number;
  jungleMinionsKilled: number;
  damageStats?: { totalDamageDoneToChampions?: number; totalDamageTaken?: number };
  position?: { x: number; y: number };
}

export interface MatchV5TimelineEvent {
  type: string;
  timestamp: number;
  killerId?: number;
  victimId?: number;
  assistingParticipantIds?: number[];
  monsterType?: string;
  monsterSubType?: string;
  buildingType?: string;
  laneType?: string;
  teamId?: number;
  creatorId?: number;
  wardType?: string;
  participantId?: number;
  itemId?: number;
}

export interface MatchV5TimelineFrame {
  timestamp: number;
  participantFrames: Record<string, MatchV5ParticipantFrame>;
  events: MatchV5TimelineEvent[];
}

export interface MatchV5Timeline {
  metadata: { matchId: string; participants: string[] };
  info: {
    frameInterval: number;
    gameId?: number;
    frames: MatchV5TimelineFrame[];
    participants?: Array<{ participantId: number; puuid: string }>;
  };
}

// ---- League-V4 ----

export interface LeagueEntry {
  puuid?: string;
  summonerId?: string;
  leaguePoints: number;
  tier?: string;
  rank?: string;
  wins: number;
  losses: number;
  queueType?: string;
}

export interface LeagueList {
  tier: string;
  queue: string;
  entries: LeagueEntry[];
}

export type ApexLeague = 'challengerleagues' | 'grandmasterleagues' | 'masterleagues';
