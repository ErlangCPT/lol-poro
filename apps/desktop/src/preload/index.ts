import { contextBridge, ipcRenderer } from 'electron';
import type { LiveTeam, Role, RunePageSuggestion } from '@poro/core';
import {
  IPC,
  type AppSettings,
  type ChampSelectInfo,
  type ConnectionState,
  type LiveGameSnapshot,
  type LobbySnapshot,
  type MetaSnapshot,
  type OverlayStatus,
  type PoroApi,
  type PostGameSnapshot,
  type UpdateStatus,
} from '@shared/ipc';

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: PoroApi = {
  getState: () => ipcRenderer.invoke(IPC.stateGet),
  onState: (cb) => subscribe<ConnectionState>(IPC.stateChanged, cb),
  getLobby: () => ipcRenderer.invoke(IPC.lobbyGet),
  onLobby: (cb) => subscribe<LobbySnapshot>(IPC.lobbyChanged, cb),
  refreshLobby: () => ipcRenderer.invoke(IPC.lobbyRefresh),
  replayLastGame: () => ipcRenderer.invoke(IPC.lobbyReplayLast),
  getChampSelect: () => ipcRenderer.invoke(IPC.champGet),
  onChampSelect: (cb) => subscribe<ChampSelectInfo>(IPC.champChanged, cb),
  importRunes: (page: RunePageSuggestion) => ipcRenderer.invoke(IPC.runesImport, page),
  applySpells: (spells: [number, number]) => ipcRenderer.invoke(IPC.spellsApply, spells),
  importItemSet: (kind?: 'personal' | 'meta') => ipcRenderer.invoke(IPC.itemSetImport, kind),
  getLive: () => ipcRenderer.invoke(IPC.liveGet),
  onLive: (cb) => subscribe<LiveGameSnapshot>(IPC.liveChanged, cb),
  markJungle: (side: LiveTeam, campId: string) => ipcRenderer.invoke(IPC.jungleMark, side, campId),
  clearJungle: () => ipcRenderer.invoke(IPC.jungleClear),
  getOverlay: () => ipcRenderer.invoke(IPC.overlayGet),
  onOverlay: (cb) => subscribe<OverlayStatus>(IPC.overlayChanged, cb),
  setOverlayHover: (hover: boolean) => ipcRenderer.send(IPC.overlayHover, hover),
  toggleOverlay: () => ipcRenderer.invoke(IPC.overlayToggle),
  setOverlaySize: (height: number) => ipcRenderer.invoke(IPC.overlayResize, height),
  overlayDragStart: () => ipcRenderer.invoke(IPC.overlayDragStart),
  overlayDrag: (dx: number, dy: number) => ipcRenderer.send(IPC.overlayDrag, dx, dy),
  overlayDragEnd: () => ipcRenderer.invoke(IPC.overlayDragEnd),
  getPostGame: () => ipcRenderer.invoke(IPC.postGameGet),
  onPostGame: (cb) => subscribe<PostGameSnapshot>(IPC.postGameChanged, cb),
  analyzeLastGame: () => ipcRenderer.invoke(IPC.postGameAnalyzeLast),
  openPostGame: (platform: string, gameId: number) => ipcRenderer.invoke(IPC.postGameOpen, platform, gameId),
  backfillHistory: (limit?: number) => ipcRenderer.invoke(IPC.postGameBackfill, limit),
  getMeta: () => ipcRenderer.invoke(IPC.metaGet),
  onMeta: (cb) => subscribe<MetaSnapshot>(IPC.metaChanged, cb),
  getMetaChampion: (championId: number, role: Role) => ipcRenderer.invoke(IPC.metaChampion, championId, role),
  setCrawler: (enabled: boolean) => ipcRenderer.invoke(IPC.crawlerSet, enabled),
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  updateSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
  onSettings: (cb) => subscribe<AppSettings>(IPC.settingsChanged, cb),
  getStatic: () => ipcRenderer.invoke(IPC.staticGet),
  clearCache: () => ipcRenderer.invoke(IPC.cacheClear),
  openLogs: () => ipcRenderer.invoke(IPC.openLogs),
  openRecordings: () => ipcRenderer.invoke(IPC.openRecordings),
  getDiagnostics: () => ipcRenderer.invoke(IPC.diagnosticsGet),
  getUpdate: () => ipcRenderer.invoke(IPC.updateGet),
  onUpdate: (cb) => subscribe<UpdateStatus>(IPC.updateChanged, cb),
  checkUpdate: () => ipcRenderer.invoke(IPC.updateCheck),
  installUpdate: () => ipcRenderer.invoke(IPC.updateInstall),
  exportSettings: () => ipcRenderer.invoke(IPC.settingsExport),
  importSettings: () => ipcRenderer.invoke(IPC.settingsImport),
  openCrashes: () => ipcRenderer.invoke(IPC.crashesOpen),
  reportError: (kind: string, message: string, stack?: string) =>
    ipcRenderer.send(IPC.rendererError, kind, message, stack),
  openProList: () => ipcRenderer.invoke(IPC.prosOpen),
  reloadProList: () => ipcRenderer.invoke(IPC.prosReload),
};

contextBridge.exposeInMainWorld('poro', api);
