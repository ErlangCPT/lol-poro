import type { Locale } from '@poro/core';
import type { ConnectionState } from '@shared/ipc';

const PHASE_LABEL: Record<string, { de: string; en: string }> = {
  Unknown: { de: '–', en: '–' },
  None: { de: 'Hauptmenü', en: 'Main menu' },
  Lobby: { de: 'Lobby', en: 'Lobby' },
  Matchmaking: { de: 'Suche', en: 'Matchmaking' },
  ReadyCheck: { de: 'Spiel annehmen', en: 'Ready check' },
  ChampSelect: { de: 'Champion Select', en: 'Champion select' },
  GameStart: { de: 'Spielstart', en: 'Game start' },
  InProgress: { de: 'Im Spiel', en: 'In game' },
  Reconnect: { de: 'Reconnect', en: 'Reconnect' },
  WaitingForStats: { de: 'Warte auf Stats', en: 'Waiting for stats' },
  PreEndOfGame: { de: 'Spielende', en: 'End of game' },
  EndOfGame: { de: 'Spielende', en: 'End of game' },
};

const LCU_LABEL: Record<ConnectionState['lcu'], { de: string; en: string }> = {
  searching: { de: 'Suche League Client…', en: 'Looking for League client…' },
  connecting: { de: 'Verbinde…', en: 'Connecting…' },
  connected: { de: 'Verbunden', en: 'Connected' },
  disconnected: { de: 'Client geschlossen', en: 'Client closed' },
};

export function phaseLabel(state: ConnectionState, locale: Locale): string {
  return (PHASE_LABEL[state.phase] ?? { de: state.phase, en: state.phase })[locale];
}

export function lcuLabel(state: ConnectionState, locale: Locale): string {
  return LCU_LABEL[state.lcu][locale];
}

/** Right side of the page header: connection dot, Riot ID, region and the client phase. */
export function HeaderStatus({ state, locale }: { state: ConnectionState; locale: Locale }) {
  const problems = [
    state.staticDataError ? `Data Dragon: ${state.staticDataError}` : null,
    state.riotApi?.error ? `Riot API: ${state.riotApi.error}` : null,
  ].filter((p): p is string => !!p);
  return (
    <div className="head-status" title={lcuLabel(state, locale)}>
      {problems.map((p) => (
        <span key={p} className="chip chip-bad" title={p}>
          {p.split(':')[0]}
        </span>
      ))}
      <span className={`dot dot-${state.lcu}`} />
      {state.summoner ? (
        <span>
          {state.summoner.gameName}
          <span className="muted">#{state.summoner.tagLine}</span>
          {state.region && <span className="muted"> · {state.region}</span>}
        </span>
      ) : (
        <span className="muted">{lcuLabel(state, locale)}</span>
      )}
      {state.lcu === 'connected' && <span className="pill">{phaseLabel(state, locale)}</span>}
    </div>
  );
}

/** Status dot at the bottom of the sidebar. */
export function SidebarStatus({ state, locale }: { state: ConnectionState; locale: Locale }) {
  const text = [lcuLabel(state, locale), state.lcu === 'connected' ? phaseLabel(state, locale) : null]
    .filter(Boolean)
    .join(' · ');
  return <span className={`side-dot dot dot-${state.lcu}`} title={text} />;
}
