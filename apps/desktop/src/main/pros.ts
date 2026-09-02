import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from './logger';

/**
 * Local pro player list (`userData/pros.json`): maps Riot IDs ("Name#TAG", case-insensitive) or PUUIDs to a
 * display name such as "T1 Faker". Matching lobby members get a "Pro" tag. The file is user-maintained;
 * Poro ships no list because pro accounts change constantly.
 */
export class ProList {
  readonly file: string;
  private byRiotId = new Map<string, string>();
  private byPuuid = new Map<string, string>();
  private loadedAt = 0;

  constructor(
    userData: string,
    private readonly log: Logger,
  ) {
    this.file = join(userData, 'pros.json');
  }

  static readonly TEMPLATE = {
    _hint:
      'Riot-ID "Name#TAG" oder PUUID als Schlüssel, Anzeigename als Wert. Beispiel unten, frei ersetzen.',
    'Hide on bush#KR1': 'T1 Faker',
  };

  /** Creates the file with a template when missing and returns its path. */
  ensureFile(): string {
    if (!existsSync(this.file)) {
      writeFileSync(this.file, JSON.stringify(ProList.TEMPLATE, null, 2));
      this.log.info('pro list template written', this.file);
    }
    return this.file;
  }

  load(): number {
    this.byRiotId.clear();
    this.byPuuid.clear();
    this.loadedAt = Date.now();
    if (!existsSync(this.file)) return 0;
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, unknown>;
      for (const [key, value] of Object.entries(parsed)) {
        if (key.startsWith('_') || typeof value !== 'string' || !value.trim()) continue;
        if (key.includes('#')) this.byRiotId.set(key.trim().toLowerCase(), value.trim());
        else this.byPuuid.set(key.trim(), value.trim());
      }
    } catch (e) {
      this.log.warn('pro list unreadable', e);
    }
    return this.byRiotId.size + this.byPuuid.size;
  }

  size(): number {
    return this.byRiotId.size + this.byPuuid.size;
  }

  lookup(
    puuid: string | undefined,
    gameName: string | undefined,
    tagLine: string | undefined,
  ): string | undefined {
    if (!this.loadedAt) this.load();
    if (puuid) {
      const hit = this.byPuuid.get(puuid);
      if (hit) return hit;
    }
    if (gameName && tagLine) return this.byRiotId.get(`${gameName}#${tagLine}`.toLowerCase());
    return undefined;
  }
}
