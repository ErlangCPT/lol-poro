import type { BuildSuggestion, ItemMeta } from '@poro/core';
import type { LcuClient } from './client';
import { getItemSets, putItemSets } from './endpoints';
import type { LcuItemSet, LcuItemSetBlock } from './types';
import { PORO_PAGE_PREFIX } from './runes';

export interface ItemSetImportResult {
  ok: boolean;
  message: string;
}

export function buildToItemSet(
  build: BuildSuggestion,
  championName: string,
  itemMeta: (id: number) => ItemMeta | undefined,
): LcuItemSet {
  const item = (id: number) => ({ id: String(id), count: 1 });
  const blocks: LcuItemSetBlock[] = [];
  if (build.boots) blocks.push({ type: 'Boots', items: [item(build.boots.id)] });
  if (build.core.length)
    blocks.push({ type: `Core (${build.games} Spiele)`, items: build.core.map((s) => item(s.id)) });
  if (build.situational.length)
    blocks.push({ type: 'Situativ', items: build.situational.map((s) => item(s.id)) });
  const title = `${PORO_PAGE_PREFIX}${championName}`;
  void itemMeta;
  return {
    uid: `poro-${build.championId}-${Date.now()}`,
    title,
    mode: 'any',
    map: 'any',
    type: 'custom',
    sortrank: 0,
    startedFrom: 'blank',
    associatedChampions: [build.championId],
    associatedMaps: [11],
    blocks,
    preferredItemSlots: [],
  };
}

/** Replaces the Poro item set of this champion and keeps all other sets untouched. */
export async function importItemSet(
  client: LcuClient,
  summonerId: number,
  set: LcuItemSet,
): Promise<ItemSetImportResult> {
  const current = await getItemSets(client, summonerId);
  const kept = (current.itemSets ?? []).filter(
    (s) =>
      !(
        s.title.startsWith(PORO_PAGE_PREFIX) &&
        s.associatedChampions?.includes(set.associatedChampions[0] ?? -1)
      ),
  );
  await putItemSets(client, summonerId, {
    accountId: current.accountId,
    timestamp: Date.now(),
    itemSets: [...kept, set],
  });
  return { ok: true, message: `Item-Set "${set.title}" importiert` };
}
