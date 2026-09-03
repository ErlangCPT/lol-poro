// Types shared between main, preload and renderer. Keep this file free of runtime imports.
import type {
  BuildSuggestion,
  ComparisonRow,
  DamageProfile,
  JungleTimer,
  LiveTeam,
  Locale,
  Localized,
  LobbyAnalysis,
  MatchupRecord,
  ObjectiveTimer,
  PostGameHistoryEntry,
  PostGameReport,
  Role,
  RunePageSuggestion,
} from '@poro/core';
import type {
  BanSuggestion,
  ChampionBuildStats,
  ChampionRoleStats,
  CounterSuggestion,
  CrawlerStatus,
  MetaSummary,
} from '@poro/stats';

export type LcuStatus = 'searching' | 'connecting' | 'connected' | 'disconnected';

export interface OverlayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AppSettings {
  locale: Locale;
  /** statistic window in days (Porofessor: 30) */
  windowDays: number;
  rankedOnly: boolean;
  /** load full 10-player game data for the newest games (enables kill participation, opponents, stomper tag) */
  fetchFullGames: boolean;
  fullGamesPerPlayer: number;
  /** write raw LCU data of each analysed lobby to userData/recordings for tests */
  recordSessions: boolean;
  /** only needed from Phase 4 on (Match-V5 timelines); stored locally, never sent anywhere else */
  riotApiKey: string;
  autoAcceptReadyCheck: boolean;
  /** in-game overlay (Phase 3) */
  overlayEnabled: boolean;
  overlayOpacity: number;
  overlayScale: number;
  overlaySound: boolean;
  overlayShowPlayers: boolean;
  overlayShowJungle: boolean;
  overlayBounds?: OverlayBounds;
  /** statistics crawler (Phase 5): collects ranked matches of the patch with the Riot API key */
  crawlerEnabled: boolean;
  crawlerRequestsPerMinute: number;
  /** appearance (Phase 6) */
  theme: 'dark' | 'light' | 'system';
  /** global shortcut of the overlay as an Electron accelerator, e.g. "CommandOrControl+Shift+P" */
  hotkeyToggle: string;
  /** generic update feed: folder with latest.yml, installer and blockmap; empty = no update checks */
  updateUrl: string;
  updateCheckOnStart: boolean;
}

export const DEFAULT_HOTKEYS = {
  toggle: 'CommandOrControl+Shift+P',
};

export const DEFAULT_SETTINGS: AppSettings = {
  locale: 'de',
  windowDays: 30,
  rankedOnly: false,
  fetchFullGames: false,
  fullGamesPerPlayer: 10,
  recordSessions: false,
  riotApiKey: '',
  autoAcceptReadyCheck: false,
  overlayEnabled: true,
  overlayOpacity: 0.7,
  overlayScale: 0.8,
  overlaySound: false,
  overlayShowPlayers: true,
  overlayShowJungle: true,
  crawlerEnabled: true,
  crawlerRequestsPerMinute: 40,
  theme: 'dark',
  hotkeyToggle: DEFAULT_HOTKEYS.toggle,
  updateUrl: '',
  updateCheckOnStart: true,
};

export interface ConnectionState {
  lcu: LcuStatus;
  phase: string;
  port?: number;
  summoner?: { puuid: string; gameName: string; tagLine: string; level?: number };
  region?: string;
  staticDataVersion?: string;
  staticDataError?: string;
  lastError?: string;
  userDataPath?: string;
  /** set when a Riot API key is configured; error when the key was rejected (expired dev key) */
  riotApi?: { active: boolean; error?: string };
}

export type LobbySource = 'champselect' | 'loading' | 'none';

export interface LobbySnapshot {
  source: LobbySource;
  queueId: number;
  gameId: number;
  updatedAt: number;
  loadingPlayers: number;
  timer?: { phase: string; timeLeftMs: number; receivedAt: number };
  analysis?: LobbyAnalysis;
  message?: string;
}

/** Everything the champion panel needs for the local player's current pick. */
export interface ChampSelectInfo {
  phase: LobbySource;
  championId: number;
  championName: string;
  role: Role;
  spells: [number, number];
  allyChampionIds: number[];
  enemyChampionIds: number[];
  riotPages: RunePageSuggestion[];
  riotPagesLoading: boolean;
  personalPages: RunePageSuggestion[];
  personalBuild?: BuildSuggestion;
  personalGames: number;
  personalLoading: boolean;
  matchups: MatchupRecord[];
  allyDamage: DamageProfile;
  enemyDamage: DamageProfile;
  lastAction?: { ok: boolean; message: string; at: number };
  /** statistics of the crawled patch for this pick (Phase 5) */
  meta?: ChampSelectMeta;
}

export interface ChampSelectMeta {
  patch: string;
  matches: number;
  self?: ChampionRoleStats;
  build?: ChampionBuildStats;
  counters: CounterSuggestion[];
  bans: BanSuggestion[];
}

export interface MetaSnapshot {
  hasKey: boolean;
  enabled: boolean;
  platform: string;
  patch: string;
  crawler: CrawlerStatus | null;
  summary: MetaSummary | null;
  updatedAt: number;
}

export interface MetaChampion {
  stats?: ChampionRoleStats;
  build?: ChampionBuildStats;
}

// ---- in-game (Phase 3) ----

export interface LivePlayerView {
  /** riot id "Name#TAG" */
  key: string;
  gameName: string;
  tagLine: string;
  championKey: string;
  championId: number;
  championName: string;
  team: LiveTeam;
  position: string;
  level: number;
  isDead: boolean;
  respawnTimer: number;
  isBot: boolean;
  isSelf: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  csPerMin: number;
  wardScore: number;
  killParticipation?: number;
  cs10?: number;
  cs20?: number;
  wards10?: number;
  wards20?: number;
  /** value of the items carried (gold spent), not total gold */
  itemGold: number;
  items: number[];
  /** from the lobby analysis (Phase 1) when the player was matched */
  rank?: { tier: string; division: string; lp: number };
  winrate?: number;
  games?: number;
}

export interface LiveTeamView {
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  itemGold: number;
  turrets: number;
  dragons: string[];
  grubs: number;
  heralds: number;
  barons: number;
  inhibitors: number;
}

export interface LiveGameSnapshot {
  connected: boolean;
  demo: boolean;
  /** game seconds at receivedAt; renderers interpolate with Date.now() */
  gameTime: number;
  receivedAt: number;
  gameMode: string;
  mapNumber: number;
  selfTeam?: LiveTeam;
  objectives: ObjectiveTimer[];
  soulType?: string;
  soul?: LiveTeam;
  teams: Record<LiveTeam, LiveTeamView>;
  players: LivePlayerView[];
  jungle: JungleTimer[];
  warnings: Localized[];
}

export interface OverlayStatus {
  enabled: boolean;
  visible: boolean;
  hotkeys: { toggle: string };
  /** accelerators that could not be registered (invalid or taken by another program) */
  hotkeyError?: string;
}

// ---- polish (Phase 6) ----

export type UpdateState =
  'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'uptodate' | 'error';

export interface UpdateStatus {
  state: UpdateState;
  currentVersion: string;
  /** version found on the feed */
  version?: string;
  /** download progress 0..100 */
  progress?: number;
  message?: string;
  checkedAt?: number;
}

export interface ProcessMetric {
  type: string;
  pid: number;
  name?: string;
  /** percent of one CPU core since the previous sample */
  cpu: number;
  memoryMb: number;
}

// ---- post-game (Phase 4) ----

export type PostGameStatus = 'idle' | 'waiting' | 'loading' | 'ready' | 'error';

export interface PostGameSnapshot {
  status: PostGameStatus;
  message?: string;
  /** game currently being analysed */
  gameId?: number;
  report?: PostGameReport;
  comparison: ComparisonRow[];
  /** newest first, the last 20 analysed games of the local player */
  trend: PostGameHistoryEntry[];
  /** newest first, up to 50 rows */
  history: PostGameHistoryEntry[];
  /** timeline data needs a Riot API key */
  riotApiAvailable: boolean;
  backfill?: { running: boolean; done: number; total: number; message?: string };
  updatedAt: number;
}

export interface StaticDataPayload {
  version: string;
  ddragonBase: string;
  champions: Record<number, { key: string; name: string }>;
  spells: Record<number, { key: string; name: string }>;
  /** rune styles, perks and stat shards; icon is a Data Dragon path or "statmods/…" (CommunityDragon) */
  runes: Record<number, { name: string; icon: string }>;
  items: Record<number, { name: string; icon: string; gold: number }>;
}

export interface Diagnostics {
  state: ConnectionState;
  cacheBytes: number;
  settingsFile: string;
  logFile: string;
  recordingsDir: string;
  live: { connected: boolean; gameTime: number };
  overlay: OverlayStatus;
  version: string;
  crashDir: string;
  crashCount: number;
  prosFile: string;
  prosCount: number;
  metrics: ProcessMetric[];
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

export const IPC = {
  stateGet: 'state:get',
  stateChanged: 'state:changed',
  lobbyGet: 'lobby:get',
  lobbyChanged: 'lobby:changed',
  lobbyRefresh: 'lobby:refresh',
  lobbyReplayLast: 'lobby:replayLast',
  champGet: 'champ:get',
  champChanged: 'champ:changed',
  runesImport: 'runes:import',
  spellsApply: 'spells:apply',
  itemSetImport: 'itemset:import',
  liveGet: 'live:get',
  liveChanged: 'live:changed',
  jungleMark: 'jungle:mark',
  jungleClear: 'jungle:clear',
  overlayGet: 'overlay:get',
  overlayChanged: 'overlay:changed',
  overlayHover: 'overlay:hover',
  overlayToggle: 'overlay:toggle',
  overlayResize: 'overlay:resize',
  overlayDragStart: 'overlay:dragStart',
  overlayDrag: 'overlay:drag',
  overlayDragEnd: 'overlay:dragEnd',
  postGameGet: 'postgame:get',
  postGameChanged: 'postgame:changed',
  postGameAnalyzeLast: 'postgame:analyzeLast',
  postGameOpen: 'postgame:open',
  postGameBackfill: 'postgame:backfill',
  metaGet: 'meta:get',
  metaChanged: 'meta:changed',
  metaChampion: 'meta:champion',
  crawlerSet: 'crawler:set',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsChanged: 'settings:changed',
  staticGet: 'static:get',
  cacheClear: 'cache:clear',
  openLogs: 'app:openLogs',
  openRecordings: 'app:openRecordings',
  diagnosticsGet: 'diagnostics:get',
  updateGet: 'update:get',
  updateChanged: 'update:changed',
  updateCheck: 'update:check',
  updateInstall: 'update:install',
  settingsExport: 'settings:export',
  settingsImport: 'settings:import',
  crashesOpen: 'app:openCrashes',
  rendererError: 'app:rendererError',
  prosOpen: 'pros:open',
  prosReload: 'pros:reload',
} as const;

/** API exposed to the renderer through the preload script (window.poro). */
export interface PoroApi {
  getState(): Promise<ConnectionState>;
  onState(cb: (state: ConnectionState) => void): () => void;
  getLobby(): Promise<LobbySnapshot>;
  onLobby(cb: (snapshot: LobbySnapshot) => void): () => void;
  refreshLobby(): Promise<void>;
  /** Analyses the players of the local player's most recent game (post-game review). Returns an error message or undefined. */
  replayLastGame(): Promise<string | undefined>;
  getChampSelect(): Promise<ChampSelectInfo>;
  onChampSelect(cb: (info: ChampSelectInfo) => void): () => void;
  importRunes(page: RunePageSuggestion): Promise<ActionResult>;
  applySpells(spells: [number, number]): Promise<ActionResult>;
  importItemSet(kind?: 'personal' | 'meta'): Promise<ActionResult>;
  getLive(): Promise<LiveGameSnapshot>;
  onLive(cb: (snapshot: LiveGameSnapshot) => void): () => void;
  /** starts or clears the manual respawn timer of a jungle camp */
  markJungle(side: LiveTeam, campId: string): Promise<void>;
  clearJungle(): Promise<void>;
  getOverlay(): Promise<OverlayStatus>;
  onOverlay(cb: (status: OverlayStatus) => void): () => void;
  /** the cursor is over an interactive area of the overlay, which then takes the mouse (else click-through) */
  setOverlayHover(hover: boolean): void;
  toggleOverlay(): Promise<void>;
  /** the overlay window follows its content height */
  setOverlaySize(height: number): Promise<void>;
  /** manual drag of the overlay (transparent windows cannot rely on CSS drag regions) */
  overlayDragStart(): Promise<void>;
  overlayDrag(dx: number, dy: number): void;
  overlayDragEnd(): Promise<void>;
  getPostGame(): Promise<PostGameSnapshot>;
  onPostGame(cb: (snapshot: PostGameSnapshot) => void): () => void;
  /** analyses the local player's most recent game; returns an error message or undefined */
  analyzeLastGame(): Promise<string | undefined>;
  /** shows a stored report from the history */
  openPostGame(platform: string, gameId: number): Promise<void>;
  /** analyses the last games of the statistics window into the history (needs the Riot API key) */
  backfillHistory(limit?: number): Promise<void>;
  getMeta(): Promise<MetaSnapshot>;
  onMeta(cb: (snapshot: MetaSnapshot) => void): () => void;
  getMetaChampion(championId: number, role: Role): Promise<MetaChampion>;
  setCrawler(enabled: boolean): Promise<void>;
  getSettings(): Promise<AppSettings>;
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  onSettings(cb: (settings: AppSettings) => void): () => void;
  getStatic(): Promise<StaticDataPayload | null>;
  clearCache(): Promise<void>;
  openLogs(): Promise<void>;
  openRecordings(): Promise<void>;
  getDiagnostics(): Promise<Diagnostics>;
  getUpdate(): Promise<UpdateStatus>;
  onUpdate(cb: (status: UpdateStatus) => void): () => void;
  checkUpdate(): Promise<UpdateStatus>;
  /** quits and installs a downloaded update */
  installUpdate(): Promise<void>;
  /** save dialog; returns the written path or undefined when cancelled */
  exportSettings(): Promise<string | undefined>;
  /** open dialog; merges known keys into the settings */
  importSettings(): Promise<ActionResult>;
  openCrashes(): Promise<void>;
  /** window.onerror / unhandled rejections of the renderer, stored as local crash reports */
  reportError(kind: string, message: string, stack?: string): void;
  /** opens (and creates when missing) the local pro player list */
  openProList(): Promise<void>;
  /** re-reads the pro player list; returns the number of entries */
  reloadProList(): Promise<number>;
}
