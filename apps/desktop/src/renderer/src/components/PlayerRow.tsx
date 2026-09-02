import {
  ROLE_LABEL,
  formatRank,
  tierLabel,
  type Locale,
  type LobbyPlayer,
  type RankedEntry,
} from '@poro/core';
import type { StaticDataPayload } from '@shared/ipc';
import { useState, type ReactNode } from 'react';
import { championIcon, championName, rankEmblem, spellIcon, spellName } from '../assets';
import { f1, f2, fmtK, games, kdaClass, pct, winrateClass } from '../fmt';
import { mainRanked } from '../rank';
import { RoleIcon } from './icons';
import { TagList, TagReasons } from './TagChip';
import { ChampIcon, Chip, Img, Skeleton, WinBar } from './ui';

type PremadeTone = 'premade-1' | 'premade-2' | 'premade-3';

function premadeTone(group: number | undefined): PremadeTone | undefined {
  if (!group) return undefined;
  return `premade-${((group - 1) % 3) + 1}` as PremadeTone;
}

function PlayerDetail({ player, locale, champ }: { player: LobbyPlayer; locale: Locale; champ: string }) {
  const de = locale === 'de';
  const stats = player.stats;
  const cs = player.championStats;
  const solo = player.ranked.find((r) => r.queue === 'RANKED_SOLO_5x5');
  const flex = player.ranked.find((r) => r.queue === 'RANKED_FLEX_SR');
  const prev = solo?.previousSeasonTier ?? flex?.previousSeasonTier;
  const cell = (label: string, value: ReactNode) =>
    value === undefined || value === null || value === '' ? null : (
      <div className="dcell" key={label}>
        <div className="eyebrow">{label}</div>
        <div className="num">{value}</div>
      </div>
    );
  const rankText = (e: RankedEntry | undefined) =>
    e && e.tier !== 'NONE'
      ? `${formatRank(e.tier, e.division, e.lp, locale)} · ${e.wins}W ${e.losses}L`
      : 'Unranked';
  const wins = (n: number) => `${n} ${de ? 'Siege' : 'wins'}`;

  return (
    <div className="prow-detail">
      <div className="dgrid">
        {stats && (
          <>
            {cell(
              de ? '12 Stunden' : '12 hours',
              `${games(stats.last12h.games, locale)} · ${wins(stats.last12h.wins)}`,
            )}
            {cell(
              de ? `${stats.windowDays} Tage` : `${stats.windowDays} days`,
              `${games(stats.games, locale)} · ${wins(stats.wins)}`,
            )}
            {cell('KDA', `${f1(stats.kda.kills)} / ${f1(stats.kda.deaths)} / ${f1(stats.kda.assists)}`)}
            {cell('CS / min', f1(stats.csPerMin))}
            {cell('Gold / min', Math.round(stats.goldPerMin))}
            {cell(de ? 'Schaden / min' : 'Damage / min', Math.round(stats.dmgPerMin))}
            {cell('Wards / min', f2(stats.wardsPerMin))}
            {cell('Vision / min', f2(stats.visionPerMin))}
            {stats.killParticipation !== undefined &&
              cell(de ? 'Kill-Beteiligung' : 'Kill participation', pct(stats.killParticipation, locale))}
            {cell(de ? 'Türme / Spiel' : 'Turrets / game', f1(stats.turretKillsPerGame))}
            {stats.streak &&
              cell(
                de ? 'Serie' : 'Streak',
                `${stats.streak.length} ${
                  stats.streak.type === 'win' ? (de ? 'Siege' : 'wins') : de ? 'Niederlagen' : 'losses'
                }`,
              )}
            {cell(
              de ? 'Hauptrollen' : 'Main roles',
              stats.mainRoles.map((r) => ROLE_LABEL[r][locale]).join(', ') || '–',
            )}
          </>
        )}
        {cell(
          de ? 'Rolle' : 'Role',
          `${ROLE_LABEL[player.role][locale]}${
            player.roleSource === 'inferred' ? (de ? ' (geschätzt)' : ' (inferred)') : ''
          }`,
        )}
        {cs &&
          cell(
            champ,
            `${pct(cs.winrate, locale)} · ${games(cs.games, locale)} · ${f1(cs.kills)} / ${f1(cs.deaths)} / ${f1(cs.assists)}`,
          )}
        {player.masteryLevel !== undefined &&
          cell(
            de ? 'Meisterschaft' : 'Mastery',
            `${de ? 'Stufe' : 'Level'} ${player.masteryLevel}${
              player.masteryPoints !== undefined
                ? ` · ${player.masteryPoints.toLocaleString(de ? 'de-DE' : 'en-GB')}`
                : ''
            }`,
          )}
        {cell('Solo/Duo', rankText(solo))}
        {cell('Flex', rankText(flex))}
        {prev && prev !== 'NONE' && cell(de ? 'Vorsaison' : 'Last season', tierLabel(prev, locale))}
        {player.identity?.level !== undefined && cell('Level', player.identity.level)}
      </div>
      {player.error && (
        <div className="error small">
          {de ? 'Fehler beim Laden: ' : 'Load error: '}
          {player.error}
        </div>
      )}
      <TagReasons tags={player.tags} locale={locale} />
    </div>
  );
}

export function PlayerRow({
  player,
  locale,
  sd,
  isSelf,
}: {
  player: LobbyPlayer;
  locale: Locale;
  sd: StaticDataPayload | null;
  isSelf: boolean;
}) {
  const de = locale === 'de';
  const [open, setOpen] = useState(false);
  const hidden = player.visibility === 'hidden';
  const name = player.identity?.gameName
    ? `${player.identity.gameName}${player.identity.tagLine ? `#${player.identity.tagLine}` : ''}`
    : hidden
      ? de
        ? `Mitspieler ${player.cellId + 1}`
        : `Ally #${player.cellId + 1}`
      : '…';
  const champ = championName(sd, player.championId);
  const icon = championIcon(sd, player.championId);
  const stats = player.stats;
  const cs = player.championStats;
  const main = mainRanked(player.ranked);
  const emblem = rankEmblem(main?.tier);
  const mains = stats ? [...stats.perChampion].sort((a, b) => b.games - a.games).slice(0, 3) : [];
  const tone = premadeTone(player.premadeGroup);
  const cls = [
    'prow',
    isSelf && 'prow-self',
    hidden && 'prow-hidden',
    tone && `prow-${tone}`,
    open && 'prow-open',
  ]
    .filter(Boolean)
    .join(' ');
  const toggle = () => {
    if (!hidden) setOpen((o) => !o);
  };

  return (
    <div className={cls}>
      <div
        className="prow-main"
        onClick={toggle}
        role={hidden ? undefined : 'button'}
        tabIndex={hidden ? -1 : 0}
        aria-expanded={hidden ? undefined : open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <div className="prow-champ">
          <span className="avatar">
            {icon ? <img src={icon} alt={champ} /> : <span className="avatar-ph">{hidden ? '?' : ''}</span>}
            {!hidden && (
              <span className="role-badge" title={ROLE_LABEL[player.role][locale]}>
                <RoleIcon role={player.role} />
              </span>
            )}
            {player.masteryPoints !== undefined && (
              <span className="mastery" title={de ? 'Meisterschaftspunkte' : 'Mastery points'}>
                {fmtK(player.masteryPoints)}
              </span>
            )}
          </span>
          {!hidden && (
            <span className="prow-spells">
              {player.spells.map((s, i) => (
                <Img key={i} src={spellIcon(sd, s)} alt={spellName(sd, s)} size={16} />
              ))}
            </span>
          )}
        </div>

        <div className="prow-id">
          <div className="prow-name" title={name}>
            {isSelf ? (de ? 'Du' : 'You') : (player.identity?.gameName ?? name)}
            {champ && <span className="muted"> · {champ}</span>}
          </div>
          {hidden ? (
            <div className="prow-rank muted">
              {de
                ? 'Ranked Solo: Mitspieler erst ab dem Ladebildschirm'
                : 'Ranked solo: allies appear from the loading screen'}
            </div>
          ) : (
            <div className="prow-rank">
              {emblem ? (
                <img
                  className="crest"
                  src={emblem}
                  alt=""
                  onError={(e) => {
                    e.currentTarget.style.visibility = 'hidden';
                  }}
                />
              ) : (
                <span className="crest crest-ph" />
              )}
              <span className="num">{formatRank(main?.tier, main?.division, main?.lp, locale)}</span>
              {main?.queue === 'RANKED_FLEX_SR' && <span className="muted">Flex</span>}
            </div>
          )}
        </div>

        {!hidden && (
          <>
            <div className="prow-wr">
              {player.loading ? (
                <>
                  <Skeleton height={6} />
                  <Skeleton width="70%" />
                </>
              ) : stats && stats.games > 0 ? (
                <>
                  <WinBar winrate={stats.winrate} />
                  <div className="num small">
                    <span className={`strong ${winrateClass(stats.winrate)}`}>
                      {pct(stats.winrate, locale)}
                    </span>
                    <span className="muted"> · {games(stats.games, locale)}</span>
                  </div>
                  {cs && (
                    <div className="num small muted prow-champwr">
                      {champ}: <span className={winrateClass(cs.winrate)}>{pct(cs.winrate, locale)}</span> (
                      {cs.games})
                    </div>
                  )}
                </>
              ) : (
                !hidden && (
                  <span className="muted small">
                    {stats ? (de ? '0 Spiele im Zeitraum' : '0 games in window') : '–'}
                  </span>
                )
              )}
            </div>

            <div className="prow-kda num">
              {stats && stats.games > 0 && (
                <>
                  <span className={`strong ${kdaClass(stats.kda.ratio)}`}>{f1(stats.kda.ratio)}</span>
                  <span className="lbl">KDA</span>
                </>
              )}
            </div>

            <div className="prow-mains">
              {mains.map((m) => (
                <ChampIcon
                  key={m.championId}
                  sd={sd}
                  id={m.championId}
                  size={22}
                  round
                  className={m.championId === player.championId ? 'ring' : ''}
                  title={`${championName(sd, m.championId)} · ${pct(m.winrate, locale)} · ${games(m.games, locale)}`}
                />
              ))}
            </div>

            <div className="prow-tags">
              {player.premadeGroup && tone && (
                <Chip tone={tone} title={de ? 'Premade-Gruppe' : 'Premade group'}>
                  P{player.premadeGroup}
                </Chip>
              )}
              {player.error && !player.loading && (
                <Chip tone="bad" title={player.error}>
                  {de ? 'Fehler' : 'Error'}
                </Chip>
              )}
              <TagList tags={player.tags} locale={locale} max={player.premadeGroup ? 1 : 2} />
            </div>
          </>
        )}
      </div>
      {open && !hidden && <PlayerDetail player={player} locale={locale} champ={champ} />}
    </div>
  );
}
