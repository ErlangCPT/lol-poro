import { ROLE_ORDER, queueName, t, type LobbyPlayer, type TeamSide } from '@poro/core';
import type { StaticDataPayload } from '@shared/ipc';
import { useState } from 'react';
import type { AppData } from '../hooks';
import { useNow } from '../hooks';
import { ChampSelectPanel } from './ChampSelectPanel';
import { IconLobby, IconRefresh } from './icons';
import { LiveGamePanel } from './LiveGamePanel';
import { TeamCard } from './TeamCard';
import { ChampIcon, Empty } from './ui';
import { PageHeader } from './ui';

function EmptyState({ data }: { data: AppData }) {
  const de = data.settings.locale === 'de';
  const { state, lobby } = data;
  const [replayError, setReplayError] = useState<string | undefined>();
  const [replaying, setReplaying] = useState(false);
  const connected = state.lcu === 'connected';
  const title = connected
    ? de
      ? 'Warte auf Champion Select'
      : 'Waiting for champion select'
    : de
      ? 'League Client nicht verbunden'
      : 'League client not connected';
  const text = connected
    ? de
      ? 'Sobald du in den Champion Select oder den Ladebildschirm kommst, erscheint hier die Analyse aller Spieler.'
      : 'As soon as you enter champion select or the loading screen, the analysis of all players appears here.'
    : de
      ? 'Starte League of Legends und logge dich ein. Poro verbindet sich automatisch.'
      : 'Start League of Legends and log in. Poro connects automatically.';
  return (
    <Empty icon={<IconLobby size={36} strokeWidth={1.4} />} title={title}>
      <p>{text}</p>
      {lobby.message && <p className="muted">{lobby.message}</p>}
      {state.lastError && !connected && <p className="muted small">{state.lastError}</p>}
      {connected && (
        <p>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={replaying}
            onClick={() => {
              setReplaying(true);
              setReplayError(undefined);
              void window.poro
                .replayLastGame()
                .then((err) => setReplayError(err))
                .finally(() => setReplaying(false));
            }}
          >
            {de ? 'Letztes Spiel analysieren' : 'Analyse last game'}
          </button>
        </p>
      )}
      {replayError && <p className="error small">{replayError}</p>}
    </Empty>
  );
}

function Bans({ ids, sd }: { ids: number[]; sd: StaticDataPayload | null }) {
  if (ids.length === 0) return <span className="muted small">–</span>;
  return (
    <span className="bans">
      {ids.map((id, i) => (
        <ChampIcon key={`${id}-${i}`} sd={sd} id={id} size={26} />
      ))}
    </span>
  );
}

function sortPlayers(players: LobbyPlayer[]): LobbyPlayer[] {
  return [...players].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.cellId - b.cellId);
}

export function LobbyView({ data }: { data: AppData }) {
  const { lobby, settings, staticData, state, champ } = data;
  const locale = settings.locale;
  const de = locale === 'de';
  const now = useNow();
  const livePanel = data.live.connected ? (
    <LiveGamePanel live={data.live} sd={staticData} locale={locale} />
  ) : null;

  if (lobby.source === 'none' || !lobby.analysis) {
    return (
      <>
        <PageHeader
          title={de ? 'Lobby-Analyse' : 'Lobby analysis'}
          subtitle={livePanel ? (de ? 'Laufendes Spiel' : 'Running game') : undefined}
          state={state}
          locale={locale}
        />
        <div className="page-main">{livePanel ?? <EmptyState data={data} />}</div>
      </>
    );
  }

  const analysis = lobby.analysis;
  const timeLeft = lobby.timer
    ? Math.max(0, Math.round((lobby.timer.timeLeftMs - (now - lobby.timer.receivedAt)) / 1000))
    : null;
  const sourceLabel =
    lobby.source === 'champselect'
      ? de
        ? 'Champion Select'
        : 'Champion select'
      : de
        ? 'Ladebildschirm / Im Spiel'
        : 'Loading screen / in game';
  const selfPuuid = state.summoner?.puuid;
  const players = (side: TeamSide) => sortPlayers(analysis.players.filter((p) => p.team === side));
  const hasBans = analysis.bans.ally.length + analysis.bans.enemy.length > 0;
  const statsInfo = `${
    settings.rankedOnly ? (de ? 'nur Ranked' : 'ranked only') : de ? 'Normal & Ranked' : 'normal & ranked'
  } · ${de ? `${settings.windowDays} Tage` : `${settings.windowDays} days`}`;

  return (
    <>
      <PageHeader
        title={t(queueName(analysis.queueId), locale)}
        subtitle={sourceLabel}
        lead={
          timeLeft !== null && lobby.source === 'champselect' ? (
            <span className="pill pill-gold num">{timeLeft} s</span>
          ) : undefined
        }
        state={state}
        locale={locale}
      >
        <span className="muted small head-info">
          {de ? 'Statistik: ' : 'Statistics: '}
          {statsInfo}
          {lobby.loadingPlayers > 0 && (
            <span className="loading-hint">
              {' '}
              · {de ? `lade ${lobby.loadingPlayers} Spieler…` : `loading ${lobby.loadingPlayers} players…`}
            </span>
          )}
        </span>
        <label className="toggle">
          <input
            type="checkbox"
            className="switch"
            checked={settings.rankedOnly}
            onChange={(e) => void data.updateSettings({ rankedOnly: e.target.checked })}
          />
          {de ? 'Nur Ranked' : 'Ranked only'}
        </label>
        <button type="button" className="btn btn-sm" onClick={() => void data.refreshLobby()}>
          <IconRefresh size={14} />
          {de ? 'Neu laden' : 'Reload'}
        </button>
      </PageHeader>
      <div className="page-main lobby">
        {livePanel}
        {hasBans && (
          <div className="bans-row">
            <span className="eyebrow">Bans</span>
            <Bans ids={analysis.bans.ally} sd={staticData} />
            <span className="bans-sep" />
            <Bans ids={analysis.bans.enemy} sd={staticData} />
          </div>
        )}
        <div className="teams">
          <TeamCard
            side="ally"
            team={analysis.teams.ally}
            players={players('ally')}
            locale={locale}
            sd={staticData}
            selfPuuid={selfPuuid}
          />
          <TeamCard
            side="enemy"
            team={analysis.teams.enemy}
            players={players('enemy')}
            locale={locale}
            sd={staticData}
            selfPuuid={selfPuuid}
          />
        </div>
        {champ.phase !== 'none' && <ChampSelectPanel champ={champ} sd={staticData} locale={locale} />}
      </div>
    </>
  );
}
