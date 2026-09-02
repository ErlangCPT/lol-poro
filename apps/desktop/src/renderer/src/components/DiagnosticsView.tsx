import type { Locale } from '@poro/core';
import type { ConnectionState, Diagnostics } from '@shared/ipc';
import { useEffect, useState } from 'react';
import { IconAlert, IconFolder, IconRefresh, IconTrash } from './icons';
import { Card, PageHeader } from './ui';

export function DiagnosticsView({ state, locale }: { state: ConnectionState; locale: Locale }) {
  const de = locale === 'de';
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => void window.poro.getDiagnostics().then(setDiag);
  useEffect(load, [state]);
  // Process metrics are deltas between samples; refresh them every few seconds while the tab is open.
  useEffect(() => {
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  const row = (label: string, value: string | number | undefined) => (
    <tr>
      <th>{label}</th>
      <td>{value ?? '–'}</td>
    </tr>
  );
  const totalCpu = diag ? diag.metrics.reduce((a, m) => a + m.cpu, 0) : 0;

  return (
    <>
      <PageHeader
        title={de ? 'Diagnose' : 'Diagnostics'}
        subtitle={diag ? `Poro ${diag.version}` : undefined}
        state={state}
        locale={locale}
      />
      <div className="page-main diagnostics">
        <Card>
          <table className="kv">
            <tbody>
              {row('LCU', state.lcu)}
              {row('Port', state.port)}
              {row('Phase', state.phase)}
              {row(
                'Summoner',
                state.summoner
                  ? `${state.summoner.gameName}#${state.summoner.tagLine} (Level ${state.summoner.level ?? '?'})`
                  : undefined,
              )}
              {row('Region', state.region)}
              {row('Data Dragon', state.staticDataVersion ?? state.staticDataError)}
              {row(
                'Riot API',
                state.riotApi
                  ? state.riotApi.error
                    ? `${de ? 'Fehler' : 'error'}: ${state.riotApi.error}`
                    : de
                      ? 'Key aktiv'
                      : 'key active'
                  : de
                    ? 'kein Key'
                    : 'no key',
              )}
              {row(de ? 'Letzter Fehler' : 'Last error', state.lastError)}
              {row('Cache', diag ? `${(diag.cacheBytes / 1024 / 1024).toFixed(1)} MB` : undefined)}
              {row('Settings', diag?.settingsFile)}
              {row('Log', diag?.logFile)}
              {row(de ? 'Aufzeichnungen' : 'Recordings', diag?.recordingsDir)}
              {row(
                de ? 'Absturzberichte' : 'Crash reports',
                diag ? `${diag.crashCount} · ${diag.crashDir}` : undefined,
              )}
              {row(
                de ? 'Pro-Spieler-Liste' : 'Pro player list',
                diag ? `${diag.prosCount} ${de ? 'Einträge' : 'entries'} · ${diag.prosFile}` : undefined,
              )}
            </tbody>
          </table>
        </Card>

        <Card pad={false}>
          <header className="card-head">
            <span className="card-title">{de ? 'Prozesse' : 'Processes'}</span>
            <span className="muted small num">
              {de ? 'CPU gesamt' : 'total CPU'} {totalCpu.toFixed(1)} % ·{' '}
              {de ? 'Ziel Overlay unter 2 %' : 'target overlay below 2%'}
            </span>
          </header>
          <table className="kv metrics num">
            <thead>
              <tr>
                <th>{de ? 'Prozess' : 'Process'}</th>
                <th>PID</th>
                <th>CPU</th>
                <th>RAM</th>
              </tr>
            </thead>
            <tbody>
              {(diag?.metrics ?? []).map((m) => (
                <tr key={m.pid}>
                  <td>
                    {m.name ?? m.type}
                    <span className="muted small"> · {m.type}</span>
                  </td>
                  <td>{m.pid}</td>
                  <td className={m.cpu >= 5 ? 'val-bad' : ''}>{m.cpu.toFixed(1)} %</td>
                  <td>{m.memoryMb} MB</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="actions">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void window.poro
                .clearCache()
                .then(load)
                .finally(() => setBusy(false));
            }}
          >
            <IconTrash size={14} />
            {de ? 'Cache leeren' : 'Clear cache'}
          </button>
          <button type="button" className="btn" onClick={() => void window.poro.openLogs()}>
            <IconFolder size={14} />
            {de ? 'Logs öffnen' : 'Open logs'}
          </button>
          <button type="button" className="btn" onClick={() => void window.poro.openCrashes()}>
            <IconAlert size={14} />
            {de ? 'Absturzberichte öffnen' : 'Open crash reports'}
          </button>
          <button type="button" className="btn" onClick={() => void window.poro.openRecordings()}>
            <IconFolder size={14} />
            {de ? 'Aufzeichnungen öffnen' : 'Open recordings'}
          </button>
          <button type="button" className="btn" onClick={() => void window.poro.refreshLobby()}>
            <IconRefresh size={14} />
            {de ? 'Lobby neu laden' : 'Reload lobby'}
          </button>
        </div>
        <p className="muted small">
          {de
            ? 'Wenn der Client nicht gefunden wird: Läuft LeagueClientUx.exe? Blockiert eine Firewall lokale HTTPS-Verbindungen auf 127.0.0.1? Absturzberichte bleiben lokal, nichts wird hochgeladen.'
            : 'If the client is not found: is LeagueClientUx.exe running? Does a firewall block local HTTPS connections to 127.0.0.1? Crash reports stay local, nothing is uploaded.'}
        </p>
      </div>
    </>
  );
}
