import type { StaticDataPayload } from '@shared/ipc';

// stat shards are not on Data Dragon; CommunityDragon serves them from the game asset tree
const CDRAGON_PERKS = 'https://raw.communitydragon.org/latest/game/assets/perks';

export function championIcon(sd: StaticDataPayload | null, championId: number): string | undefined {
  const c = sd?.champions[championId];
  return sd && c ? `${sd.ddragonBase}/${sd.version}/img/champion/${c.key}.png` : undefined;
}

export function championName(sd: StaticDataPayload | null, championId: number): string {
  if (!championId) return '';
  return sd?.champions[championId]?.name ?? `Champion ${championId}`;
}

export function spellIcon(sd: StaticDataPayload | null, spellId: number): string | undefined {
  const s = sd?.spells[spellId];
  return sd && s ? `${sd.ddragonBase}/${sd.version}/img/spell/${s.key}.png` : undefined;
}

export function spellName(sd: StaticDataPayload | null, spellId: number): string {
  return sd?.spells[spellId]?.name ?? '';
}

export function profileIcon(sd: StaticDataPayload | null, iconId: number | undefined): string | undefined {
  return sd && iconId !== undefined
    ? `${sd.ddragonBase}/${sd.version}/img/profileicon/${iconId}.png`
    : undefined;
}

export function runeIcon(sd: StaticDataPayload | null, runeId: number): string | undefined {
  const r = sd?.runes[runeId];
  if (!sd || !r) return undefined;
  if (r.icon.startsWith('statmods/')) return `${CDRAGON_PERKS}/${r.icon}`;
  return `${sd.ddragonBase}/img/${r.icon}`;
}

export function runeName(sd: StaticDataPayload | null, runeId: number): string {
  return sd?.runes[runeId]?.name ?? `Rune ${runeId}`;
}

export function itemIcon(sd: StaticDataPayload | null, itemId: number): string | undefined {
  const it = sd?.items[itemId];
  return sd && it ? `${sd.ddragonBase}/${sd.version}/img/item/${it.icon}` : undefined;
}

export function itemName(sd: StaticDataPayload | null, itemId: number): string {
  return sd?.items[itemId]?.name ?? `Item ${itemId}`;
}

export function rankEmblem(tier: string | undefined): string | undefined {
  const t = (tier ?? '').toLowerCase();
  if (!t || t === 'none') return undefined;
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/${t}.png`;
}
