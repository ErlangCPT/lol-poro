import {
  type BuildSuggestion,
  matchupRecords,
  personalBuild,
  personalRunePages,
  selectMatches,
  teamDamageProfile,
  type RunePageSuggestion,
} from '@poro/core';
import {
  buildToItemSet,
  importItemSet,
  importRunePage,
  loadRecommendedPages,
  patchMySelection,
  type LcuClient,
} from '@poro/lcu';
import type { StaticData } from '@poro/static-data';
import type { ActionResult, AppSettings, ChampSelectInfo, LobbySnapshot } from '@shared/ipc';
import type { Logger } from '../logger';
import type { PlayerBundle } from './player-data';

export interface ChampSelectDeps {
  getClient: () => LcuClient | null;
  staticData: StaticData;
  getLocalPuuid: () => string | undefined;
  getLocalSummonerId: () => number | undefined;
  getBundle: (puuid: string) => PlayerBundle | undefined;
  isLoading: (puuid: string) => boolean;
  /** statistics of the crawled patch for the pick (Phase 5) */
  getMeta: (
    championId: number,
    role: import('@poro/core').Role,
    enemyChampionIds: number[],
    myChampionIds: number[],
  ) => import('@shared/ipc').ChampSelectMeta | undefined;
  getSettings: () => AppSettings;
  publish: (info: ChampSelectInfo) => void;
  log: Logger;
}

const EMPTY_PROFILE = { champions: 0, ad: 0, ap: 0, mixed: 0, adShare: 0, apShare: 0 };

const EMPTY: ChampSelectInfo = {
  phase: 'none',
  championId: 0,
  championName: '',
  role: 'UNKNOWN',
  spells: [0, 0],
  allyChampionIds: [],
  enemyChampionIds: [],
  riotPages: [],
  riotPagesLoading: false,
  personalPages: [],
  personalGames: 0,
  personalLoading: false,
  matchups: [],
  allyDamage: EMPTY_PROFILE,
  enemyDamage: EMPTY_PROFILE,
};

/**
 * Champion panel data for the local player: Riot's rune recommendations, the player's own rune pages
 * and builds on that champion, matchup records and team damage profiles. Fed by lobby snapshots.
 */
export class ChampSelectService {
  private info: ChampSelectInfo = EMPTY;
  private riotCache = new Map<string, { at: number; pages: RunePageSuggestion[] }>();
  private riotInflight = new Set<string>();

  constructor(private readonly deps: ChampSelectDeps) {}

  get current(): ChampSelectInfo {
    return this.info;
  }

  reset(): void {
    if (this.info.phase === 'none' && this.info.championId === 0) return;
    this.info = { ...EMPTY };
    this.deps.publish(this.info);
  }

  onLobbySnapshot(snapshot: LobbySnapshot): void {
    if (snapshot.source === 'none' || !snapshot.analysis) {
      this.reset();
      return;
    }
    const localPuuid = this.deps.getLocalPuuid();
    const self =
      snapshot.analysis.players.find((p) => p.visibility === 'self') ??
      snapshot.analysis.players.find((p) => !!localPuuid && p.identity?.puuid === localPuuid);
    if (!self) {
      this.reset();
      return;
    }
    const allies = snapshot.analysis.players.filter((p) => p.team === 'ally').map((p) => p.championId);
    const enemies = snapshot.analysis.players.filter((p) => p.team === 'enemy').map((p) => p.championId);
    const championChanged = self.championId !== this.info.championId || self.role !== this.info.role;
    const sd = this.deps.staticData;

    const bundle = localPuuid ? this.deps.getBundle(localPuuid) : undefined;
    const settings = this.deps.getSettings();
    const matches = bundle
      ? selectMatches(
          bundle.matches,
          { windowDays: settings.windowDays, rankedOnly: settings.rankedOnly },
          Date.now(),
        )
      : [];
    const championName = sd.championName(self.championId);
    const played = new Map<number, number>();
    for (const m of matches) played.set(m.championId, (played.get(m.championId) ?? 0) + 1);
    const myChampionIds = [...played.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => id);

    this.info = {
      ...this.info,
      phase: snapshot.source,
      championId: self.championId,
      championName,
      role: self.role,
      spells: self.spells,
      allyChampionIds: allies,
      enemyChampionIds: enemies,
      personalPages: self.championId ? personalRunePages(matches, self.championId, championName) : [],
      personalBuild: self.championId
        ? personalBuild(matches, self.championId, (id) => sd.itemMeta(id))
        : undefined,
      personalGames: matches.filter((m) => m.championId === self.championId).length,
      personalLoading: !!localPuuid && this.deps.isLoading(localPuuid),
      matchups: matchupRecords(matches, enemies),
      allyDamage: teamDamageProfile(allies, (id) => sd.champion(id)),
      enemyDamage: teamDamageProfile(enemies, (id) => sd.champion(id)),
      meta: this.deps.getMeta(self.championId, self.role, enemies, myChampionIds),
    };
    if (championChanged) {
      this.info.riotPages = [];
      this.info.lastAction = undefined;
      if (self.championId > 0) void this.loadRiotPages(self.championId, self.role, championName);
    }
    this.deps.publish(this.info);
  }

  private async loadRiotPages(
    championId: number,
    role: ChampSelectInfo['role'],
    championName: string,
  ): Promise<void> {
    const key = `${championId}:${role}`;
    const cached = this.riotCache.get(key);
    if (cached && Date.now() - cached.at < 6 * 60 * 60 * 1000) {
      this.info = { ...this.info, riotPages: cached.pages, riotPagesLoading: false };
      this.deps.publish(this.info);
      return;
    }
    const client = this.deps.getClient();
    if (!client || this.riotInflight.has(key)) return;
    this.riotInflight.add(key);
    this.info = { ...this.info, riotPagesLoading: true };
    this.deps.publish(this.info);
    try {
      const pages = await loadRecommendedPages(client, championId, role, championName);
      this.riotCache.set(key, { at: Date.now(), pages });
      if (this.info.championId === championId) {
        this.info = { ...this.info, riotPages: pages, riotPagesLoading: false };
        this.deps.publish(this.info);
      }
    } catch (e) {
      this.deps.log.warn('recommended pages failed', e);
      this.info = { ...this.info, riotPagesLoading: false };
      this.deps.publish(this.info);
    } finally {
      this.riotInflight.delete(key);
    }
  }

  private finish(result: ActionResult): ActionResult {
    this.info = { ...this.info, lastAction: { ...result, at: Date.now() } };
    this.deps.publish(this.info);
    if (result.ok) this.deps.log.info(result.message);
    else this.deps.log.warn(result.message);
    return result;
  }

  async importRunes(page: RunePageSuggestion): Promise<ActionResult> {
    const client = this.deps.getClient();
    if (!client) return this.finish({ ok: false, message: 'League Client nicht verbunden' });
    try {
      return this.finish(await importRunePage(client, page));
    } catch (e) {
      return this.finish({
        ok: false,
        message: `Runen-Import fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  async applySpells(spells: [number, number]): Promise<ActionResult> {
    const client = this.deps.getClient();
    if (!client) return this.finish({ ok: false, message: 'League Client nicht verbunden' });
    if (this.info.phase !== 'champselect')
      return this.finish({ ok: false, message: 'Spells lassen sich nur im Champion Select setzen' });
    try {
      await patchMySelection(client, { spell1Id: spells[0], spell2Id: spells[1] });
      return this.finish({ ok: true, message: 'Summoner Spells gesetzt' });
    } catch (e) {
      return this.finish({
        ok: false,
        message: `Spells setzen fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  async importItemSet(kind: 'personal' | 'meta' = 'personal'): Promise<ActionResult> {
    const client = this.deps.getClient();
    const summonerId = this.deps.getLocalSummonerId();
    if (!client || !summonerId) return this.finish({ ok: false, message: 'League Client nicht verbunden' });
    const build = kind === 'meta' ? metaBuildSuggestion(this.info) : this.info.personalBuild;
    if (!build)
      return this.finish({
        ok: false,
        message:
          kind === 'meta'
            ? 'Kein Meta-Build für diesen Champion vorhanden'
            : 'Kein eigener Build für diesen Champion vorhanden',
      });
    try {
      const set = buildToItemSet(build, this.info.championName, (id) => this.deps.staticData.itemMeta(id));
      return this.finish(await importItemSet(client, summonerId, set));
    } catch (e) {
      return this.finish({
        ok: false,
        message: `Item-Set-Import fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }
}

/** Turns the crawled build statistics into the item-set shape used by the importer. */
function metaBuildSuggestion(info: ChampSelectInfo): BuildSuggestion | undefined {
  const build = info.meta?.build;
  const core = build?.core[0];
  if (!build || !core) return undefined;
  const games = Math.max(1, build.games);
  const inCore = new Set(core.items);
  const boots = build.boots[0];
  return {
    source: 'meta',
    championId: info.championId,
    games: build.games,
    wins: core.wins,
    boots: boots ? { id: boots.itemId, games: boots.games, share: boots.share } : undefined,
    core: core.items.map((id) => ({ id, games: core.games, share: core.games / games })),
    situational: build.items
      .filter((i) => !inCore.has(i.itemId))
      .slice(0, 6)
      .map((i) => ({ id: i.itemId, games: i.games, share: i.share })),
  };
}
