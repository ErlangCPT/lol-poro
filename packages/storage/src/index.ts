import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

interface Envelope<T> {
  key: string;
  expiresAt: number;
  storedAt: number;
  value: T;
}

/**
 * Simple JSON file cache with TTL. One file per key, an in-memory index for hot reads.
 * Phase 1 replacement for SQLite; the interface stays the same when SQLite lands in Phase 4.
 */
export class JsonFileCache {
  private memory = new Map<string, Envelope<unknown>>();

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  private fileFor(key: string): string {
    const hash = createHash('sha1').update(key).digest('hex').slice(0, 24);
    return join(this.dir, `${hash}.json`);
  }

  get<T>(key: string, now = Date.now()): T | undefined {
    const inMemory = this.memory.get(key) as Envelope<T> | undefined;
    if (inMemory) {
      if (inMemory.expiresAt > now) return inMemory.value;
      this.memory.delete(key);
    }
    const file = this.fileFor(key);
    if (!existsSync(file)) return undefined;
    try {
      const env = JSON.parse(readFileSync(file, 'utf8')) as Envelope<T>;
      if (env.key !== key || env.expiresAt <= now) {
        unlinkSync(file);
        return undefined;
      }
      this.memory.set(key, env);
      return env.value;
    } catch {
      try {
        unlinkSync(file);
      } catch {
        // ignore
      }
      return undefined;
    }
  }

  set<T>(key: string, value: T, ttlMs: number, now = Date.now()): void {
    const env: Envelope<T> = { key, value, storedAt: now, expiresAt: now + ttlMs };
    this.memory.set(key, env);
    try {
      writeFileSync(this.fileFor(key), JSON.stringify(env));
    } catch {
      // disk full or locked: memory cache still works
    }
  }

  delete(key: string): void {
    this.memory.delete(key);
    try {
      unlinkSync(this.fileFor(key));
    } catch {
      // ignore
    }
  }

  /** Removes expired files; returns the number of deleted entries. */
  prune(now = Date.now()): number {
    let removed = 0;
    for (const f of readdirSync(this.dir)) {
      if (!f.endsWith('.json')) continue;
      const path = join(this.dir, f);
      try {
        const env = JSON.parse(readFileSync(path, 'utf8')) as Envelope<unknown>;
        if (env.expiresAt <= now) {
          unlinkSync(path);
          removed++;
        }
      } catch {
        unlinkSync(path);
        removed++;
      }
    }
    return removed;
  }

  clear(): void {
    this.memory.clear();
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(this.dir, { recursive: true });
  }

  sizeBytes(): number {
    let total = 0;
    for (const f of readdirSync(this.dir)) {
      try {
        total += statSync(join(this.dir, f)).size;
      } catch {
        // ignore
      }
    }
    return total;
  }
}

/** Typed settings persisted as one JSON file, merged over defaults. */
export class SettingsStore<T extends object> {
  private value: T;

  constructor(
    private readonly file: string,
    private readonly defaults: T,
  ) {
    this.value = { ...defaults };
    this.load();
  }

  private load(): void {
    try {
      if (existsSync(this.file)) {
        const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<T>;
        this.value = { ...this.defaults, ...parsed };
      }
    } catch {
      this.value = { ...this.defaults };
    }
  }

  get(): T {
    return this.value;
  }

  update(patch: Partial<T>): T {
    this.value = { ...this.value, ...patch };
    try {
      mkdirSync(join(this.file, '..'), { recursive: true });
      writeFileSync(this.file, JSON.stringify(this.value, null, 2));
    } catch {
      // keep in memory
    }
    return this.value;
  }
}
export * from './history';
export * from './stats';
