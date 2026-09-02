import type { ChampionInfo, ItemMeta } from '@poro/core';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface SummonerSpellInfo {
  id: number;
  key: string;
  name: string;
}

export interface RunePerkInfo {
  id: number;
  key: string;
  name: string;
  /** relative Data Dragon path, e.g. perk-images/Styles/Domination/Electrocute/Electrocute.png */
  icon: string;
}

export interface RuneStyleInfo extends RunePerkInfo {
  perks: RunePerkInfo[];
}

export interface ItemInfo extends ItemMeta {
  /** image file name in Data Dragon, e.g. 3020.png */
  icon: string;
  purchasable: boolean;
}

export interface StaticDataSnapshot {
  schemaVersion: number;
  version: string;
  locale: string;
  champions: ChampionInfo[];
  spells: SummonerSpellInfo[];
  runeStyles: RuneStyleInfo[];
  items: ItemInfo[];
}

const SCHEMA_VERSION = 2;
const DDRAGON = 'https://ddragon.leagueoflegends.com';
const CDRAGON = 'https://raw.communitydragon.org/latest';

/** Stat shards are not part of runesReforged.json. Icons live on CommunityDragon. */
export const STAT_SHARDS: RunePerkInfo[] = [
  { id: 5008, key: 'AdaptiveForce', name: 'Adaptive Force', icon: 'statmods/statmodsadaptiveforceicon.png' },
  { id: 5005, key: 'AttackSpeed', name: 'Attack Speed', icon: 'statmods/statmodsattackspeedicon.png' },
  { id: 5007, key: 'AbilityHaste', name: 'Ability Haste', icon: 'statmods/statmodscdrscalingicon.png' },
  { id: 5010, key: 'MoveSpeed', name: 'Move Speed', icon: 'statmods/statmodsmovementspeedicon.png' },
  { id: 5001, key: 'HealthScaling', name: 'Health Scaling', icon: 'statmods/statmodshealthscalingicon.png' },
  { id: 5011, key: 'Health', name: 'Health', icon: 'statmods/statmodshealthplusicon.png' },
  { id: 5013, key: 'Tenacity', name: 'Tenacity and Slow Resist', icon: 'statmods/statmodstenacityicon.png' },
  { id: 5002, key: 'Armor', name: 'Armor', icon: 'statmods/statmodsarmoricon.png' },
  { id: 5003, key: 'MagicRes', name: 'Magic Resist', icon: 'statmods/statmodsmagicresicon.png' },
];

export function statShardIconUrl(shard: RunePerkInfo): string {
  return `${CDRAGON}/game/assets/perks/${shard.icon}`;
}

interface DDragonChampion {
  key: string;
  id: string;
  name: string;
  tags: string[];
  info: { attack: number; defense: number; magic: number; difficulty: number };
  stats: { attackrange: number };
}

interface DDragonSpell {
  key: string;
  id: string;
  name: string;
}

interface DDragonRuneStyle {
  id: number;
  key: string;
  name: string;
  icon: string;
  slots: Array<{ runes: Array<{ id: number; key: string; name: string; icon: string }> }>;
}

interface DDragonItem {
  name: string;
  gold: { total: number; purchasable: boolean };
  tags: string[];
  into?: string[];
  from?: string[];
  image: { full: string };
  maps: Record<string, boolean>;
  inStore?: boolean;
  requiredChampion?: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

/**
 * Data Dragon access with a versioned on-disk cache. Loads the newest cached snapshot when offline.
 */
export class StaticData {
  private snapshot: StaticDataSnapshot | null = null;
  private championById = new Map<number, ChampionInfo>();
  private spellById = new Map<number, SummonerSpellInfo>();
  private runeById = new Map<number, RunePerkInfo>();
  private itemById = new Map<number, ItemInfo>();

  constructor(
    private readonly cacheDir: string,
    private readonly locale = 'de_DE',
  ) {}

  get version(): string {
    return this.snapshot?.version ?? 'unknown';
  }

  get isLoaded(): boolean {
    return this.snapshot !== null;
  }

  private cacheFile(version: string): string {
    return join(this.cacheDir, `ddragon-v${SCHEMA_VERSION}-${version}-${this.locale}.json`);
  }

  private apply(snapshot: StaticDataSnapshot): void {
    this.snapshot = snapshot;
    this.championById = new Map(snapshot.champions.map((c) => [c.id, c]));
    this.spellById = new Map(snapshot.spells.map((s) => [s.id, s]));
    this.runeById = new Map();
    for (const style of snapshot.runeStyles) {
      this.runeById.set(style.id, style);
      for (const p of style.perks) this.runeById.set(p.id, p);
    }
    for (const shard of STAT_SHARDS) this.runeById.set(shard.id, shard);
    this.itemById = new Map(snapshot.items.map((i) => [i.id, i]));
  }

  private loadNewestCached(): StaticDataSnapshot | null {
    if (!existsSync(this.cacheDir)) return null;
    const files = readdirSync(this.cacheDir)
      .filter((f) => f.startsWith(`ddragon-v${SCHEMA_VERSION}-`) && f.endsWith(`-${this.locale}.json`))
      .sort()
      .reverse();
    for (const f of files) {
      try {
        const parsed = JSON.parse(readFileSync(join(this.cacheDir, f), 'utf8')) as StaticDataSnapshot;
        if (parsed.schemaVersion === SCHEMA_VERSION) return parsed;
      } catch {
        // corrupt cache file, ignore and try the next one
      }
    }
    return null;
  }

  /** Loads the newest Data Dragon version, using the cache when the version is already present. */
  async init(): Promise<StaticDataSnapshot> {
    mkdirSync(this.cacheDir, { recursive: true });
    let version: string | null = null;
    try {
      const versions = await fetchJson<string[]>(`${DDRAGON}/api/versions.json`);
      version = versions[0] ?? null;
    } catch {
      version = null;
    }
    if (version) {
      const file = this.cacheFile(version);
      if (existsSync(file)) {
        try {
          const cached = JSON.parse(readFileSync(file, 'utf8')) as StaticDataSnapshot;
          if (cached.schemaVersion === SCHEMA_VERSION) {
            this.apply(cached);
            return cached;
          }
        } catch {
          // fall through to download
        }
      }
      try {
        const snapshot = await this.download(version);
        writeFileSync(file, JSON.stringify(snapshot));
        this.apply(snapshot);
        return snapshot;
      } catch {
        // offline or Data Dragon lagging behind; use cache below
      }
    }
    const cached = this.loadNewestCached();
    if (!cached) throw new Error('Data Dragon nicht erreichbar und kein Cache vorhanden');
    this.apply(cached);
    return cached;
  }

  private async download(version: string): Promise<StaticDataSnapshot> {
    const base = `${DDRAGON}/cdn/${version}/data/${this.locale}`;
    const [champions, spells, runes, items] = await Promise.all([
      fetchJson<{ data: Record<string, DDragonChampion> }>(`${base}/champion.json`),
      fetchJson<{ data: Record<string, DDragonSpell> }>(`${base}/summoner.json`),
      fetchJson<DDragonRuneStyle[]>(`${base}/runesReforged.json`),
      fetchJson<{ data: Record<string, DDragonItem> }>(`${base}/item.json`),
    ]);
    return {
      schemaVersion: SCHEMA_VERSION,
      version,
      locale: this.locale,
      champions: Object.values(champions.data).map((c) => ({
        id: Number(c.key),
        key: c.id,
        name: c.name,
        tags: c.tags,
        info: c.info,
        attackRange: c.stats.attackrange,
      })),
      spells: Object.values(spells.data).map((s) => ({ id: Number(s.key), key: s.id, name: s.name })),
      runeStyles: runes.map((style) => ({
        id: style.id,
        key: style.key,
        name: style.name,
        icon: style.icon,
        perks: style.slots.flatMap((slot) =>
          slot.runes.map((r) => ({ id: r.id, key: r.key, name: r.name, icon: r.icon })),
        ),
      })),
      items: Object.entries(items.data)
        .filter(([, it]) => it.maps?.['11'] !== false && !it.requiredChampion)
        .map(([id, it]) => ({
          id: Number(id),
          name: it.name,
          gold: it.gold?.total ?? 0,
          tags: it.tags ?? [],
          completed:
            !it.into?.length && (it.gold?.total ?? 0) >= 1000 && !(it.tags ?? []).includes('Consumable'),
          icon: it.image?.full ?? `${id}.png`,
          purchasable: it.gold?.purchasable !== false && it.inStore !== false,
        })),
    };
  }

  champion(id: number): ChampionInfo | undefined {
    return this.championById.get(id);
  }

  championName(id: number): string {
    return this.championById.get(id)?.name ?? (id > 0 ? `Champion ${id}` : '');
  }

  spell(id: number): SummonerSpellInfo | undefined {
    return this.spellById.get(id);
  }

  rune(id: number): RunePerkInfo | undefined {
    return this.runeById.get(id);
  }

  item(id: number): ItemInfo | undefined {
    return this.itemById.get(id);
  }

  itemMeta(id: number): ItemMeta | undefined {
    return this.itemById.get(id);
  }

  getSnapshot(): StaticDataSnapshot | null {
    return this.snapshot;
  }

  championIconUrl(id: number): string | undefined {
    const c = this.championById.get(id);
    return c ? `${DDRAGON}/cdn/${this.version}/img/champion/${c.key}.png` : undefined;
  }

  spellIconUrl(id: number): string | undefined {
    const s = this.spellById.get(id);
    return s ? `${DDRAGON}/cdn/${this.version}/img/spell/${s.key}.png` : undefined;
  }

  profileIconUrl(id: number): string {
    return `${DDRAGON}/cdn/${this.version}/img/profileicon/${id}.png`;
  }

  runeIconUrl(id: number): string | undefined {
    const r = this.runeById.get(id);
    if (!r) return undefined;
    if (r.icon.startsWith('statmods/')) return statShardIconUrl(r);
    return `${DDRAGON}/cdn/img/${r.icon}`;
  }

  itemIconUrl(id: number): string | undefined {
    const it = this.itemById.get(id);
    return it ? `${DDRAGON}/cdn/${this.version}/img/item/${it.icon}` : undefined;
  }

  static rankedEmblemUrl(tier: string): string | undefined {
    const t = tier.toLowerCase();
    if (!t || t === 'none') return undefined;
    return `${CDRAGON}/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/${t}.png`;
  }
}
