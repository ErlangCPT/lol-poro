import type { PostGameHistoryEntry, PostGameReport } from '@poro/core';
import { describe, expect, it } from 'vitest';
import { HistoryStore } from '../history';

function entry(gameId: number, extra: Partial<PostGameHistoryEntry> = {}): PostGameHistoryEntry {
  return {
    gameId,
    platform: 'euw1',
    gameCreation: 1_700_000_000_000 + gameId * 1000,
    queueId: 420,
    durationSec: 1500,
    championId: 103,
    role: 'MIDDLE',
    win: gameId % 2 === 0,
    kills: 5,
    deaths: 3,
    assists: 7,
    csPerMin: 7.1,
    goldPerMin: 420,
    dmgPerMin: 800,
    dmgShare: 0.25,
    killParticipation: 0.6,
    visionPerMin: 1.2,
    hasTimeline: false,
    ...extra,
  };
}

describe('HistoryStore', () => {
  it('stores entries, keeps reports and lists newest first', () => {
    const store = new HistoryStore(':memory:');
    store.upsert('me', entry(1));
    store.upsert('me', entry(2), { gameId: 2 } as unknown as PostGameReport);
    store.upsert('me', entry(3));
    store.upsert('other', entry(9));
    expect(store.count('me')).toBe(3);
    expect(store.list('me').map((e) => e.gameId)).toEqual([3, 2, 1]);
    expect(store.list('me', 2)).toHaveLength(2);
    expect(store.get('me', 'euw1', 2)?.report).toEqual({ gameId: 2 });
    expect(store.get('me', 'euw1', 1)?.report).toBeUndefined();

    // updating without a report keeps the stored one; with timeline flag updates has()
    store.upsert('me', entry(2, { hasTimeline: true }));
    expect(store.get('me', 'euw1', 2)?.report).toEqual({ gameId: 2 });
    expect(store.has('me', 'euw1', 2, true)).toBe(true);
    expect(store.has('me', 'euw1', 1, true)).toBe(false);
    expect(store.has('me', 'euw1', 1)).toBe(true);
    expect(store.has('me', 'euw1', 99)).toBe(false);
    store.close();
  });
});
