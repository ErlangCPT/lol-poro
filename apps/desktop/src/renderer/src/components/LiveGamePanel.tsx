import {
  JUNGLE_CAMPS,
  formatGameTime,
  formatRank,
  t,
  type LiveTeam,
  type Locale,
  type ObjectiveTimer,
} from '@poro/core';
import type { LiveGameSnapshot, LivePlayerView, StaticDataPayload } from '@shared/ipc';
import type { CSSProperties } from 'react';
import { championIcon } from '../assets';
import { pct } from '../fmt';
import { liveGameTime, useNow } from '../hooks';
import { DRAGON_COLOR, IconTower, ObjectiveIcon } from './icons';

interface Props {
  live: LiveGameSnapshot;
  sd: StaticDataPayload | null;
  locale: Locale;
  /** overlay layout: narrower rows, fewer columns */
  compact?: boolean;
  showPlayers?: boolean;
  showJungle?: boolean;
}

const TIER_CODE: Record<string, string> = {
  IRON: 'I',
  BRONZE: 'B',
  SILVER: 'S',
  GOLD: 'G',
  PLATINUM: 'P',
  EMERALD: 'E',
  DIAMOND: 'D',
  MASTER: 'M',
  GRANDMASTER: 'GM',
  CHALLENGER: 'C',
};
const DIVISION_NUMBER: Record<string, string> = { I: '1', II: '2', III: '3', IV: '4' };

/** "PLATINUM" + "II" → "P2" for the narrow overlay rows. */
function shortRank(tier: string, division: string): string {
  const code = TIER_CODE[tier.toUpperCase()] ?? tier.slice(0, 1);
  return `${code}${DIVISION_NUMBER[division] ?? ''}`;
}

function teamLabel(team: LiveTeam, selfTeam: LiveTeam | undefined, de: boolean): string {
  if (selfTeam) return team === selfTeam ? (de ? 'Eigenes Team' : 'Your team') : de ? 'Gegner' : 'Enemy';
  return team === 'ORDER' ? (de ? 'Blau' : 'Blue') : de ? 'Rot' : 'Red';
}

function DragonDot({ type }: { type: string }) {
  return (
    <span className="ddot" style={{ background: DRAGON_COLOR[type] ?? DRAGON_COLOR.Unknown }} title={type} />
  );
}

function ObjectiveChip({
  o,
  gameTime,
  locale,
  compact,
}: {
  o: ObjectiveTimer;
  gameTime: number;
  locale: Locale;
  compact: boolean;
}) {
  const de = locale === 'de';
  let value: string;
  let cls = '';
  if (o.status === 'alive') {
    value = de ? 'auf der Karte' : 'on the map';
    cls = 'obj-alive';
    if (o.despawnAt !== undefined) {
      const left = o.despawnAt - gameTime;
      value = compact ? `-${formatGameTime(left)}` : `${de ? 'weg in' : 'leaves in'} ${formatGameTime(left)}`;
      if (left < 60) cls = 'obj-soon';
    } else if (compact) {
      value = de ? 'da' : 'up';
    }
  } else if (o.status === 'gone') {
    value = o.detail ? t(o.detail, locale) : '–';
    cls = 'obj-gone';
  } else {
    const left = (o.spawnAt ?? 0) - gameTime;
    value = formatGameTime(left);
    if (left <= 60) cls = 'obj-soon';
  }
  const owner =
    o.team && o.kind === 'inhibitor'
      ? ` (${o.team === 'ORDER' ? (de ? 'Blau' : 'Blue') : de ? 'Rot' : 'Red'})`
      : '';
  const detail = o.detail && o.status !== 'gone' ? t(o.detail, locale) : '';
  const title = `${t(o.label, locale)}${owner}${detail ? ` · ${detail}` : ''}`;
  const dragonType = o.kind === 'dragon' && o.detail && o.status !== 'gone' ? o.detail.en : undefined;
  return (
    <div className={`obj ${cls} obj-${o.kind}`} title={title}>
      <span className="obj-icon">
        <ObjectiveIcon kind={o.kind} size={compact ? 13 : 14} />
      </span>
      {!compact && (
        <span className="obj-label">
          {t(o.label, locale)}
          {owner}
          {detail && <span className="muted"> · {detail}</span>}
        </span>
      )}
      {compact && dragonType && DRAGON_COLOR[dragonType] && <DragonDot type={dragonType} />}
      <span className="obj-value num">{value}</span>
    </div>
  );
}

function PlayerRow({
  p,
  sd,
  locale,
  compact,
}: {
  p: LivePlayerView;
  sd: StaticDataPayload | null;
  locale: Locale;
  compact: boolean;
}) {
  const icon = championIcon(sd, p.championId);
  const rank = p.rank
    ? compact
      ? shortRank(p.rank.tier, p.rank.division)
      : formatRank(p.rank.tier, p.rank.division, p.rank.lp, locale)
    : '';
  return (
    <div className={`live-row ${p.isSelf ? 'live-self' : ''} ${p.isDead ? 'live-dead' : ''}`}>
      <span className="live-champ">
        {icon ? <img src={icon} alt={p.championName} /> : <span className="live-champ-ph" />}
        <span className="live-level num">{p.level}</span>
        {p.isDead && p.respawnTimer > 0 && (
          <span className="live-respawn num">{Math.ceil(p.respawnTimer)}</span>
        )}
      </span>
      <span className="live-name" title={`${p.gameName}#${p.tagLine}`}>
        {p.gameName || p.championName}
      </span>
      <span className="live-kda">
        {p.kills}/{p.deaths}/{p.assists}
      </span>
      <span className="live-cs" title="CS (pro Minute)">
        {p.cs} <span className="muted">({p.csPerMin.toFixed(1)})</span>
      </span>
      <span className="live-kp" title="Kill participation">
        {p.killParticipation === undefined ? '–' : pct(p.killParticipation, 'en')}
      </span>
      {!compact && (
        <>
          <span className="live-ms" title="CS @10 / @20">
            {p.cs10 ?? '–'}
            {p.cs20 !== undefined ? ` / ${p.cs20}` : ''}
          </span>
          <span className="live-ms" title="Wards @10 / @20">
            {p.wards10 !== undefined ? Math.round(p.wards10) : '–'}
            {p.wards20 !== undefined ? ` / ${Math.round(p.wards20)}` : ''}
          </span>
          <span className="live-gold" title="Itemwert">
            {(p.itemGold / 1000).toFixed(1)}k
          </span>
        </>
      )}
      <span className="live-rank">
        {rank && <span>{rank}</span>}
        {p.winrate !== undefined && (
          <span className={`muted ${p.winrate >= 0.55 ? 'val-good' : p.winrate < 0.45 ? 'val-bad' : ''}`}>
            {' '}
            {pct(p.winrate, 'en')}
          </span>
        )}
      </span>
    </div>
  );
}

export function LiveGamePanel({
  live,
  sd,
  locale,
  compact = false,
  showPlayers = true,
  showJungle = true,
}: Props) {
  const de = locale === 'de';
  const now = useNow();
  const gameTime = liveGameTime(live, now);
  const self = live.selfTeam;
  const first: LiveTeam = self ?? 'ORDER';
  const second: LiveTeam = first === 'ORDER' ? 'CHAOS' : 'ORDER';
  const teams = live.teams;

  const dragons = (team: LiveTeam) =>
    teams[team].dragons.length === 0 ? (
      <span className="muted">–</span>
    ) : (
      teams[team].dragons.map((d, i) => <DragonDot key={i} type={d} />)
    );

  const jungleSide = (side: LiveTeam) => (
    <div className={`jungle-side side-${side}`} key={side}>
      <span className="muted small jungle-title">{teamLabel(side, self, de)}</span>
      <div className="jungle-grid">
        {JUNGLE_CAMPS.map((camp) => {
          const timer = live.jungle.find((j) => j.side === side && j.campId === camp.id);
          const left = timer ? timer.respawnAt - gameTime : 0;
          const progress = timer ? Math.max(0, Math.min(1, 1 - left / camp.respawn)) : 0;
          return (
            <button
              key={camp.id}
              type="button"
              className={`camp ${timer ? 'camp-active' : ''} ${timer && left < 30 ? 'camp-soon' : ''}`}
              style={timer ? ({ '--p': `${Math.round(progress * 100)}%` } as CSSProperties) : undefined}
              title={t(camp.label, locale)}
              onClick={() => void window.poro.markJungle(side, camp.id)}
            >
              <span className="camp-name">{camp.short}</span>
              <span className="camp-time num">{timer ? formatGameTime(left) : '·'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className={`live-panel ${compact ? 'live-compact' : ''}`}>
      <div className="live-head">
        <span className="live-clock num">{formatGameTime(gameTime)}</span>
        <span className="live-score num">
          <span className={`team-${first}`}>{teams[first].kills}</span>
          <span className="muted"> : </span>
          <span className={`team-${second}`}>{teams[second].kills}</span>
        </span>
        <span className="live-objscore muted small num">
          <IconTower size={13} strokeWidth={2} /> {teams[first].turrets}:{teams[second].turrets}
          <span className="live-dragons">
            {dragons(first)}
            <span className="muted"> : </span>
            {dragons(second)}
          </span>
          {live.soul && (
            <span> · Soul {live.soul === first ? (de ? 'wir' : 'us') : de ? 'Gegner' : 'enemy'}</span>
          )}
        </span>
        {live.demo && <span className="pill">Demo</span>}
      </div>
      {live.warnings.map((w, i) => (
        <div key={i} className="live-warning">
          {t(w, locale)}
        </div>
      ))}
      <div className="live-objectives">
        {live.objectives.map((o) => (
          <ObjectiveChip key={o.id} o={o} gameTime={gameTime} locale={locale} compact={compact} />
        ))}
      </div>
      {showPlayers && live.players.length > 0 && (
        <div className="live-players">
          {[first, second].map((team) => (
            <div key={team} className={`live-team live-team-${team}`}>
              <div className="live-team-head">
                <span className={`team-${team}`}>{teamLabel(team, self, de)}</span>
                <span className="muted small num">
                  {de ? 'Itemwert' : 'item value'} ≈ {(teams[team].itemGold / 1000).toFixed(1)}k · CS{' '}
                  {teams[team].cs}
                </span>
              </div>
              {live.players
                .filter((p) => p.team === team)
                .map((p) => (
                  <PlayerRow key={p.key} p={p} sd={sd} locale={locale} compact={compact} />
                ))}
            </div>
          ))}
          {!compact && (
            <div className="muted small live-legend">
              {de
                ? 'KP = Kill-Beteiligung · CS/Wards @10/@20 werden ab Spielstart mitgeschnitten · Itemwert ist eine Schätzung des ausgegebenen Golds.'
                : 'KP = kill participation · CS/wards @10/@20 are captured from game start · item value estimates gold spent.'}
            </div>
          )}
        </div>
      )}
      {showJungle && (
        <div className="live-jungle">
          <div className="live-team-head">
            <span>{de ? 'Jungle-Timer' : 'Jungle timers'}</span>
            <span className="muted small">{de ? 'Klick = Camp gecleart' : 'click = camp cleared'}</span>
          </div>
          {jungleSide(first)}
          {jungleSide(second)}
        </div>
      )}
    </div>
  );
}
