import type { LiveTeam, RunePageSuggestion } from '@poro/core';
import {
  LcuWatcher,
  acceptReadyCheck,
  findLeagueInstallDir,
  getGameflowPhase,
  getRegionLocale,
  readGameWindowMode,
  type GameflowPhase,
  type LcuClient,
} from '@poro/lcu';
import { RiotApi, platformFromRegion } from '@poro/riot-api';
import { StaticData } from '@poro/static-data';
import { HistoryStore, JsonFileCache, SettingsStore, StatsStore } from '@poro/storage';
import { BrowserWindow, app, dialog, ipcMain, shell, webContents } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_SETTINGS,
  IPC,
  type ActionResult,
  type AppSettings,
  type ConnectionState,
  type Diagnostics,
  type ProcessMetric,
  type StaticDataPayload,
} from '@shared/ipc';
import { CrashReporter } from './crash';
import { GameWindowTracker } from './game-window';
import { Logger } from './logger';
import { OverlayWindow } from './overlay';
import { ProList } from './pros';
import { UpdateService } from './updater';
import { ChampSelectService } from './services/champ-select';
import { buildDemoSnapshot } from './services/demo';
import { DemoLiveFeed } from './services/demo-live';
import { InGameService } from './services/in-game';
import { LobbyService } from './services/lobby-service';
import { PlayerDataService } from './services/player-data';
import { PostGameService } from './services/post-game';
import { StatsService } from './services/stats';

const userData = app.getPath('userData');
const log = new Logger(join(userData, 'logs', 'main.log'), { console: !app.isPackaged });
const crashes = new CrashReporter(userData, log);
crashes.install();
const pros = new ProList(userData, log);
const settings = new SettingsStore<AppSettings>(join(userData, 'settings.json'), DEFAULT_SETTINGS);
const cache = new JsonFileCache(join(userData, 'cache'));
const history = new HistoryStore(join(userData, 'history.sqlite'));
const statsStore = new StatsStore(join(userData, 'stats.sqlite'));
const recordingsDir = join(userData, 'recordings');
const staticData = new StaticData(
  join(userData, 'static'),
  settings.get().locale === 'de' ? 'de_DE' : 'en_US',
);
const watcher = new LcuWatcher({ pollMs: 3000 });

let mainWindow: BrowserWindow | null = null;
let client: LcuClient | null = null;
let localSummonerId: number | undefined;

const state: ConnectionState = {
  lcu: 'searching',
  phase: 'Unknown',
  userDataPath: userData,
  riotApi: settings.get().riotApiKey ? { active: true } : undefined,
};

const IN_GAME_PHASES = new Set<string>(['GameStart', 'InProgress', 'Reconnect']);

function send(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

/** Sends to every window (main window and overlay). */
function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function publishState(): void {
  broadcast(IPC.stateChanged, state);
}

// Developer aids: `--demo` shows a synthetic lobby, `--demo-live` a synthetic running game (overlay + panel).
const demoMode = process.argv.includes('--demo');
const demoLive = process.argv.includes('--demo-live');

let riotApi: RiotApi | null = null;
let riotApiKeyInUse = '';
function getRiotApi(): RiotApi | null {
  const key = settings.get().riotApiKey.trim();
  if (!key) {
    riotApi = null;
    riotApiKeyInUse = '';
    return null;
  }
  if (!riotApi || riotApiKeyInUse !== key) {
    riotApi = new RiotApi(key);
    riotApiKeyInUse = key;
    state.riotApi = { active: true };
  }
  return riotApi;
}

const playerData = new PlayerDataService(
  cache,
  {
    getClient: () => client,
    getRiotApi,
    getPlatform: () => platformFromRegion(state.region),
    onRiotApiError: (message) => {
      state.riotApi = { active: false, error: message };
      publishState();
    },
  },
  log,
);
const lobby = new LobbyService({
  playerData,
  championInfo: (id) => staticData.champion(id),
  getSettings: () => settings.get(),
  getClient: () => client,
  getLocalPuuid: () => state.summoner?.puuid,
  getPro: (puuid, gameName, tagLine) => pros.lookup(puuid, gameName, tagLine),
  publish: (snapshot) => {
    if (demoMode) return; // the synthetic lobby must not be overwritten by the real client
    send(IPC.lobbyChanged, snapshot);
    champSelect.onLobbySnapshot(snapshot);
    inGame.recompute();
  },
  recordingsDir,
  log,
});
const champSelect = new ChampSelectService({
  getClient: () => client,
  staticData,
  getLocalPuuid: () => state.summoner?.puuid,
  getLocalSummonerId: () => localSummonerId,
  getBundle: (puuid) => lobby.getBundle(puuid),
  isLoading: (puuid) => lobby.isLoading(puuid),
  getMeta: (championId, role, enemies, mine) => stats.forPick(championId, role, enemies, mine),
  getSettings: () => settings.get(),
  publish: (info) => send(IPC.champChanged, info),
  log,
});

const stats = new StatsService({
  getRiotApi,
  getPlatform: () => platformFromRegion(state.region),
  getSettings: () => settings.get(),
  staticData,
  store: statsStore,
  publish: (snapshot) => send(IPC.metaChanged, snapshot),
  log,
});

const postGame = new PostGameService({
  getClient: () => client,
  getRiotApi,
  getPlatform: () => platformFromRegion(state.region),
  getLocalPuuid: () => state.summoner?.puuid,
  getLocalIdentity: () =>
    state.summoner ? { gameName: state.summoner.gameName, tagLine: state.summoner.tagLine } : undefined,
  getLobbyGameId: () => lobby.current.gameId,
  getSettings: () => settings.get(),
  cache,
  history,
  playerData,
  publish: (snapshot) => send(IPC.postGameChanged, snapshot),
  log,
});

const gameWindow = new GameWindowTracker(log);

const updates = new UpdateService({
  getUrl: () => settings.get().updateUrl,
  publish: (status) => broadcast(IPC.updateChanged, status),
  log,
});

const overlay = new OverlayWindow({
  getSettings: () => settings.get(),
  updateSettings: (patch) => {
    const next = settings.update(patch);
    broadcast(IPC.settingsChanged, next);
  },
  publish: (status) => broadcast(IPC.overlayChanged, status),
  onWindow: (win) => {
    attachConsoleLogging(win, 'overlay');
    // Developer aid: `--screenshot-overlay=C:\path\shot.png` captures the overlay window and quits.
    const target = argValue('--screenshot-overlay=');
    if (target) {
      win.webContents.once('did-finish-load', () => {
        setTimeout(
          () => {
            win.webContents
              .capturePage()
              .then((img) => {
                writeFileSync(target, img.toPNG());
                log.info('overlay screenshot saved', target);
              })
              .catch((e) => log.error('overlay screenshot failed', e))
              .finally(() => app.quit());
          },
          Number(argValue('--screenshot-delay=')) || 4000,
        );
      });
    }
  },
  log,
});

const inGame = new InGameService({
  staticData,
  getLobby: () => currentLobby(),
  getLocalName: () =>
    state.summoner ? { gameName: state.summoner.gameName, tagLine: state.summoner.tagLine } : undefined,
  getSettings: () => settings.get(),
  readWindowMode: async () => {
    const dir = await findLeagueInstallDir();
    return dir ? readGameWindowMode(dir) : null;
  },
  publish: (snapshot) => {
    broadcast(IPC.liveChanged, snapshot);
    gameWindow.setActive(snapshot.connected);
    overlay.setWanted(snapshot.connected);
  },
  log,
});

function argValue(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function currentLobby() {
  return demoMode && staticData.isLoaded ? buildDemoSnapshot((id) => staticData.champion(id)) : lobby.current;
}

function staticPayload(): StaticDataPayload | null {
  const snap = staticData.getSnapshot();
  if (!snap) return null;
  const runes: StaticDataPayload['runes'] = {};
  for (const style of snap.runeStyles) {
    runes[style.id] = { name: style.name, icon: style.icon };
    for (const p of style.perks) runes[p.id] = { name: p.name, icon: p.icon };
  }
  for (const id of [5001, 5002, 5003, 5005, 5007, 5008, 5010, 5011, 5013]) {
    const r = staticData.rune(id);
    if (r) runes[id] = { name: r.name, icon: r.icon };
  }
  return {
    version: snap.version,
    ddragonBase: 'https://ddragon.leagueoflegends.com/cdn',
    champions: Object.fromEntries(snap.champions.map((c) => [c.id, { key: c.key, name: c.name }])),
    spells: Object.fromEntries(snap.spells.map((s) => [s.id, { key: s.key, name: s.name }])),
    runes,
    items: Object.fromEntries(snap.items.map((i) => [i.id, { name: i.name, icon: i.icon, gold: i.gold }])),
  };
}

let demoFeed: DemoLiveFeed | null = null;
function startDemoLive(): void {
  if (!demoLive || demoFeed) return;
  const analysis = currentLobby().analysis;
  demoFeed = new DemoLiveFeed(analysis, (id) => staticData.champion(id)?.key);
  const feed = demoFeed;
  let seen = -1;
  const tick = () => {
    const data = feed.data();
    const fresh = data.events.Events.filter((e) => e.EventID > seen);
    seen = fresh.reduce((m, e) => Math.max(m, e.EventID), seen);
    inGame.ingest(data, fresh, true);
  };
  tick();
  setInterval(tick, 1000);
  log.info('demo live feed started');
}

async function initStaticData(): Promise<void> {
  try {
    const snap = await staticData.init();
    state.staticDataVersion = snap.version;
    state.staticDataError = undefined;
    log.info(
      'static data ready',
      snap.version,
      `${snap.champions.length} champions, ${snap.items.length} items`,
    );
    lobby.recompute();
    stats.apply();
    if (demoMode) {
      const demo = currentLobby();
      send(IPC.lobbyChanged, demo);
      champSelect.onLobbySnapshot(demo);
    }
    startDemoLive();
  } catch (e) {
    state.staticDataError = e instanceof Error ? e.message : String(e);
    log.error('static data failed', e);
  }
  publishState();
}

function setPhase(phase: string): void {
  state.phase = phase;
  if (phase === 'EndOfGame') void postGame.onGameEnd();
  inGame.setActive(IN_GAME_PHASES.has(phase));
  publishState();
}

function wireWatcher(): void {
  watcher.on('status', (s) => {
    state.lcu = s;
    state.port = watcher.current?.port;
    if (s !== 'connected') setPhase('Unknown');
    else publishState();
  });
  watcher.on('error', (e) => {
    state.lastError = e.message;
    log.warn('lcu', e.message);
  });
  watcher.on('disconnected', () => {
    client = null;
    state.summoner = undefined;
    localSummonerId = undefined;
    lobby.reset('League Client getrennt');
    publishState();
  });
  watcher.on('connected', async (c, summoner) => {
    client = c;
    state.port = c.port;
    localSummonerId = summoner.summonerId;
    state.summoner = {
      puuid: summoner.puuid,
      gameName: summoner.gameName,
      tagLine: summoner.tagLine,
      level: summoner.summonerLevel,
    };
    state.lastError = undefined;
    log.info('lcu connected', `${summoner.gameName}#${summoner.tagLine}`, `port ${c.port}`);
    try {
      state.region = (await getRegionLocale(c)).region;
    } catch {
      // not critical
    }
    c.on('event', (ev) => {
      try {
        if (ev.topic === 'OnJsonApiEvent_lol-gameflow_v1_gameflow-phase') {
          const phase = ev.data as GameflowPhase;
          setPhase(phase);
          void lobby.handlePhase(phase);
        } else if (ev.topic === 'OnJsonApiEvent_lol-champ-select_v1_session') {
          if (ev.eventType === 'Delete') return;
          lobby.handleChampSelectSession(ev.data as import('@poro/lcu').LcuChampSelectSession);
        } else if (ev.topic === 'OnJsonApiEvent_lol-gameflow_v1_session') {
          const session = ev.data as import('@poro/lcu').LcuGameflowSession;
          if (settings.get().autoAcceptReadyCheck && session?.phase === 'ReadyCheck') {
            acceptReadyCheck(c).catch(() => undefined);
          }
          lobby.handleGameflowSession(session);
        }
      } catch (e) {
        log.error('event handling failed', e);
      }
    });
    try {
      const phase = await getGameflowPhase(c);
      setPhase(phase);
      await lobby.handlePhase(phase, true);
    } catch (e) {
      log.warn('initial phase failed', e);
    }
    publishState();
    postGame.refreshLists();
    stats.apply();
    void postGame.autoBackfill();
    // Developer aid: `electron . --postgame-last` opens the post-game review of the last game after connecting.
    if (process.argv.includes('--postgame-last')) {
      const err = await postGame.analyzeLast();
      if (err) log.warn('post-game failed', err);
    }
    // Developer aid: `electron . --replay-last-game` analyses the last game right after connecting.
    if (process.argv.includes('--replay-last-game')) {
      const err = await lobby.replayLastGame().catch((e) => String(e));
      if (err) log.warn('replay failed', err);
    }
  });
}

/** Applies a settings patch and lets the services react to what changed. */
function applySettings(patch: Partial<AppSettings>): AppSettings {
  const before = settings.get();
  const after = settings.update(patch);
  broadcast(IPC.settingsChanged, after);
  if (before.riotApiKey !== after.riotApiKey) {
    state.riotApi = after.riotApiKey ? { active: true } : undefined;
    publishState();
  }
  if (
    before.windowDays !== after.windowDays ||
    before.fetchFullGames !== after.fetchFullGames ||
    before.riotApiKey !== after.riotApiKey
  )
    void lobby.refresh();
  else lobby.recompute();
  overlay.apply();
  if (before.hotkeyInteractive !== after.hotkeyInteractive || before.hotkeyToggle !== after.hotkeyToggle)
    overlay.registerHotkeys();
  stats.apply();
  return after;
}

/** Everything except the API key and the overlay position, as a JSON file the user picks. */
async function exportSettings(): Promise<string | undefined> {
  if (!mainWindow) return undefined;
  const de = settings.get().locale === 'de';
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: de ? 'Poro-Einstellungen exportieren' : 'Export Poro settings',
    defaultPath: join(app.getPath('documents'), 'poro-settings.json'),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return undefined;
  const { riotApiKey: _key, overlayBounds: _bounds, ...rest } = settings.get();
  writeFileSync(
    filePath,
    JSON.stringify({ poro: app.getVersion(), exportedAt: new Date().toISOString(), settings: rest }, null, 2),
  );
  log.info('settings exported', filePath);
  return filePath;
}

/** Reads a JSON export (or a raw settings.json) and takes over every known key with the right type. */
async function importSettings(): Promise<ActionResult> {
  if (!mainWindow) return { ok: false, message: 'no window' };
  const de = settings.get().locale === 'de';
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: de ? 'Poro-Einstellungen importieren' : 'Import Poro settings',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  const file = filePaths[0];
  if (canceled || !file) return { ok: false, message: de ? 'Abgebrochen' : 'Cancelled' };
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    const source = (
      parsed && typeof parsed === 'object' && 'settings' in parsed ? parsed.settings : parsed
    ) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    let n = 0;
    for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
      const value = source[key];
      if (value !== undefined && typeof value === typeof def && (key !== 'riotApiKey' || value)) {
        patch[key] = value;
        n++;
      }
    }
    applySettings(patch as Partial<AppSettings>);
    log.info('settings imported', file, `${n} keys`);
    return { ok: true, message: de ? `${n} Einstellungen übernommen` : `${n} settings applied` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Last CPU-time sample per process; percentCPUUsage of getAppMetrics is only filled for the main process on Windows. */
const cpuSamples = new Map<number, { seconds: number; at: number }>();

function processMetrics(): ProcessMetric[] {
  const titles = new Map<number, string>();
  for (const wc of webContents.getAllWebContents()) {
    try {
      titles.set(wc.getOSProcessId(), wc.getTitle() || 'renderer');
    } catch {
      // destroyed
    }
  }
  const now = Date.now();
  const metrics = app.getAppMetrics();
  const alive = new Set(metrics.map((m) => m.pid));
  for (const pid of cpuSamples.keys()) if (!alive.has(pid)) cpuSamples.delete(pid);
  return metrics.map((m) => {
    let cpu = m.cpu.percentCPUUsage;
    const seconds = m.cpu.cumulativeCPUUsage;
    if (seconds !== undefined) {
      const prev = cpuSamples.get(m.pid);
      if (prev && now > prev.at) cpu = ((seconds - prev.seconds) / ((now - prev.at) / 1000)) * 100;
      cpuSamples.set(m.pid, { seconds, at: now });
    }
    return {
      type: m.type,
      pid: m.pid,
      name: m.type === 'Browser' ? 'main' : (titles.get(m.pid) ?? m.name),
      cpu: Math.max(0, Math.round(cpu * 10) / 10),
      memoryMb: Math.round(m.memory.workingSetSize / 1024),
    };
  });
}

function registerIpc(): void {
  ipcMain.handle(IPC.stateGet, () => state);
  ipcMain.handle(IPC.lobbyGet, () => currentLobby());
  ipcMain.handle(IPC.lobbyRefresh, () => lobby.refresh());
  ipcMain.handle(IPC.lobbyReplayLast, () =>
    lobby.replayLastGame().catch((e) => (e instanceof Error ? e.message : String(e))),
  );
  ipcMain.handle(IPC.champGet, () => champSelect.current);
  ipcMain.handle(IPC.runesImport, (_e, page: RunePageSuggestion) => champSelect.importRunes(page));
  ipcMain.handle(IPC.spellsApply, (_e, spells: [number, number]) => champSelect.applySpells(spells));
  ipcMain.handle(IPC.itemSetImport, (_e, kind?: 'personal' | 'meta') =>
    champSelect.importItemSet(kind ?? 'personal'),
  );
  ipcMain.handle(IPC.liveGet, () => inGame.current);
  ipcMain.handle(IPC.jungleMark, (_e, side: LiveTeam, campId: string) => inGame.markJungle(side, campId));
  ipcMain.handle(IPC.jungleClear, () => inGame.clearJungle());
  ipcMain.handle(IPC.overlayGet, () => overlay.status());
  ipcMain.handle(IPC.overlaySetInteractive, (_e, interactive: boolean) =>
    overlay.setInteractive(interactive),
  );
  ipcMain.handle(IPC.overlayToggle, () => overlay.toggleEnabled());
  ipcMain.handle(IPC.overlayResize, (_e, height: number) => overlay.resizeTo(height));
  ipcMain.handle(IPC.overlayDragStart, () => overlay.beginDrag());
  ipcMain.on(IPC.overlayDrag, (_e, dx: number, dy: number) => overlay.dragTo(dx, dy));
  ipcMain.handle(IPC.overlayDragEnd, () => overlay.endDrag());
  ipcMain.handle(IPC.postGameGet, () => postGame.current);
  ipcMain.handle(IPC.postGameAnalyzeLast, () => postGame.analyzeLast());
  ipcMain.handle(IPC.postGameOpen, (_e, platform: string, gameId: number) => postGame.open(platform, gameId));
  ipcMain.handle(IPC.postGameBackfill, (_e, limit?: number) => postGame.backfill(limit));
  ipcMain.handle(IPC.metaGet, () => stats.current());
  ipcMain.handle(IPC.metaChampion, (_e, championId: number, role: import('@poro/core').Role) =>
    stats.champion(championId, role),
  );
  ipcMain.handle(IPC.crawlerSet, (_e, enabled: boolean) => {
    const after = settings.update({ crawlerEnabled: enabled });
    broadcast(IPC.settingsChanged, after);
    stats.apply();
  });
  ipcMain.handle(IPC.settingsGet, () => settings.get());
  ipcMain.handle(IPC.settingsUpdate, (_e, patch: Partial<AppSettings>) => applySettings(patch));
  ipcMain.handle(IPC.settingsExport, () => exportSettings());
  ipcMain.handle(IPC.settingsImport, () => importSettings());
  ipcMain.handle(IPC.updateGet, () => updates.current());
  ipcMain.handle(IPC.updateCheck, () => updates.check());
  ipcMain.handle(IPC.updateInstall, () => updates.install());
  ipcMain.handle(IPC.crashesOpen, () => {
    mkdirSync(crashes.dir, { recursive: true });
    return shell.openPath(crashes.dir).then(() => undefined);
  });
  ipcMain.on(IPC.rendererError, (e, kind: string, message: string, stack?: string) => {
    const source = e.sender.getTitle() === 'Poro Overlay' ? 'overlay' : 'renderer';
    crashes.fromRenderer(source, String(kind), String(message), stack ? String(stack) : undefined);
  });
  ipcMain.handle(IPC.prosOpen, () => shell.openPath(pros.ensureFile()).then(() => undefined));
  ipcMain.handle(IPC.prosReload, () => {
    const n = pros.load();
    lobby.recompute();
    return n;
  });
  ipcMain.handle(IPC.staticGet, () => staticPayload());
  ipcMain.handle(IPC.cacheClear, () => {
    cache.clear();
    log.info('cache cleared');
  });
  ipcMain.handle(IPC.openLogs, () => shell.showItemInFolder(log.file));
  ipcMain.handle(IPC.openRecordings, () => {
    mkdirSync(recordingsDir, { recursive: true });
    return shell.openPath(recordingsDir).then(() => undefined);
  });
  ipcMain.handle(IPC.diagnosticsGet, (): Diagnostics => ({
    state,
    cacheBytes: cache.sizeBytes(),
    settingsFile: join(userData, 'settings.json'),
    logFile: log.file,
    recordingsDir,
    live: { connected: inGame.current.connected, gameTime: inGame.gameTimeNow() },
    overlay: overlay.status(),
    version: app.getVersion(),
    crashDir: crashes.dir,
    crashCount: crashes.count(),
    prosFile: pros.file,
    prosCount: pros.size(),
    metrics: processMetrics(),
  }));
}

function attachConsoleLogging(win: BrowserWindow, name: string): void {
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error') log.error(name, event.message, `${event.sourceId}:${event.lineNumber}`);
    else if (event.level === 'warning') log.warn(name, event.message);
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0b0e14',
    title: 'Poro',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    overlay.destroy();
    app.quit();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  attachConsoleLogging(mainWindow, 'renderer');
  // Developer aid: `electron . --screenshot=C:\path\shot.png` renders the window, saves a PNG and quits.
  const target = argValue('--screenshot=');
  if (target) {
    const delay = Number(argValue('--screenshot-delay=')) || 2500;
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        mainWindow?.webContents
          .capturePage()
          .then((img) => {
            writeFileSync(target, img.toPNG());
            log.info('screenshot saved', target);
          })
          .catch((e) => log.error('screenshot failed', e))
          .finally(() => app.quit());
      }, delay);
    });
  }
  // Developer aid: `--tab=meta` opens the window on a tab (lobby, postgame, meta, settings, diagnostics).
  // `--theme=light` forces a theme for screenshots without touching the settings.
  const tab = argValue('--tab=');
  const theme = argValue('--theme=');
  const query: Record<string, string> = {};
  if (tab) query.tab = tab;
  if (theme) query.theme = theme;
  const search = Object.keys(query).length ? `?${new URLSearchParams(query).toString()}` : '';
  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL + search);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'), search ? { query } : undefined);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => {
    app.setAppUserModelId('gg.poro.companion');
    log.info('app start', app.getVersion(), process.platform);
    registerIpc();
    createWindow();
    wireWatcher();
    watcher.start();
    void initStaticData();
    cache.prune();
    overlay.registerHotkeys();
    log.info('pro list', `${pros.load()} entries`);
    if (settings.get().updateCheckOnStart && settings.get().updateUrl.trim())
      setTimeout(() => void updates.check(), 15_000);
    gameWindow.on('rect', (rect) => overlay.follow(rect));
    if (!demoLive) inGame.start();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
  app.on('will-quit', () => {
    history.close();
    stats.stop();
    statsStore.close();
    overlay.destroy();
    gameWindow.setActive(false);
    inGame.stop();
  });
  app.on('window-all-closed', () => {
    watcher.stop();
    app.quit();
  });
}
