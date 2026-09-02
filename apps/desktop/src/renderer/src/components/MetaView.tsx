import { ROLE_LABEL, ROLE_ORDER, t, type Locale, type Role } from '@poro/core';
import type { ChampionRoleStats } from '@poro/stats';
import type { ConnectionState, MetaChampion, MetaSnapshot, StaticDataPayload } from '@shared/ipc';
import { useEffect, useMemo, useState } from 'react';
import { championName, itemIcon, itemName, runeIcon, runeName, spellIcon, spellName } from '../assets';
import { pct } from '../fmt';
import { IconBars, IconChevron, IconSearch } from './icons';
import { ChampIcon, Empty, Img, PageHeader } from './ui';

interface Props {
  meta: MetaSnapshot;
  sd: StaticDataPayload | null;
  locale: Locale;
  state?: ConnectionState;
  onToggleCrawler: (enabled: boolean) => void;
}

const ROLES: Role[] = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
type SortKey = 'tier' | 'winrate' | 'pickrate' | 'banrate' | 'kda' | 'games';

export function TierBadge({ tier }: { tier: ChampionRoleStats['tier'] }) {
  return <span className={`tier tier-${tier === '-' ? 'none' : tier}`}>{tier}</span>;
}

/** Meta build of one champion (core items, boots, runes, spells) with import buttons. */
export function MetaBuild({
  detail,
  sd,
  locale,
  onImportRunes,
  onImportItems,
}: {
  detail: MetaChampion;
  sd: StaticDataPayload | null;
  locale: Locale;
  onImportRunes?: (index: number) => void;
  onImportItems?: () => void;
}) {
  const de = locale === 'de';
  const b = detail.build;
  if (!b) return <div className="muted small">{de ? 'Noch keine Build-Daten.' : 'No build data yet.'}</div>;
  return (
    <div className="meta-build">
      <div className="muted small num">
        {b.games} {de ? 'Spiele' : 'games'}
        {detail.stats &&
          ` · ${pct(detail.stats.winrate, locale, 1)} WR · ${pct(detail.stats.pickrate, locale, 1)} PR · ${pct(detail.stats.banrate, locale, 1)} BR`}
      </div>
      {b.core.slice(0, 3).map((set, i) => (
        <div key={i} className="meta-row">
          <span className="items">
            {set.items.map((id, j) => (
              <Img key={j} src={itemIcon(sd, id)} alt={itemName(sd, id)} size={28} />
            ))}
          </span>
          <span className="small num">
            {pct(set.winrate, locale)} · {set.games}
          </span>
          {i === 0 && onImportItems && (
            <button type="button" className="btn btn-sm" onClick={onImportItems}>
              {de ? 'Item-Set' : 'Item set'}
            </button>
          )}
        </div>
      ))}
      {b.boots.length > 0 && (
        <div className="meta-row">
          <span className="items">
            {b.boots.map((it) => (
              <Img
                key={it.itemId}
                src={itemIcon(sd, it.itemId)}
                alt={`${itemName(sd, it.itemId)} ${pct(it.share, locale)}`}
                size={28}
              />
            ))}
          </span>
          <span className="small muted">{de ? 'Stiefel' : 'Boots'}</span>
        </div>
      )}
      {b.runes.slice(0, 2).map((r, i) => (
        <div key={i} className="meta-row">
          <span className="rune-icons">
            {[0, 1, 2, 3, 4, 5].map((j) => (
              <Img
                key={j}
                src={runeIcon(sd, r.runes.perks[j] ?? 0)}
                alt={runeName(sd, r.runes.perks[j] ?? 0)}
                size={j === 0 ? 34 : 26}
                round
                className={j === 0 ? 'keystone' : ''}
              />
            ))}
          </span>
          <span className="small num">
            {pct(r.winrate, locale)} · {r.games}
          </span>
          {onImportRunes && (
            <button type="button" className="btn btn-sm" onClick={() => onImportRunes(i)}>
              {de ? 'Runen' : 'Runes'}
            </button>
          )}
        </div>
      ))}
      {b.spells[0] && (
        <div className="meta-row">
          <span className="items">
            {b.spells[0].spells.map((id) => (
              <Img key={id} src={spellIcon(sd, id)} alt={spellName(sd, id)} size={28} />
            ))}
          </span>
          <span className="small muted num">
            {pct(b.spells[0].winrate, locale)} · {b.spells[0].games}
          </span>
        </div>
      )}
    </div>
  );
}

export function MetaView({ meta, sd, locale, state, onToggleCrawler }: Props) {
  const de = locale === 'de';
  const [role, setRole] = useState<Role>('MIDDLE');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'tier', desc: true });
  const [selected, setSelected] = useState<ChampionRoleStats | null>(null);
  const [detail, setDetail] = useState<MetaChampion | null>(null);
  const summary = meta.summary;
  const crawler = meta.crawler;

  useEffect(() => {
    if (!selected) return;
    let active = true;
    setDetail(null);
    void window.poro.getMetaChampion(selected.championId, selected.role).then((d) => {
      if (active) setDetail(d);
    });
    return () => {
      active = false;
    };
  }, [selected]);

  const rows = useMemo(() => {
    let list = (summary?.champions ?? []).filter((c) => c.role === role);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((c) => championName(sd, c.championId).toLowerCase().includes(q));
    if (sort.key === 'tier') return sort.desc ? list : [...list].reverse();
    const key = sort.key;
    return [...list].sort((a, b) => (sort.desc ? b[key] - a[key] : a[key] - b[key]));
  }, [summary, role, query, sort, sd]);

  const phaseLabel: Record<string, { de: string; en: string }> = {
    idle: { de: 'wartet', en: 'idle' },
    seeding: { de: 'liest Rangliste', en: 'reading ladder' },
    players: { de: 'sammelt Match-IDs', en: 'collecting match ids' },
    matches: { de: 'lädt Matches', en: 'loading matches' },
    stopped: { de: 'gestoppt', en: 'stopped' },
    error: { de: 'Fehler', en: 'error' },
  };
  const columns: Array<[SortKey, string]> = [
    ['tier', 'Tier'],
    ['winrate', 'WR'],
    ['pickrate', 'PR'],
    ['banrate', 'BR'],
    ['kda', 'KDA'],
    ['games', de ? 'Spiele' : 'Games'],
  ];
  const th = (key: SortKey, label: string) => (
    <button
      key={key}
      type="button"
      className={`th ${sort.key === key ? 'active' : ''}`}
      onClick={() => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: true }))}
    >
      {label}
      {sort.key === key && <IconChevron size={11} className={sort.desc ? '' : 'rot'} />}
    </button>
  );

  return (
    <>
      <PageHeader
        title="Meta"
        subtitle={meta.patch ? `Patch ${meta.patch} · ${meta.platform.toUpperCase()}` : undefined}
        state={state}
        locale={locale}
      >
        {crawler && (
          <span className="muted small head-info num" title={crawler.lastError ?? ''}>
            {t(phaseLabel[crawler.phase] ?? { de: crawler.phase, en: crawler.phase }, locale)} ·{' '}
            {crawler.matchesStored} {de ? 'Matches' : 'matches'} · {crawler.pendingMatches}{' '}
            {de ? 'offen' : 'queued'} · {crawler.players} {de ? 'Spieler' : 'players'}
            {crawler.lastError && <span className="error"> · {de ? 'Fehler' : 'error'}</span>}
          </span>
        )}
        {!meta.hasKey && (
          <span className="chip chip-bad">{de ? 'Riot API Key nötig' : 'Riot API key needed'}</span>
        )}
        <label className="toggle">
          <input
            type="checkbox"
            className="switch"
            checked={meta.enabled}
            disabled={!meta.hasKey}
            onChange={(e) => onToggleCrawler(e.target.checked)}
          />
          {de ? 'Crawler' : 'Crawler'}
        </label>
      </PageHeader>
      <div className="page-main meta">
        {!summary ? (
          <Empty
            icon={<IconBars size={36} strokeWidth={1.4} />}
            title={de ? 'Noch keine Daten' : 'No data yet'}
          >
            <p>
              {de
                ? 'Der Crawler sammelt im Hintergrund Ranked-Spiele des Patches (Smaragd bis Challenger). Die Tier-Liste erscheint nach den ersten paar hundert Matches.'
                : 'The crawler collects ranked games of the patch (Emerald to Challenger) in the background. The tier list appears after the first few hundred matches.'}
            </p>
          </Empty>
        ) : (
          <div className="meta-grid">
            <section className="card card-pad">
              <div className="meta-toolbar">
                <div className="seg" role="tablist">
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="tab"
                      aria-selected={r === role}
                      className={r === role ? 'active' : ''}
                      onClick={() => setRole(r)}
                    >
                      {t(ROLE_LABEL[r], locale)}
                    </button>
                  ))}
                </div>
                <label className="search">
                  <IconSearch size={14} />
                  <input
                    type="search"
                    value={query}
                    placeholder={de ? 'Champion suchen' : 'Search champion'}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <span className="muted small num">
                  {summary.matches} {de ? 'Matches im Patch' : 'matches this patch'}
                </span>
              </div>
              <div className="meta-table">
                <div className="meta-trow meta-thead">
                  {th('tier', 'Tier')}
                  <span className="th">Champion</span>
                  {columns.slice(1).map(([k, l]) => th(k, l))}
                </div>
                {rows.map((c) => (
                  <button
                    key={c.championId}
                    type="button"
                    className={`meta-trow ${selected?.championId === c.championId && selected.role === c.role ? 'active' : ''}`}
                    onClick={() => setSelected(c)}
                  >
                    <TierBadge tier={c.tier} />
                    <span className="meta-champ">
                      <ChampIcon sd={sd} id={c.championId} size={24} round />
                      {championName(sd, c.championId)}
                    </span>
                    <span
                      className={`num ${c.winrate >= 0.52 ? 'val-good' : c.winrate < 0.48 ? 'val-bad' : ''}`}
                    >
                      {pct(c.winrate, locale, 1)}
                    </span>
                    <span className="num">{pct(c.pickrate, locale, 1)}</span>
                    <span className="num">{pct(c.banrate, locale, 1)}</span>
                    <span className="num">{c.kda.toFixed(2)}</span>
                    <span className="num muted">{c.games}</span>
                  </button>
                ))}
                {rows.length === 0 && (
                  <div className="muted small meta-empty">
                    {query
                      ? de
                        ? 'Kein Champion gefunden.'
                        : 'No champion found.'
                      : de
                        ? 'Noch keine Spiele in dieser Rolle.'
                        : 'No games in this role yet.'}
                  </div>
                )}
              </div>
            </section>
            <section className="card card-pad meta-detail">
              {selected ? (
                <>
                  <div className="champ-head">
                    <ChampIcon sd={sd} id={selected.championId} size={44} round />
                    <div>
                      <div className="strong">
                        {championName(sd, selected.championId)} <TierBadge tier={selected.tier} />
                      </div>
                      <div className="muted small">{t(ROLE_LABEL[selected.role], locale)}</div>
                    </div>
                  </div>
                  {detail ? (
                    <MetaBuild detail={detail} sd={sd} locale={locale} />
                  ) : (
                    <div className="muted small">…</div>
                  )}
                </>
              ) : (
                <div className="muted small">
                  {de
                    ? 'Champion anklicken für Build, Runen und Spells.'
                    : 'Click a champion for build, runes and spells.'}
                </div>
              )}
            </section>
          </div>
        )}
        <p className="muted small">
          {de
            ? 'Tier = Rang innerhalb der Rolle aus Winrate (bei kleinen Stichproben zur Mitte gezogen), Pick- und Banrate. WR/PR/BR beziehen sich auf die gesammelten Matches des Patches.'
            : 'Tier = rank within the role from winrate (shrunk for small samples), pick and ban rate. WR/PR/BR are relative to the collected matches of the patch.'}
        </p>
      </div>
    </>
  );
}

export const roleSort = (a: Role, b: Role) => ROLE_ORDER[a] - ROLE_ORDER[b];
