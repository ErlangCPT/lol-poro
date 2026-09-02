import type { MatchExtract, ParticipantRow } from '@poro/stats';
import { describe, expect, it } from 'vitest';
import { StatsStore } from '../stats';

function extract(id: string, patch = '16.17'): MatchExtract {
  const p = (
    i: number,
    teamId: number,
    championId: number,
    role: ParticipantRow['role'],
    win: boolean,
  ): ParticipantRow => ({
    matchId: id,
    platform: 'euw1',
    patch,
    queueId: 420,
    gameCreation: 1,
    durationSec: 1500,
    teamId,
    championId,
    role,
    win,
    kills: 1,
    deaths: 2,
    assists: 3,
    cs: 100,
    gold: 10000,
    opponentChampionId: teamId === 100 ? championId + 1 : championId - 1,
    items: [3078, 3006],
    trinket: 3340,
    runes: { primaryStyle: 8000, subStyle: 8400, perks: [1, 2, 3, 4, 5, 6], shards: [5008, 5008, 5001] },
    spells: [4, 12],
  });
  return {
    matchId: id,
    platform: 'euw1',
    patch,
    queueId: 420,
    gameCreation: 1,
    durationSec: 1500,
    participants: [
      p(0, 100, 10, 'TOP', true),
      p(1, 200, 11, 'TOP', false),
      p(2, 100, 20, 'MIDDLE', true),
      p(3, 200, 21, 'MIDDLE', false),
    ],
    bans: [99, 11],
    puuids: ['a', 'b', 'c', 'd'],
  };
}

describe('StatsStore', () => {
  it('runs the crawl queue and aggregates participants', () => {
    const s = new StatsStore(':memory:');
    expect(s.upsertPlayers('euw1', ['a', 'b'], 'ladder')).toBe(2);
    expect(s.upsertPlayers('euw1', ['a', 'c'], 'match')).toBe(1);
    expect(s.playerCounts('euw1')).toEqual({ total: 3, pending: 3 });
    expect(s.nextPlayers('euw1', 1)).toEqual(['a']);
    s.markPlayer('a');
    expect(s.nextPlayers('euw1', 5)).toEqual(['b', 'c']);
    expect(s.enqueueMatches('euw1', ['m1', 'm2', 'm1'])).toBe(2);
    expect(s.pendingMatches('euw1')).toBe(2);
    s.markMatch('m1', 'done');
    expect(s.nextMatches('euw1', 5)).toEqual(['m2']);

    expect(s.insertMatch(extract('m1'))).toBe(true);
    expect(s.insertMatch(extract('m1'))).toBe(false);
    expect(s.insertMatch(extract('m3'))).toBe(true);
    expect(s.insertMatch(extract('old', '16.16'))).toBe(true);
    expect(s.matchCount('euw1', '16.17', 420)).toBe(2);
    expect(s.patches('euw1', 420)).toEqual([
      { patch: '16.17', matches: 2 },
      { patch: '16.16', matches: 1 },
    ]);
    const groups = s.championGroups('euw1', '16.17', 420);
    expect(groups.find((g) => g.championId === 10)).toEqual({
      championId: 10,
      role: 'TOP',
      games: 2,
      wins: 2,
      kills: 2,
      deaths: 4,
      assists: 6,
    });
    expect(s.banCounts('euw1', '16.17', 420)).toEqual({ 99: 2, 11: 2 });
    const matchups = s.matchupGroups('euw1', '16.17', 420);
    expect(matchups.find((m) => m.championId === 10)).toEqual({
      championId: 10,
      opponentChampionId: 11,
      role: 'TOP',
      games: 2,
      wins: 2,
    });
    const rows = s.championRows('euw1', '16.17', 420, 20, 'MIDDLE');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ championId: 20, items: [3078, 3006], spells: [4, 12], win: true });
    expect(rows[0]!.runes?.shards).toEqual([5008, 5008, 5001]);
    expect(s.pruneOldPatches('euw1', 420, 1)).toBe(1);
    expect(s.patches('euw1', 420)).toHaveLength(1);
    s.close();
  });
});
