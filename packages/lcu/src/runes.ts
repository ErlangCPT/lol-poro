import { DEFAULT_SHARDS, type RunePageSuggestion, type Role } from '@poro/core';
import type { LcuClient } from './client';
import {
  createRunePage,
  deleteRunePage,
  getCurrentRunePage,
  getPerkInventory,
  getRecommendedChampionPositions,
  getRecommendedDefaultPosition,
  getRecommendedRunePages,
  getRunePages,
} from './endpoints';
import type { LcuRecommendedPage } from './types';

export const PORO_PAGE_PREFIX = 'Poro: ';
const MAX_PAGE_NAME = 25;

const STAT_SHARD_IDS = new Set([5001, 5002, 5003, 5005, 5007, 5008, 5010, 5011, 5013]);

/** Converts a client recommendation into an importable page (9 perk ids). */
export function recommendationToPage(rec: LcuRecommendedPage, name: string): RunePageSuggestion {
  const ids = rec.perks.map((p) => p.id);
  if (rec.keystone && !ids.includes(rec.keystone.id)) ids.unshift(rec.keystone.id);
  const perks = ids.filter((id) => !STAT_SHARD_IDS.has(id));
  let shards = ids.filter((id) => STAT_SHARD_IDS.has(id));
  if (shards.length !== 3) shards = DEFAULT_SHARDS;
  const spells =
    rec.summonerSpellIds && rec.summonerSpellIds.length === 2
      ? ([rec.summonerSpellIds[0]!, rec.summonerSpellIds[1]!] as [number, number])
      : undefined;
  return {
    source: 'riot',
    name,
    primaryStyleId: rec.primaryPerkStyleId,
    subStyleId: rec.secondaryPerkStyleId,
    perkIds: [...perks.slice(0, 6), ...shards],
    spells,
    position: positionToRole(rec.position),
    recommendationId: rec.recommendationId,
  };
}

function positionToRole(position: string | undefined): Role | undefined {
  switch ((position ?? '').toUpperCase()) {
    case 'TOP':
      return 'TOP';
    case 'JUNGLE':
      return 'JUNGLE';
    case 'MIDDLE':
      return 'MIDDLE';
    case 'BOTTOM':
      return 'BOTTOM';
    case 'UTILITY':
      return 'UTILITY';
    default:
      return undefined;
  }
}

/** Loads Riot's recommended pages; falls back to the champion's default position when the role is unknown. */
export async function loadRecommendedPages(
  client: LcuClient,
  championId: number,
  role: Role,
  championName: string,
): Promise<RunePageSuggestion[]> {
  let recs: LcuRecommendedPage[] = [];
  if (role !== 'UNKNOWN') {
    try {
      recs = await getRecommendedRunePages(client, championId, role);
    } catch {
      recs = [];
    }
  }
  if (recs.length === 0) {
    // unknown or unusual role: ask the client for the champion's default position first
    try {
      let position = await getRecommendedDefaultPosition(client, championId);
      if (typeof position !== 'string' || position.length === 0) {
        const map = await getRecommendedChampionPositions(client);
        position = map[String(championId)]?.recommendedPositions?.[0] ?? '';
      }
      if (position) recs = await getRecommendedRunePages(client, championId, position.toUpperCase());
    } catch {
      recs = [];
    }
  }
  return recs
    .filter((r) => r && r.primaryPerkStyleId && r.secondaryPerkStyleId && r.perks?.length)
    .map((r, i) =>
      recommendationToPage(r, `${PORO_PAGE_PREFIX}${championName}${recs.length > 1 ? ` ${i + 1}` : ''}`),
    );
}

export interface ImportResult {
  ok: boolean;
  message: string;
  pageId?: number;
}

/**
 * Writes a rune page into the client and makes it current. Frees a slot by deleting older Poro pages first,
 * then the current page if the inventory is full.
 */
export async function importRunePage(client: LcuClient, page: RunePageSuggestion): Promise<ImportResult> {
  if (page.perkIds.length !== 9)
    return { ok: false, message: `Ungültige Seite (${page.perkIds.length} Runen)` };
  const [pages, inventory] = await Promise.all([getRunePages(client), getPerkInventory(client)]);
  const editable = pages.filter((p) => p.isEditable && !p.isTemporary);
  let free = inventory.ownedPageCount - editable.length;

  for (const p of editable.filter((p) => p.name.startsWith(PORO_PAGE_PREFIX) && p.isDeletable)) {
    await deleteRunePage(client, p.id);
    free++;
  }
  if (free <= 0) {
    const current = await getCurrentRunePage(client);
    const victim =
      current && current.isDeletable && current.isEditable
        ? current
        : editable
            .filter((p) => p.isDeletable)
            .sort((a, b) => (a.lastModified ?? 0) - (b.lastModified ?? 0))[0];
    if (!victim) return { ok: false, message: 'Keine löschbare Runenseite gefunden' };
    await deleteRunePage(client, victim.id);
  }
  const created = await createRunePage(client, {
    name: page.name.slice(0, MAX_PAGE_NAME),
    primaryStyleId: page.primaryStyleId,
    subStyleId: page.subStyleId,
    selectedPerkIds: page.perkIds,
    current: true,
  });
  return { ok: true, message: `Runenseite "${created.name}" importiert`, pageId: created.id };
}
