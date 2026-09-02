import type { Role, RuneSet } from '@poro/core';

/** One participant of a crawled match, the unit stored in the statistics database. */
export interface ParticipantRow {
  matchId: string;
  platform: string;
  /** "16.17" */
  patch: string;
  queueId: number;
  gameCreation: number;
  durationSec: number;
  teamId: number;
  championId: number;
  role: Role;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold: number;
  /** champion of the enemy in the same role, 0 when unknown */
  opponentChampionId: number;
  /** final inventory slots 0-5 in slot order, zero-free */
  items: number[];
  trinket: number;
  runes?: RuneSet;
  spells: [number, number];
}

export interface MatchExtract {
  matchId: string;
  platform: string;
  patch: string;
  queueId: number;
  gameCreation: number;
  durationSec: number;
  participants: ParticipantRow[];
  bans: number[];
  /** players of the match, used to expand the crawl */
  puuids: string[];
}

/** Aggregated by the store (SQL GROUP BY) or in memory. */
export interface ChampionGroup {
  championId: number;
  role: Role;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
}

export interface MatchupGroup {
  championId: number;
  opponentChampionId: number;
  role: Role;
  games: number;
  wins: number;
}

export type Tier = 'S' | 'A' | 'B' | 'C' | 'D' | '-';

export interface ChampionRoleStats {
  championId: number;
  role: Role;
  games: number;
  wins: number;
  winrate: number;
  pickrate: number;
  banrate: number;
  kda: number;
  /** ranking score inside the role (winrate shrunk by sample size plus pick and ban rate) */
  score: number;
  tier: Tier;
}

export interface MatchupStats {
  championId: number;
  opponentChampionId: number;
  role: Role;
  games: number;
  wins: number;
  winrate: number;
  /** Wilson lower bound of the winrate, used for ranking small samples */
  confidence: number;
}

export interface ItemSetStats {
  items: number[];
  games: number;
  wins: number;
  winrate: number;
}

export interface ItemStats {
  itemId: number;
  games: number;
  wins: number;
  winrate: number;
  share: number;
}

export interface RuneSetStats {
  runes: RuneSet;
  games: number;
  wins: number;
  winrate: number;
}

export interface SpellStats {
  spells: [number, number];
  games: number;
  wins: number;
  winrate: number;
}

export interface ChampionBuildStats {
  championId: number;
  role: Role;
  games: number;
  /** most common first three completed items in slot order */
  core: ItemSetStats[];
  boots: ItemStats[];
  items: ItemStats[];
  runes: RuneSetStats[];
  spells: SpellStats[];
}

export interface BanSuggestion {
  championId: number;
  reason: 'counter' | 'meta';
  /** the own champion this pick counters (reason "counter") */
  counters?: number;
  role?: Role;
  /** winrate of the suggested ban against the own champion (counter) */
  winrate?: number;
  banrate?: number;
  games: number;
}

export interface CounterSuggestion {
  enemyChampionId: number;
  role: Role;
  picks: MatchupStats[];
}

export interface MetaSummary {
  platform: string;
  patch: string;
  queueId: number;
  matches: number;
  champions: ChampionRoleStats[];
  updatedAt: number;
}

export type CrawlPhase = 'idle' | 'seeding' | 'players' | 'matches' | 'stopped' | 'error';

export interface CrawlerStatus {
  running: boolean;
  phase: CrawlPhase;
  requests: number;
  matchesStored: number;
  matchesSkipped: number;
  players: number;
  playersPending: number;
  pendingMatches: number;
  lastError?: string;
  startedAt?: number;
}
