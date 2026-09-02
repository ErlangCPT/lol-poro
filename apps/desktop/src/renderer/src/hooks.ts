import { useCallback, useEffect, useState } from 'react';
import type {
  AppSettings,
  ChampSelectInfo,
  ConnectionState,
  LiveGameSnapshot,
  LobbySnapshot,
  MetaSnapshot,
  OverlayStatus,
  PostGameSnapshot,
  StaticDataPayload,
} from '@shared/ipc';
import { DEFAULT_SETTINGS } from '@shared/ipc';

export interface AppData {
  state: ConnectionState;
  lobby: LobbySnapshot;
  champ: ChampSelectInfo;
  live: LiveGameSnapshot;
  overlay: OverlayStatus;
  postGame: PostGameSnapshot;
  meta: MetaSnapshot;
  settings: AppSettings;
  staticData: StaticDataPayload | null;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  refreshLobby: () => Promise<void>;
}

const INITIAL_STATE: ConnectionState = { lcu: 'searching', phase: 'Unknown' };
const INITIAL_LOBBY: LobbySnapshot = {
  source: 'none',
  queueId: 0,
  gameId: 0,
  updatedAt: 0,
  loadingPlayers: 0,
};
const EMPTY_PROFILE = { champions: 0, ad: 0, ap: 0, mixed: 0, adShare: 0, apShare: 0 };
const INITIAL_CHAMP: ChampSelectInfo = {
  phase: 'none',
  championId: 0,
  championName: '',
  role: 'UNKNOWN',
  spells: [0, 0],
  allyChampionIds: [],
  enemyChampionIds: [],
  riotPages: [],
  riotPagesLoading: false,
  personalPages: [],
  personalGames: 0,
  personalLoading: false,
  matchups: [],
  allyDamage: EMPTY_PROFILE,
  enemyDamage: EMPTY_PROFILE,
};
const EMPTY_TEAM = {
  kills: 0,
  deaths: 0,
  assists: 0,
  cs: 0,
  itemGold: 0,
  turrets: 0,
  dragons: [],
  grubs: 0,
  heralds: 0,
  barons: 0,
  inhibitors: 0,
};
export const INITIAL_LIVE: LiveGameSnapshot = {
  connected: false,
  demo: false,
  gameTime: 0,
  receivedAt: 0,
  gameMode: '',
  mapNumber: 0,
  objectives: [],
  teams: { ORDER: EMPTY_TEAM, CHAOS: EMPTY_TEAM },
  players: [],
  jungle: [],
  warnings: [],
};
export const INITIAL_POSTGAME: PostGameSnapshot = {
  status: 'idle',
  comparison: [],
  trend: [],
  history: [],
  riotApiAvailable: false,
  updatedAt: 0,
};
export const INITIAL_META: MetaSnapshot = {
  hasKey: false,
  enabled: true,
  platform: '',
  patch: '',
  crawler: null,
  summary: null,
  updatedAt: 0,
};
export const INITIAL_OVERLAY: OverlayStatus = {
  enabled: true,
  visible: false,
  interactive: false,
  hotkeys: { interactive: 'Ctrl+Shift+O', toggle: 'Ctrl+Shift+P' },
};

/** Live game data, overlay status and settings; shared by the main window and the overlay window. */
export function useLiveData() {
  const [live, setLive] = useState<LiveGameSnapshot>(INITIAL_LIVE);
  const [overlay, setOverlay] = useState<OverlayStatus>(INITIAL_OVERLAY);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [staticData, setStaticData] = useState<StaticDataPayload | null>(null);

  useEffect(() => {
    const api = window.poro;
    void api.getLive().then(setLive);
    void api.getOverlay().then(setOverlay);
    void api.getSettings().then(setSettings);
    void api.getStatic().then(setStaticData);
    const offLive = api.onLive(setLive);
    const offOverlay = api.onOverlay(setOverlay);
    const offSettings = api.onSettings(setSettings);
    const offState = api.onState((s) => {
      if (s.staticDataVersion) void api.getStatic().then(setStaticData);
    });
    return () => {
      offLive();
      offOverlay();
      offSettings();
      offState();
    };
  }, []);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const next = await window.poro.updateSettings(patch);
    setSettings(next);
  }, []);

  return { live, overlay, settings, staticData, updateSettings };
}

export function useAppData(): AppData {
  const [state, setState] = useState<ConnectionState>(INITIAL_STATE);
  const [lobby, setLobby] = useState<LobbySnapshot>(INITIAL_LOBBY);
  const [champ, setChamp] = useState<ChampSelectInfo>(INITIAL_CHAMP);
  const [postGame, setPostGame] = useState<PostGameSnapshot>(INITIAL_POSTGAME);
  const [meta, setMeta] = useState<MetaSnapshot>(INITIAL_META);
  const liveData = useLiveData();

  useEffect(() => {
    const api = window.poro;
    void api.getState().then(setState);
    void api.getLobby().then(setLobby);
    void api.getChampSelect().then(setChamp);
    void api.getPostGame().then(setPostGame);
    void api.getMeta().then(setMeta);
    const offState = api.onState(setState);
    const offLobby = api.onLobby(setLobby);
    const offChamp = api.onChampSelect(setChamp);
    const offPostGame = api.onPostGame(setPostGame);
    const offMeta = api.onMeta(setMeta);
    return () => {
      offState();
      offLobby();
      offChamp();
      offPostGame();
      offMeta();
    };
  }, []);

  const refreshLobby = useCallback(() => window.poro.refreshLobby(), []);

  return { state, lobby, champ, postGame, meta, ...liveData, refreshLobby };
}

/** Ticks once per second; used for countdowns. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Game seconds right now, extrapolated from the last live poll. */
export function liveGameTime(live: LiveGameSnapshot, now: number): number {
  if (!live.connected) return 0;
  return live.gameTime + Math.max(0, now - live.receivedAt) / 1000;
}
