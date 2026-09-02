import type { AppSettings, ChampSelectInfo } from '@shared/ipc';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DiagnosticsView } from './components/DiagnosticsView';
import {
  IconBars,
  IconChart,
  IconCheck,
  IconDownload,
  IconGear,
  IconLobby,
  IconPulse,
  IconX,
} from './components/icons';
import { LobbyView } from './components/LobbyView';
import { MetaView } from './components/MetaView';
import { PostGameView } from './components/PostGameView';
import { SettingsView } from './components/SettingsView';
import { SidebarStatus } from './components/StatusBar';
import { useAppData } from './hooks';
import { useUpdateStatus } from './update';

type Tab = 'lobby' | 'postgame' | 'meta' | 'settings' | 'diagnostics';
const TABS: Tab[] = ['lobby', 'postgame', 'meta', 'settings', 'diagnostics'];

const NAV_ICON: Record<Tab, ReactNode> = {
  lobby: <IconLobby />,
  postgame: <IconChart />,
  meta: <IconBars />,
  settings: <IconGear />,
  diagnostics: <IconPulse />,
};

interface ToastItem {
  id: number;
  ok: boolean;
  message: string;
}

/** Import results arrive as `lastAction`; each one is shown as a toast for a few seconds. */
function useToasts(action: ChampSelectInfo['lastAction']): [ToastItem[], (id: number) => void] {
  const [items, setItems] = useState<ToastItem[]>([]);
  const at = action?.at;
  useEffect(() => {
    if (!action || at === undefined) return;
    setItems((list) =>
      list.some((i) => i.id === at) ? list : [...list, { id: at, ok: action.ok, message: action.message }],
    );
    const timer = setTimeout(() => setItems((list) => list.filter((i) => i.id !== at)), 4500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at]);
  const dismiss = (id: number) => setItems((list) => list.filter((i) => i.id !== id));
  return [items, dismiss];
}

/** Applies the theme setting to the document; "system" follows the OS preference. */
function useTheme(theme: AppSettings['theme']): void {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    // `?theme=light` is a developer aid for screenshots (`--theme=light`).
    const forced = new URLSearchParams(window.location.search).get('theme');
    const apply = () => {
      const wanted = forced === 'light' || forced === 'dark' ? forced : theme;
      const effective = wanted === 'system' ? (media.matches ? 'light' : 'dark') : wanted;
      document.documentElement.dataset.theme = effective;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}

export function App() {
  const data = useAppData();
  const [tab, setTab] = useState<Tab>(() => {
    const wanted = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    return wanted && TABS.includes(wanted) ? wanted : 'lobby';
  });
  const shownGame = useRef(0);
  // A freshly analysed game opens the post-game tab once.
  useEffect(() => {
    const pg = data.postGame;
    if ((pg.status === 'ready' || pg.status === 'waiting') && pg.gameId && pg.gameId !== shownGame.current) {
      shownGame.current = pg.gameId;
      setTab('postgame');
    }
  }, [data.postGame]);
  useTheme(data.settings.theme);
  const locale = data.settings.locale;
  const de = locale === 'de';
  const labels: Record<Tab, string> = {
    lobby: de ? 'Lobby-Analyse' : 'Lobby analysis',
    postgame: 'Post-Game',
    meta: 'Meta',
    settings: de ? 'Einstellungen' : 'Settings',
    diagnostics: de ? 'Diagnose' : 'Diagnostics',
  };
  const [toasts, dismiss] = useToasts(data.champ.lastAction);
  const update = useUpdateStatus();
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const showUpdate = update.state === 'downloaded' && !updateDismissed;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand-mark" title="Poro">
          P
        </div>
        <nav className="side-nav" aria-label="Navigation">
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              className={`nav-btn ${tab === id ? 'active' : ''}`}
              title={labels[id]}
              aria-label={labels[id]}
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => setTab(id)}
            >
              {NAV_ICON[id]}
            </button>
          ))}
        </nav>
        <div className="spacer" />
        <SidebarStatus state={data.state} locale={locale} />
      </aside>
      <div className="app-body">
        {tab === 'lobby' && <LobbyView data={data} />}
        {tab === 'postgame' && (
          <PostGameView snapshot={data.postGame} sd={data.staticData} locale={locale} state={data.state} />
        )}
        {tab === 'meta' && (
          <MetaView
            meta={data.meta}
            sd={data.staticData}
            locale={locale}
            state={data.state}
            onToggleCrawler={(enabled) => void window.poro.setCrawler(enabled)}
          />
        )}
        {tab === 'settings' && (
          <SettingsView
            settings={data.settings}
            overlay={data.overlay}
            state={data.state}
            update={data.updateSettings}
          />
        )}
        {tab === 'diagnostics' && <DiagnosticsView state={data.state} locale={locale} />}
      </div>
      {(toasts.length > 0 || showUpdate) && (
        <div className="toasts" role="status" aria-live="polite">
          {showUpdate && (
            <div className="toast toast-update">
              <IconDownload size={16} />
              <span>
                {de ? `Poro ${update.version} ist heruntergeladen.` : `Poro ${update.version} is downloaded.`}
              </span>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void window.poro.installUpdate()}
              >
                {de ? 'Jetzt neu starten' : 'Restart now'}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setUpdateDismissed(true)}
                title={de ? 'Beim nächsten Beenden installieren' : 'Install on next quit'}
              >
                {de ? 'Später' : 'Later'}
              </button>
            </div>
          )}
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`toast ${t.ok ? 'toast-ok' : 'toast-fail'}`}
              onClick={() => dismiss(t.id)}
            >
              {t.ok ? <IconCheck size={16} /> : <IconX size={16} />}
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
