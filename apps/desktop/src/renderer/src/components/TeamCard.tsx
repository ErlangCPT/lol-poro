import { formatRank, type Locale, type LobbyPlayer, type TeamSide, type TeamStats } from '@poro/core';
import type { StaticDataPayload } from '@shared/ipc';
import { f1, f2, pct } from '../fmt';
import { averageRank } from '../rank';
import { PlayerRow } from './PlayerRow';
import { TagList } from './TagChip';

export function TeamCard({
  side,
  team,
  players,
  locale,
  sd,
  selfPuuid,
}: {
  side: TeamSide;
  team: TeamStats;
  players: LobbyPlayer[];
  locale: Locale;
  sd: StaticDataPayload | null;
  selfPuuid?: string;
}) {
  const de = locale === 'de';
  const title = side === 'ally' ? (de ? 'Eigenes Team' : 'Your team') : de ? 'Gegner' : 'Enemy team';
  const avgRank = averageRank(players);
  const summary = [
    team.avgWinrate !== undefined ? `Ø ${pct(team.avgWinrate, locale)} WR` : null,
    avgRank ? `Ø ${formatRank(avgRank.tier, avgRank.division, undefined, locale)}` : null,
  ].filter(Boolean);
  const foot = [
    team.avgKda ? `Ø KDA ${f1(team.avgKda.ratio)}` : null,
    team.avgGoldPerMin !== undefined ? `Ø Gold ${Math.round(team.avgGoldPerMin)}/min` : null,
    team.avgDmgPerMin !== undefined
      ? `Ø ${de ? 'Schaden' : 'Damage'} ${Math.round(team.avgDmgPerMin)}/min`
      : null,
    team.avgWardsPerMin !== undefined ? `Ø Wards ${f2(team.avgWardsPerMin)}/min` : null,
    `${team.playersWithData}/5 ${de ? 'mit Daten' : 'with data'}`,
  ].filter(Boolean);

  return (
    <section className={`card team-card team-${side}`}>
      <header className="card-head">
        <span className="card-title">{title}</span>
        {summary.length > 0 && <span className="num muted small">{summary.join(' · ')}</span>}
        <span className="spacer" />
        <TagList tags={team.tags} locale={locale} max={2} />
      </header>
      <div className="team-rows">
        {players.map((p) => (
          <PlayerRow
            key={p.cellId}
            player={p}
            locale={locale}
            sd={sd}
            isSelf={!!selfPuuid && p.identity?.puuid === selfPuuid}
          />
        ))}
      </div>
      <footer className="team-foot num muted small">{foot.join(' · ')}</footer>
    </section>
  );
}
