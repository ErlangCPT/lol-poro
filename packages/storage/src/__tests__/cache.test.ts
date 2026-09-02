import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JsonFileCache, SettingsStore } from '../index';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'poro-cache-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('JsonFileCache', () => {
  it('stores and expires values', () => {
    const cache = new JsonFileCache(dir);
    cache.set('a', { x: 1 }, 1000, 0);
    expect(cache.get('a', 500)).toEqual({ x: 1 });
    expect(cache.get('a', 1500)).toBeUndefined();
  });

  it('survives a new instance (disk) and prunes expired files', () => {
    const cache = new JsonFileCache(dir);
    cache.set('a', 1, 1000, 0);
    cache.set('b', 2, 10, 0);
    const again = new JsonFileCache(dir);
    expect(again.get('a', 100)).toBe(1);
    expect(again.prune(100)).toBe(1);
  });
});

describe('SettingsStore', () => {
  it('merges defaults and persists updates', () => {
    const file = join(dir, 'settings.json');
    const s = new SettingsStore(file, { a: 1, b: 'x' });
    s.update({ b: 'y' });
    const again = new SettingsStore(file, { a: 1, b: 'x' });
    expect(again.get()).toEqual({ a: 1, b: 'y' });
  });
});
