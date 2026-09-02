import {
  ROLE_LABEL,
  formatGameTime,
  queueName,
  summarizeTrend,
  t,
  type ComparisonKey,
  type ComparisonRow,
  type Locale,
  type PostGameHistoryEntry,
  type PostGameParticipant,
  type PostGameReport,
} from '@poro/core';
import type { ConnectionState, PostGameSnapshot, StaticDataPayload } from '@shared/ipc';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { championName } from '../assets';
import { signed } from '../fmt';
import { IconChart, IconHistory, IconPlay } from './icons';
import { ChampIcon, Empty, PageHeader } from './ui';

interface Props {
  snapshot: PostGameSnapshot;
  sd: StaticDataPayload | null;
  locale: Locale;
  state?: ConnectionState;
}

const COMPARISON_LABEL: Record<ComparisonKey, { de: string; en: string; digits: number; pct?: boolean }> = {
  csPerMin: { de: 'CS / Min', en: 'CS / min', digits: 1 },
  goldPerMin: { de: 'Gold / Min', en: 'Gold / min', digits: 0 },
  dmgPerMin: { de: 'Schaden / Min', en: 'Damage / min', digits: 0 },
  kda: { de: 'KDA', en: 'KDA', digits: 2 },
  killParticipation: { de: 'Kill-Beteiligung', en: 'Kill participation', digits: 0, pct: true },
  visionPerMin: { de: 'Vision / Min', en: 'Vision / min', digits: 2 },
  wardsPerMin: { de: 'Wards / Min', en: 'Wards / min', digits: 2 },
};

/** Chart colours from the design tokens, so the light theme gets readable grids and tooltips. */
function chartTheme() {
  const css = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    grid: token('--chart-grid', '#1c2230'),
    axis: token('--chart-axis', '#8b95a8'),
    self: token('--accent', '#58a6ff'),
    opponent: '#ef4444',
    good: '#22c55e',
    bad: '#ef4444',
    tooltip: {
      background: token('--chart-tooltip', '#121722'),
      border: `1px solid ${token('--border-strong', '#2b3549')}`,
      color: token('--text', '#e6e9ef'),
      borderRadius: 6,
      fontSize: 12,
    },
  };
}

const fmt = (v: number, digits: number, pct?: boolean) =>
  pct ? `${Math.round(v * 100)}%` : v.toFixed(digits);

function ComparisonTiles({ rows, locale }: { rows: ComparisonRow[]; locale: Locale }) {
  return (
    <div className="tiles">
      {rows.map((r) => {
        const meta = COMPARISON_LABEL[r.key];
        const delta = r.average !== undefined ? r.value - r.average : undefined;
        const cls = delta === undefined ? '' : delta >= 0 ? 'pg-up' : 'pg-down';
        return (
          <div key={r.key} className="tile">
            <div className="eyebrow">{meta[locale]}</div>
            <div className="tile-value num">{fmt(r.value, meta.digits, meta.pct)}</div>
            <div className={`small num ${cls}`}>
              {r.average === undefined
                ? locale === 'de'
                  ? 'kein Schnitt'
                  : 'no average'
                : `Ø ${fmt(r.average, meta.digits, meta.pct)} (${delta! >= 0 ? '+' : ''}${fmt(delta!, meta.digits, meta.pct)})`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ParticipantRow({
  p,
  sd,
  self,
  minutes,
}: {
  p: PostGameParticipant;
  sd: StaticDataPayload | null;
  self: boolean;
  minutes: number;
}) {
  return (
    <div className={`pg-prow ${self ? 'pg-self' : ''}`}>
      <ChampIcon sd={sd} id={p.championId} size={26} round />
      <span className="pg-pname" title={`${p.name}${p.tagLine ? `#${p.tagLine}` : ''}`}>
        {p.name}
      </span>
      <span>
        {p.kills}/{p.deaths}/{p.assists}
      </span>
      <span>{(p.cs / minutes).toFixed(1)} cs/m</span>
      <span>{(p.damage.total / 1000).toFixed(1)}k</span>
      <span>{(p.gold / 1000).toFixed(1)}k</span>
      <span>{p.visionScore}</span>
    </div>
  );
}

function Report({
  report,
  comparison,
  sd,
  locale,
}: {
  report: PostGameReport;
  comparison: ComparisonRow[];
  sd: StaticDataPayload | null;
  locale: Locale;
}) {
  const de = locale === 'de';
  const CHART = chartTheme();
  const minutes = Math.max(1, report.durationSec / 60);
  const s = report.summary;
  const curves = report.curves;
  const goldData = curves?.gold.map((g, i) => ({
    minute: g.minute,
    self: g.self,
    opponent: g.opponent,
    team: curves.teamGoldDiff[i]?.diff ?? 0,
  }));
  const csData = curves?.cs.map((c) => ({ minute: c.minute, self: c.self, opponent: c.opponent }));
  const dmg = report.self.damage;
  const objectives = report.objectives;
  const objRows = objectives
    ? ([
        [de ? 'Drachen' : 'Dragons', objectives.dragons],
        [de ? 'Herold' : 'Herald', objectives.heralds],
        [de ? 'Leerenbruten' : 'Voidgrubs', objectives.grubs],
        ['Baron', objectives.barons],
        [de ? 'Türme' : 'Turrets', objectives.turrets],
        [de ? 'Inhibitoren' : 'Inhibitors', objectives.inhibitors],
      ] as const)
    : [];
  const axis = { stroke: CHART.axis, fontSize: 11 };

  return (
    <div className="pg-report">
      <div className={`card pg-head ${report.win ? 'pg-win' : 'pg-loss'}`}>
        <ChampIcon sd={sd} id={report.self.championId} size={52} round />
        <div className="min0">
          <div className="pg-result">
            {report.win ? (de ? 'Sieg' : 'Victory') : de ? 'Niederlage' : 'Defeat'}
            <span className="muted pg-queue"> · {t(queueName(report.queueId), locale)}</span>
          </div>
          <div className="muted small">
            {championName(sd, report.self.championId)} · {t(ROLE_LABEL[report.self.role], locale)} ·{' '}
            {formatGameTime(report.durationSec)} ·{' '}
            {new Date(report.gameCreation).toLocaleString(de ? 'de-DE' : 'en-GB', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
            {!report.hasTimeline && (
              <span> · {de ? 'ohne Timeline (Riot API Key nötig)' : 'no timeline (needs Riot API key)'}</span>
            )}
          </div>
        </div>
        <div className="pg-kda num">
          <span className="big">
            {report.self.kills}/{report.self.deaths}/{report.self.assists}
          </span>
          <span className="muted small">
            KDA {s.kdaRatio.toFixed(2)} · KP {Math.round(s.killParticipation * 100)}%
          </span>
        </div>
        {report.opponent && (
          <div className="pg-vs">
            <span className="muted small">{de ? 'gegen' : 'vs'}</span>
            <ChampIcon sd={sd} id={report.opponent.championId} size={36} round />
            <span className="small">{report.opponent.name}</span>
          </div>
        )}
      </div>

      <ComparisonTiles rows={comparison} locale={locale} />

      {report.laneDiff && report.laneDiff.length > 0 && (
        <div className="pg-lane num">
          <span className="eyebrow">{de ? 'Lane-Differenz' : 'Lane difference'}</span>
          {report.laneDiff.map((d) => (
            <span key={d.at} className={`pg-lane-cell ${d.gold >= 0 ? 'pg-up' : 'pg-down'}`}>
              @{d.at} {signed(d.gold)} Gold · {signed(d.cs)} CS · {signed(d.xp)} XP
            </span>
          ))}
        </div>
      )}

      {goldData && csData && (
        <div className="pg-charts">
          <div className="card pg-chart">
            <div className="eyebrow">{de ? 'Gold: du vs. Lane-Gegner' : 'Gold: you vs lane opponent'}</div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={goldData} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                <XAxis dataKey="minute" {...axis} />
                <YAxis {...axis} width={48} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                <Tooltip contentStyle={CHART.tooltip} />
                <Line
                  isAnimationActive={false}
                  type="monotone"
                  dataKey="self"
                  name={de ? 'Du' : 'You'}
                  stroke={CHART.self}
                  dot={false}
                  strokeWidth={2}
                />
                {report.opponent && (
                  <Line
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="opponent"
                    name={report.opponent.name}
                    stroke={CHART.opponent}
                    dot={false}
                    strokeWidth={2}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="card pg-chart">
            <div className="eyebrow">{de ? 'Team-Gold-Differenz' : 'Team gold difference'}</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={goldData} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                <XAxis dataKey="minute" {...axis} />
                <YAxis {...axis} width={48} tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}k`} />
                <Tooltip contentStyle={CHART.tooltip} />
                <ReferenceLine y={0} stroke={CHART.axis} />
                <Bar isAnimationActive={false} dataKey="team" name={de ? 'Differenz' : 'difference'}>
                  {goldData.map((d) => (
                    <Cell key={d.minute} fill={d.team >= 0 ? CHART.good : CHART.bad} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="card pg-chart">
            <div className="eyebrow">{de ? 'CS-Verlauf' : 'CS over time'}</div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={csData} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                <XAxis dataKey="minute" {...axis} />
                <YAxis {...axis} width={40} />
                <Tooltip contentStyle={CHART.tooltip} />
                <Line
                  isAnimationActive={false}
                  type="monotone"
                  dataKey="self"
                  name={de ? 'Du' : 'You'}
                  stroke={CHART.self}
                  dot={false}
                  strokeWidth={2}
                />
                {report.opponent && (
                  <Line
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="opponent"
                    name={report.opponent.name}
                    stroke={CHART.opponent}
                    dot={false}
                    strokeWidth={2}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="pg-grid">
        <div className="card card-pad">
          <div className="pg-block-title">{de ? 'Schaden an Champions' : 'Damage to champions'}</div>
          <div className="pg-dmgbar" title={`${dmg.total}`}>
            {dmg.total > 0 && (
              <>
                <span className="pg-dmg-ad" style={{ width: `${(dmg.physical / dmg.total) * 100}%` }} />
                <span className="pg-dmg-ap" style={{ width: `${(dmg.magic / dmg.total) * 100}%` }} />
                <span className="pg-dmg-true" style={{ width: `${(dmg.true / dmg.total) * 100}%` }} />
              </>
            )}
          </div>
          <div className="small muted num">
            {(dmg.total / 1000).toFixed(1)}k · {Math.round(s.dmgShare * 100)}% {de ? 'des Teams' : 'of team'}{' '}
            · AD {Math.round((dmg.physical / Math.max(1, dmg.total)) * 100)}% / AP{' '}
            {Math.round((dmg.magic / Math.max(1, dmg.total)) * 100)}% / True{' '}
            {Math.round((dmg.true / Math.max(1, dmg.total)) * 100)}%
          </div>
          <div className="small muted num">
            {de ? 'Erlitten' : 'Taken'} {(report.self.damageTaken / 1000).toFixed(1)}k (
            {Math.round(s.dmgTakenShare * 100)}%) · {de ? 'Abgeschwächt' : 'Mitigated'}{' '}
            {(report.self.damageMitigated / 1000).toFixed(1)}k · CC {Math.round(report.self.ccTime)}s
          </div>
        </div>
        <div className="card card-pad">
          <div className="pg-block-title">Vision</div>
          <div className="small num">
            {de ? 'Vision-Score' : 'Vision score'} {report.self.visionScore} ({s.visionPerMin.toFixed(2)}/min)
            · Wards {report.self.wardsPlaced} · {de ? 'zerstört' : 'killed'} {report.self.wardsKilled} ·{' '}
            {de ? 'Kontroll-Wards' : 'Control wards'} {report.self.controlWards}
          </div>
          {report.deaths && (
            <div className="small muted pg-deaths num">
              {de ? 'Tode' : 'Deaths'}:{' '}
              {report.deaths.length === 0
                ? '–'
                : report.deaths.map((d, i) => (
                    <span key={i}>
                      {i > 0 && ', '}
                      {formatGameTime(d.minute * 60)}
                      {d.killerChampionId ? ` (${championName(sd, d.killerChampionId)})` : ''}
                    </span>
                  ))}
            </div>
          )}
        </div>
        {objectives && (
          <div className="card card-pad">
            <div className="pg-block-title">
              {de ? 'Objectives (Team : Gegner · beteiligt)' : 'Objectives (team : enemy · involved)'}
            </div>
            <div className="pg-objectives num">
              {objRows.map(([label, c]) => (
                <div key={label} className="small">
                  <span className="muted">{label}</span>
                  <span>
                    {c.team} : {c.enemy} · {c.participated}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="pg-teams">
        {[report.allies, report.enemies].map((team, i) => (
          <div key={i} className={`card pg-team team-${i === 0 ? 'ally' : 'enemy'}`}>
            <header className="card-head">
              <span className="card-title">
                {i === 0 ? (de ? 'Eigenes Team' : 'Your team') : de ? 'Gegner' : 'Enemy team'}
              </span>
            </header>
            <div className="pg-table num">
              <div className="pg-prow pg-prow-head muted small">
                <span />
                <span>{de ? 'Spieler' : 'Player'}</span>
                <span>KDA</span>
                <span>CS</span>
                <span>{de ? 'Schaden' : 'Damage'}</span>
                <span>Gold</span>
                <span>Vision</span>
              </div>
              {team.map((p) => (
                <ParticipantRow
                  key={p.participantId}
                  p={p}
                  sd={sd}
                  self={p.participantId === report.self.participantId}
                  minutes={minutes}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Trend({
  entries,
  sd,
  locale,
  onOpen,
}: {
  entries: PostGameHistoryEntry[];
  sd: StaticDataPayload | null;
  locale: Locale;
  onOpen: (e: PostGameHistoryEntry) => void;
}) {
  const de = locale === 'de';
  const CHART = chartTheme();
  const summary = summarizeTrend(entries);
  const data = [...entries].reverse().map((e) => ({
    id: e.gameId,
    label: championName(sd, e.championId),
    csPerMin: e.csPerMin,
    goldDiff10: e.goldDiff10 ?? 0,
    win: e.win,
  }));
  return (
    <div className="card pg-trend">
      <header className="card-head">
        <span className="card-title">
          {de ? `Trend der letzten ${summary.games} Spiele` : `Trend of the last ${summary.games} games`}
        </span>
        {summary.games > 0 && (
          <span className="muted small num">
            {Math.round(summary.winrate * 100)}% {de ? 'Siege' : 'wins'} · Ø {summary.avgCsPerMin} CS/min · Ø
            KDA {summary.avgKda} · Ø KP {Math.round(summary.avgKillParticipation * 100)}%
            {summary.avgGoldDiff10 !== undefined && ` · Ø Gold @10 ${signed(summary.avgGoldDiff10)}`}
          </span>
        )}
      </header>
      <div className="card-pad">
        {data.length > 0 && (
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                stroke={CHART.axis}
                fontSize={10}
                interval={0}
                angle={-30}
                height={40}
                textAnchor="end"
              />
              <YAxis stroke={CHART.axis} fontSize={11} width={36} />
              <Tooltip contentStyle={CHART.tooltip} />
              <Bar isAnimationActive={false} dataKey="csPerMin" name="CS/min">
                {data.map((d) => (
                  <Cell key={d.id} fill={d.win ? CHART.good : CHART.bad} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        <div className="pg-history num">
          {entries.map((e) => (
            <button
              key={`${e.platform}-${e.gameId}`}
              type="button"
              className={`pg-hrow ${e.win ? 'pg-hwin' : 'pg-hloss'}`}
              onClick={() => onOpen(e)}
            >
              <ChampIcon sd={sd} id={e.championId} size={24} round />
              <span className="pg-hname">{championName(sd, e.championId)}</span>
              <span className={e.win ? 'val-good' : 'val-bad'}>
                {e.win ? (de ? 'Sieg' : 'Win') : de ? 'Niederlage' : 'Loss'}
              </span>
              <span>
                {e.kills}/{e.deaths}/{e.assists}
              </span>
              <span>{e.csPerMin} cs/m</span>
              <span>{e.goldDiff10 !== undefined ? `${signed(e.goldDiff10)} @10` : ''}</span>
              <span className="muted">
                {new Date(e.gameCreation).toLocaleDateString(de ? 'de-DE' : 'en-GB')}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PostGameView({ snapshot, sd, locale, state }: Props) {
  const de = locale === 'de';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const status = snapshot.status;
  const statusText =
    status === 'loading'
      ? de
        ? 'Lade Spiel…'
        : 'Loading game…'
      : status === 'waiting'
        ? (snapshot.message ?? (de ? 'Warte auf Match-Daten von Riot…' : 'Waiting for Riot match data…'))
        : snapshot.message;

  return (
    <>
      <PageHeader title="Post-Game" state={state} locale={locale}>
        {snapshot.backfill && (snapshot.backfill.running || snapshot.backfill.message) && (
          <span className="muted small head-info">
            {snapshot.backfill.message ?? `${snapshot.backfill.done}/${snapshot.backfill.total}`}
          </span>
        )}
        {statusText && (
          <span className={`small head-info ${status === 'error' ? 'error' : 'muted'}`}>{statusText}</span>
        )}
        {error && <span className="small error head-info">{error}</span>}
        <button
          type="button"
          className="btn btn-sm"
          disabled={!snapshot.riotApiAvailable || snapshot.backfill?.running}
          onClick={() => void window.poro.backfillHistory(20)}
          title={snapshot.riotApiAvailable ? '' : de ? 'Riot API Key nötig' : 'needs a Riot API key'}
        >
          <IconHistory size={14} />
          {de ? 'Historie aufbauen' : 'Build history'}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || status === 'loading'}
          onClick={() => {
            setBusy(true);
            setError(undefined);
            void window.poro
              .analyzeLastGame()
              .then((err) => setError(err))
              .finally(() => setBusy(false));
          }}
        >
          <IconPlay size={14} />
          {de ? 'Letztes Spiel analysieren' : 'Analyse last game'}
        </button>
      </PageHeader>
      <div className="page-main postgame">
        {snapshot.report ? (
          <Report report={snapshot.report} comparison={snapshot.comparison} sd={sd} locale={locale} />
        ) : (
          <Empty
            icon={<IconChart size={36} strokeWidth={1.4} />}
            title={de ? 'Noch keine Auswertung' : 'No review yet'}
          >
            <p>
              {de
                ? 'Nach jedem Spiel erscheint hier die Auswertung: Lane-Verlauf gegen den Gegner, Schaden, Vision, Objectives und der Vergleich zu deinem Schnitt.'
                : 'After each game the review appears here: lane curves against your opponent, damage, vision, objectives and the comparison to your average.'}
            </p>
          </Empty>
        )}
        <Trend
          entries={snapshot.trend}
          sd={sd}
          locale={locale}
          onOpen={(e) => void window.poro.openPostGame(e.platform, e.gameId)}
        />
      </div>
    </>
  );
}
