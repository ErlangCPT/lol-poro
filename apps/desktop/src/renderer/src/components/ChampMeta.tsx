import type { Locale, RunePageSuggestion } from '@poro/core';
import type { ChampSelectInfo, StaticDataPayload } from '@shared/ipc';
import { championName } from '../assets';
import { pct } from '../fmt';
import { MetaBuild, TierBadge } from './MetaView';
import { ChampIcon } from './ui';

/** Rune page built from the crawled meta data (index into the build's rune sets). */
export function metaRunePage(champ: ChampSelectInfo, index: number): RunePageSuggestion | undefined {
  const build = champ.meta?.build;
  const set = build?.runes[index];
  if (!build || !set) return undefined;
  return {
    source: 'meta',
    name: `Meta ${champ.championName}`.slice(0, 25),
    primaryStyleId: set.runes.primaryStyle,
    subStyleId: set.runes.subStyle,
    perkIds: [...set.runes.perks, ...set.runes.shards],
    spells: build.spells[0]?.spells,
    position: champ.role,
    games: set.games,
    wins: set.wins,
  };
}

/** Meta tab of the champion panel: tier, build with import, counters against the enemy picks, ban suggestions. */
export function ChampMeta({
  champ,
  sd,
  locale,
  canImport,
  run,
}: {
  champ: ChampSelectInfo;
  sd: StaticDataPayload | null;
  locale: Locale;
  canImport: boolean;
  run: (fn: () => Promise<unknown>) => void;
}) {
  const de = locale === 'de';
  const meta = champ.meta;
  if (!meta) {
    return (
      <div className="muted small">
        {de
          ? 'Noch keine Meta-Daten. Der Crawler braucht einen Riot-API-Key (Einstellungen).'
          : 'No meta data yet. The crawler needs a Riot API key (settings).'}
      </div>
    );
  }
  const self = meta.self;
  return (
    <div className="champ-tab-grid">
      <div>
        <h3 className="tab-title">
          Meta · Patch {meta.patch}{' '}
          <span className="muted small">
            ({meta.matches} {de ? 'Matches' : 'matches'})
          </span>
        </h3>
        {champ.championId > 0 &&
          (self ? (
            <div className="small meta-tier-line">
              <TierBadge tier={self.tier} /> {de ? 'Tier in dieser Rolle' : 'tier in this role'} ·{' '}
              <span className="num">
                {pct(self.winrate, locale, 1)} WR · {pct(self.pickrate, locale, 1)} PR ·{' '}
                {pct(self.banrate, locale, 1)} BR
              </span>
            </div>
          ) : (
            <div className="muted small">
              {de
                ? 'Noch keine Daten für diesen Champion in der Rolle.'
                : 'No data for this champion in this role yet.'}
            </div>
          ))}
        {champ.championId > 0 && (
          <MetaBuild
            detail={{ stats: self, build: meta.build }}
            sd={sd}
            locale={locale}
            onImportRunes={
              canImport
                ? (i) => {
                    const page = metaRunePage(champ, i);
                    if (page) run(() => window.poro.importRunes(page));
                  }
                : undefined
            }
            onImportItems={canImport ? () => run(() => window.poro.importItemSet('meta')) : undefined}
          />
        )}
      </div>
      <div>
        {meta.counters.length > 0 && (
          <>
            <h3 className="tab-title">{de ? 'Counter gegen die Gegner' : 'Counters against the enemies'}</h3>
            <div className="counter-list">
              {meta.counters.map((c) => (
                <div key={c.enemyChampionId} className="counter-row">
                  <ChampIcon sd={sd} id={c.enemyChampionId} size={26} />
                  <span className="muted small">vs</span>
                  {c.picks.slice(0, 4).map((p) => (
                    <span
                      key={p.championId}
                      className="counter-pick"
                      title={`${championName(sd, p.championId)}: ${pct(p.winrate, locale)} (${p.games})`}
                    >
                      <ChampIcon sd={sd} id={p.championId} size={22} />
                      <span className="small num">{pct(p.winrate, locale)}</span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
        {meta.bans.length > 0 && (
          <>
            <h3 className="tab-title">{de ? 'Ban-Vorschläge' : 'Ban suggestions'}</h3>
            <div className="meta-bans">
              {meta.bans.map((b) => (
                <span
                  key={b.championId}
                  className="counter-pick"
                  title={
                    b.reason === 'counter'
                      ? `${championName(sd, b.championId)} ${de ? 'gewinnt' : 'wins'} ${pct(b.winrate ?? 0, locale)} ${de ? 'gegen' : 'vs'} ${championName(sd, b.counters ?? 0)} (${b.games})`
                      : `${championName(sd, b.championId)}: ${pct(b.banrate ?? 0, locale)} ${de ? 'Banrate' : 'ban rate'}`
                  }
                >
                  <ChampIcon sd={sd} id={b.championId} size={22} />
                  <span className="small num">
                    {b.reason === 'counter'
                      ? `${pct(b.winrate ?? 0, locale)} vs ${championName(sd, b.counters ?? 0)}`
                      : `${pct(b.banrate ?? 0, locale)} Ban`}
                  </span>
                </span>
              ))}
            </div>
          </>
        )}
        {meta.counters.length === 0 && meta.bans.length === 0 && (
          <div className="muted small">{de ? 'Gegner noch nicht bekannt.' : 'Enemies not known yet.'}</div>
        )}
      </div>
    </div>
  );
}
