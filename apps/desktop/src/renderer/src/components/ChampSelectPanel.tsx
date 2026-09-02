import {
  ROLE_LABEL,
  type DamageProfile,
  type Locale,
  type MatchupRecord,
  type RunePageSuggestion,
} from '@poro/core';
import type { ChampSelectInfo, StaticDataPayload } from '@shared/ipc';
import { useState } from 'react';
import { championName, itemIcon, itemName, runeIcon, runeName, spellIcon, spellName } from '../assets';
import { games, pct, winrateClass } from '../fmt';
import { ChampMeta, metaRunePage } from './ChampMeta';
import { IconChevron, IconDownload } from './icons';
import { TierBadge } from './MetaView';
import { ChampIcon, Eyebrow, Img } from './ui';

type TabId = 'runes' | 'build' | 'matchups' | 'meta';

function RunePageRow({
  page,
  sd,
  locale,
  canImport,
  onImport,
  onSpells,
}: {
  page: RunePageSuggestion;
  sd: StaticDataPayload | null;
  locale: Locale;
  canImport: boolean;
  onImport: (page: RunePageSuggestion) => void;
  onSpells: (spells: [number, number]) => void;
}) {
  const de = locale === 'de';
  const [keystone, p1, p2, p3, s1, s2, ...shards] = page.perkIds;
  return (
    <div className="rune-row">
      <div className="rune-icons">
        <Img
          src={runeIcon(sd, page.primaryStyleId)}
          alt={runeName(sd, page.primaryStyleId)}
          size={22}
          round
        />
        <Img
          src={runeIcon(sd, keystone ?? 0)}
          alt={runeName(sd, keystone ?? 0)}
          size={36}
          round
          className="keystone"
        />
        {[p1, p2, p3].map((id, i) => (
          <Img key={`p${i}`} src={runeIcon(sd, id ?? 0)} alt={runeName(sd, id ?? 0)} size={24} round />
        ))}
        <span className="sep" />
        <Img src={runeIcon(sd, page.subStyleId)} alt={runeName(sd, page.subStyleId)} size={22} round />
        {[s1, s2].map((id, i) => (
          <Img key={`s${i}`} src={runeIcon(sd, id ?? 0)} alt={runeName(sd, id ?? 0)} size={24} round />
        ))}
        <span className="sep" />
        {shards.map((id, i) => (
          <Img
            key={`sh${i}`}
            src={runeIcon(sd, id)}
            alt={runeName(sd, id)}
            size={18}
            round
            className="shard"
          />
        ))}
        {page.spells && (
          <>
            <span className="sep" />
            {page.spells.map((id, i) => (
              <Img key={`sp${i}`} src={spellIcon(sd, id)} alt={spellName(sd, id)} size={22} />
            ))}
          </>
        )}
      </div>
      <div className="rune-meta">
        <span className="small num muted">
          {page.games !== undefined
            ? `${games(page.games, locale)} · ${pct((page.wins ?? 0) / Math.max(1, page.games), locale)}`
            : page.position
              ? ROLE_LABEL[page.position][locale]
              : ''}
        </span>
        <button type="button" className="btn btn-sm" disabled={!canImport} onClick={() => onImport(page)}>
          {de ? 'Runen importieren' : 'Import runes'}
        </button>
        {page.spells && (
          <button
            type="button"
            className="btn btn-sm"
            disabled={!canImport}
            onClick={() => onSpells(page.spells!)}
          >
            {de ? 'Spells setzen' : 'Set spells'}
          </button>
        )}
      </div>
    </div>
  );
}

function DamageBar({ profile, label }: { profile: DamageProfile; label: string }) {
  const ad = Math.round(profile.adShare * 100);
  const ap = 100 - ad;
  return (
    <div className="damage">
      <span className="small muted">{label}</span>
      <div className="damage-bar" title={`AD ${profile.ad} · AP ${profile.ap} · Mixed ${profile.mixed}`}>
        <span className="ad" style={{ width: `${profile.champions ? ad : 50}%` }}>
          {profile.champions ? `AD ${ad}%` : ''}
        </span>
        <span className="ap" style={{ width: `${profile.champions ? ap : 50}%` }}>
          {profile.champions ? `AP ${ap}%` : ''}
        </span>
      </div>
    </div>
  );
}

interface BestPage {
  page: RunePageSuggestion;
  label: string;
}

/** The rune page the quick import uses: own page with enough games, else meta, else Riot's suggestion. */
function bestRunePage(champ: ChampSelectInfo, de: boolean): BestPage | undefined {
  const personal = champ.personalPages[0];
  const yours = de ? 'deine' : 'yours';
  if (personal && (personal.games ?? 0) >= 3) return { page: personal, label: yours };
  const meta = metaRunePage(champ, 0);
  if (meta && (meta.games ?? 0) >= 20) return { page: meta, label: 'Meta' };
  const riot = champ.riotPages[0];
  if (riot) return { page: riot, label: 'Riot' };
  if (personal) return { page: personal, label: yours };
  if (meta) return { page: meta, label: 'Meta' };
  return undefined;
}

interface QuickBuild {
  kind: 'meta' | 'personal';
  items: number[];
  boots?: number;
  winrate: number;
  games: number;
}

function quickBuild(champ: ChampSelectInfo): QuickBuild | undefined {
  const meta = champ.meta?.build;
  const core = meta?.core[0];
  const fromMeta = (): QuickBuild | undefined =>
    meta && core
      ? {
          kind: 'meta',
          items: core.items,
          boots: meta.boots[0]?.itemId,
          winrate: core.winrate,
          games: core.games,
        }
      : undefined;
  if (core && core.games >= 10) return fromMeta();
  const p = champ.personalBuild;
  if (p && p.core.length > 0) {
    return {
      kind: 'personal',
      items: p.core.map((s) => s.id),
      boots: p.boots?.id,
      winrate: p.wins / Math.max(1, p.games),
      games: p.games,
    };
  }
  return fromMeta();
}

function toughestMatchup(matchups: MatchupRecord[]): MatchupRecord | undefined {
  const known = matchups.filter((m) => m.games >= 3);
  if (known.length === 0) return undefined;
  return known.reduce((worst, m) => (m.wins / m.games < worst.wins / worst.games ? m : worst));
}

function RuneMini({ page, sd }: { page: RunePageSuggestion; sd: StaticDataPayload | null }) {
  const [keystone, p1, p2, p3, s1, s2] = page.perkIds;
  return (
    <span className="rune-mini">
      <Img src={runeIcon(sd, keystone ?? 0)} alt={runeName(sd, keystone ?? 0)} size={26} round />
      {[p1, p2, p3].map((id, i) => (
        <Img key={i} src={runeIcon(sd, id ?? 0)} alt={runeName(sd, id ?? 0)} size={16} round />
      ))}
      <Img
        src={runeIcon(sd, page.subStyleId)}
        alt={runeName(sd, page.subStyleId)}
        size={14}
        round
        className="sub"
      />
      {[s1, s2].map((id, i) => (
        <Img key={`s${i}`} src={runeIcon(sd, id ?? 0)} alt={runeName(sd, id ?? 0)} size={16} round />
      ))}
    </span>
  );
}

export function ChampSelectPanel({
  champ,
  sd,
  locale,
}: {
  champ: ChampSelectInfo;
  sd: StaticDataPayload | null;
  locale: Locale;
}) {
  const de = locale === 'de';
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>('runes');
  const canImport = champ.phase === 'champselect' && !busy;
  const run = (fn: () => Promise<unknown>) => {
    setBusy(true);
    void fn().finally(() => setBusy(false));
  };
  const best = bestRunePage(champ, de);
  const build = quickBuild(champ);
  const tough = toughestMatchup(champ.matchups);
  const counter = champ.meta?.counters[0];
  const bans = champ.meta?.bans.slice(0, 3) ?? [];
  const self = champ.meta?.self;
  const personal = champ.personalBuild;
  const hasChampion = champ.championId > 0;

  const importRunes = (page: RunePageSuggestion) =>
    run(async () => {
      await window.poro.importRunes(page);
      if (page.spells) await window.poro.applySpells(page.spells);
    });
  const importAll = () =>
    run(async () => {
      if (best) {
        await window.poro.importRunes(best.page);
        if (best.page.spells) await window.poro.applySpells(best.page.spells);
      }
      if (build) await window.poro.importItemSet(build.kind);
    });

  const phaseHint =
    champ.phase === 'champselect'
      ? de
        ? 'Runen, Spells und Item-Sets lassen sich jetzt importieren.'
        : 'Runes, spells and item sets can be imported now.'
      : de
        ? 'Ladebildschirm: Import geschlossen, Infos bleiben sichtbar.'
        : 'Loading screen: imports are closed, info stays visible.';

  const tabs: Array<[TabId, string]> = [
    ['runes', de ? 'Runen' : 'Runes'],
    ['build', 'Build'],
    ['matchups', 'Matchups'],
    ['meta', 'Meta'],
  ];

  return (
    <>
      <section className="card champ-strip">
        <div className="strip-champ">
          <ChampIcon sd={sd} id={champ.championId} size={48} round />
          <div className="min0">
            <div className="strip-title" title={phaseHint}>
              {champ.championName || (de ? 'Kein Champion gewählt' : 'No champion picked')}
              {champ.role !== 'UNKNOWN' && <span className="muted"> · {ROLE_LABEL[champ.role][locale]}</span>}
            </div>
            <div className="muted small num strip-sub">
              {self ? (
                <>
                  Tier <TierBadge tier={self.tier} /> · {pct(self.winrate, locale)} WR ·{' '}
                  {pct(self.pickrate, locale)} PR
                </>
              ) : champ.personalGames > 0 ? (
                `${games(champ.personalGames, locale)} ${de ? 'im Zeitraum' : 'in window'}`
              ) : (
                phaseHint
              )}
            </div>
          </div>
        </div>

        <div className="strip-col">
          <Eyebrow>
            {de ? 'Runen' : 'Runes'}
            {best && <span className="muted"> · {best.label}</span>}
          </Eyebrow>
          <div className="strip-row">
            {best ? <RuneMini page={best.page} sd={sd} /> : <span className="muted small">–</span>}
            <span className="spacer" />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!canImport || !best}
              onClick={() => best && importRunes(best.page)}
            >
              {de ? 'Importieren' : 'Import'}
            </button>
          </div>
        </div>

        <div className="strip-col">
          <Eyebrow>
            {build ? (build.kind === 'meta' ? 'Meta-Build' : de ? 'Dein Build' : 'Your build') : 'Build'}
            {build && build.games >= 5 && (
              <span className="muted">
                {' '}
                · {pct(build.winrate, locale)} ({build.games})
              </span>
            )}
          </Eyebrow>
          <div className="strip-row">
            {build ? (
              <span className="items">
                {build.boots !== undefined && (
                  <Img src={itemIcon(sd, build.boots)} alt={itemName(sd, build.boots)} size={26} />
                )}
                {build.items.slice(0, 3).map((id, i) => (
                  <Img key={`${id}-${i}`} src={itemIcon(sd, id)} alt={itemName(sd, id)} size={26} />
                ))}
              </span>
            ) : (
              <span className="muted small">–</span>
            )}
            <span className="spacer" />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!canImport || !build}
              onClick={() => build && run(() => window.poro.importItemSet(build.kind))}
            >
              Item-Set
            </button>
          </div>
        </div>

        <div className="strip-col">
          <Eyebrow>Counter &amp; Bans</Eyebrow>
          <div className="strip-row small">
            {tough ? (
              <>
                <ChampIcon sd={sd} id={tough.championId} size={22} round />
                <span className="min0 ellipsis">
                  {championName(sd, tough.championId)}{' '}
                  <span className={`num strong ${winrateClass(tough.wins / tough.games)}`}>
                    {pct(tough.wins / tough.games, locale)}
                  </span>{' '}
                  <span className="muted">
                    {de ? `für dich (${tough.games})` : `for you (${tough.games})`}
                  </span>
                </span>
              </>
            ) : counter && counter.picks[0] ? (
              <>
                <ChampIcon sd={sd} id={counter.enemyChampionId} size={22} round />
                <span className="min0 ellipsis">
                  <span className="muted">vs</span> {championName(sd, counter.picks[0].championId)}{' '}
                  <span className={`num strong ${winrateClass(counter.picks[0].winrate)}`}>
                    {pct(counter.picks[0].winrate, locale)}
                  </span>
                </span>
              </>
            ) : (
              <span className="muted">{de ? 'Keine Matchup-Daten' : 'No matchup data'}</span>
            )}
            <span className="spacer" />
            {bans.length > 0 && (
              <>
                <span className="muted">Ban:</span>
                {bans.map((b) => (
                  <ChampIcon
                    key={b.championId}
                    sd={sd}
                    id={b.championId}
                    size={22}
                    round
                    title={
                      b.reason === 'counter'
                        ? `${championName(sd, b.championId)} · ${pct(b.winrate ?? 0, locale)} vs ${championName(sd, b.counters ?? 0)}`
                        : `${championName(sd, b.championId)} · ${pct(b.banrate ?? 0, locale)} ${de ? 'Banrate' : 'ban rate'}`
                    }
                  />
                ))}
              </>
            )}
          </div>
        </div>

        <div className="strip-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canImport || (!best && !build)}
            onClick={importAll}
            title={
              de ? 'Runen, Spells und Item-Set in einem Schritt' : 'Runes, spells and item set in one step'
            }
          >
            <IconDownload size={14} />
            {de ? 'Alles importieren' : 'Import all'}
          </button>
          <button
            type="button"
            className={`btn ${open ? 'active' : ''}`}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            Details
            <IconChevron size={14} className={open ? 'rot' : ''} />
          </button>
        </div>
      </section>

      {open && (
        <section className="card champ-details">
          <div className="seg" role="tablist">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? 'active' : ''}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="champ-tab">
            {tab === 'runes' && (
              <div className="champ-tab-grid">
                <div>
                  <h3 className="tab-title">{de ? 'Riot-Empfehlung' : 'Riot recommendation'}</h3>
                  {champ.riotPagesLoading && <div className="muted small">{de ? 'Lade…' : 'Loading…'}</div>}
                  {!champ.riotPagesLoading && champ.riotPages.length === 0 && (
                    <div className="muted small">
                      {hasChampion
                        ? de
                          ? 'Keine Empfehlung vom Client erhalten.'
                          : 'No recommendation from the client.'
                        : ''}
                    </div>
                  )}
                  {champ.riotPages.map((page, i) => (
                    <RunePageRow
                      key={`riot-${i}`}
                      page={page}
                      sd={sd}
                      locale={locale}
                      canImport={canImport}
                      onImport={(p) => run(() => window.poro.importRunes(p))}
                      onSpells={(s) => run(() => window.poro.applySpells(s))}
                    />
                  ))}
                </div>
                <div>
                  <h3 className="tab-title">
                    {de ? 'Deine Runen' : 'Your runes'}
                    {champ.personalGames > 0 && (
                      <span className="muted small"> · {games(champ.personalGames, locale)}</span>
                    )}
                  </h3>
                  {champ.personalLoading && (
                    <div className="muted small">{de ? 'Lade deine Spiele…' : 'Loading your games…'}</div>
                  )}
                  {!champ.personalLoading && champ.personalPages.length === 0 && (
                    <div className="muted small">
                      {de
                        ? 'Keine eigenen Spiele mit Runendaten auf diesem Champion im Zeitraum.'
                        : 'No own games with rune data on this champion in the window.'}
                    </div>
                  )}
                  {champ.personalPages.map((page, i) => (
                    <RunePageRow
                      key={`own-${i}`}
                      page={page}
                      sd={sd}
                      locale={locale}
                      canImport={canImport}
                      onImport={(p) => run(() => window.poro.importRunes(p))}
                      onSpells={(s) => run(() => window.poro.applySpells(s))}
                    />
                  ))}
                </div>
              </div>
            )}

            {tab === 'build' && (
              <div className="champ-tab-grid">
                <div>
                  <h3 className="tab-title">{de ? 'Dein Build' : 'Your build'}</h3>
                  {personal ? (
                    <div className="build">
                      <div className="small muted num">
                        {games(personal.games, locale)} ·{' '}
                        {pct(personal.wins / Math.max(1, personal.games), locale)}
                      </div>
                      <div className="items">
                        {personal.boots && (
                          <Img
                            src={itemIcon(sd, personal.boots.id)}
                            alt={`${itemName(sd, personal.boots.id)} (${pct(personal.boots.share, locale)})`}
                            size={32}
                          />
                        )}
                        {personal.core.map((s) => (
                          <Img
                            key={s.id}
                            src={itemIcon(sd, s.id)}
                            alt={`${itemName(sd, s.id)} (${pct(s.share, locale)})`}
                            size={32}
                          />
                        ))}
                        {personal.situational.length > 0 && <span className="sep" />}
                        {personal.situational.map((s) => (
                          <Img
                            key={s.id}
                            src={itemIcon(sd, s.id)}
                            alt={`${itemName(sd, s.id)} (${pct(s.share, locale)})`}
                            size={26}
                            className="situational"
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={!canImport}
                        onClick={() => run(() => window.poro.importItemSet('personal'))}
                      >
                        {de ? 'Item-Set importieren' : 'Import item set'}
                      </button>
                    </div>
                  ) : (
                    <div className="muted small">
                      {de
                        ? 'Kein eigener Build auf diesem Champion im Zeitraum.'
                        : 'No own build on this champion in the window.'}
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="tab-title">{de ? 'Schadensprofil' : 'Damage profile'}</h3>
                  <DamageBar profile={champ.allyDamage} label={de ? 'Dein Team' : 'Your team'} />
                  <DamageBar profile={champ.enemyDamage} label={de ? 'Gegner' : 'Enemy team'} />
                </div>
              </div>
            )}

            {tab === 'matchups' && (
              <div>
                <h3 className="tab-title">
                  {de ? 'Deine Bilanz gegen die Gegner' : 'Your record against the enemies'}
                </h3>
                {champ.matchups.length === 0 ? (
                  <div className="muted small">
                    {de ? 'Gegner noch nicht bekannt.' : 'Enemies not known yet.'}
                  </div>
                ) : (
                  <div className="matchups">
                    {champ.matchups.map((r) => (
                      <div key={r.championId} className="matchup">
                        <ChampIcon sd={sd} id={r.championId} size={28} round />
                        <span className="matchup-name">{championName(sd, r.championId)}</span>
                        <span className="small num">
                          {r.games === 0 ? (
                            <span className="muted">{de ? 'keine Spiele' : 'no games'}</span>
                          ) : (
                            <>
                              <span className={`strong ${winrateClass(r.wins / r.games)}`}>
                                {pct(r.wins / r.games, locale)}
                              </span>{' '}
                              <span className="muted">
                                ({r.wins}W {r.games - r.wins}L
                                {r.laneGames ? ` · Lane ${r.laneWins}W ${r.laneGames - r.laneWins}L` : ''})
                              </span>
                            </>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'meta' && (
              <ChampMeta champ={champ} sd={sd} locale={locale} canImport={canImport} run={run} />
            )}
          </div>
        </section>
      )}
    </>
  );
}
