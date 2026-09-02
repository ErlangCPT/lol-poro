import { describe, expect, it } from 'vitest';
import { normalizeGame, normalizeRanked } from '../normalize';
import type { LcuGame, LcuParticipant } from '../types';

function participant(
  id: number,
  teamId: number,
  championId: number,
  overrides: Partial<LcuParticipant['stats']> = {},
): LcuParticipant {
  return {
    participantId: id,
    teamId,
    championId,
    spell1Id: 4,
    spell2Id: id === 2 || id === 7 ? 11 : 14,
    stats: {
      win: teamId === 100,
      kills: 5,
      deaths: 3,
      assists: 7,
      goldEarned: 11000,
      totalMinionsKilled: 150,
      neutralMinionsKilled: 20,
      totalDamageDealtToChampions: 18000,
      damageDealtToTurrets: 2500,
      turretKills: 1,
      wardsPlaced: 9,
      wardsKilled: 3,
      visionScore: 28,
      ...overrides,
    },
    timeline: { lane: id === 2 || id === 7 ? 'JUNGLE' : 'MIDDLE', role: 'SOLO' },
  };
}

const abbreviated: LcuGame = {
  gameId: 42,
  gameCreation: 1_700_000_000_000,
  gameDuration: 1900,
  queueId: 420,
  participantIdentities: [{ participantId: 3, player: { puuid: 'me' } }],
  participants: [participant(3, 200, 50)],
};

describe('normalizeGame', () => {
  it('normalizes an abbreviated match-list game', () => {
    const m = normalizeGame(abbreviated, 'me');
    expect(m).toMatchObject({
      gameId: 42,
      queueId: 420,
      win: false,
      teamId: 200,
      championId: 50,
      role: 'MIDDLE',
      cs: 170,
    });
    expect(m?.teamKills).toBeUndefined();
    expect(m?.opponents).toBeUndefined();
  });

  it('adds team kills, opponents and teammates for full games', () => {
    const full: LcuGame = {
      ...abbreviated,
      participantIdentities: Array.from({ length: 10 }, (_, i) => ({
        participantId: i + 1,
        player: { puuid: `p${i + 1}` },
      })),
      participants: Array.from({ length: 10 }, (_, i) => participant(i + 1, i < 5 ? 100 : 200, 100 + i)),
    };
    const m = normalizeGame(full, 'p3');
    expect(m?.teamKills).toBe(25);
    expect(m?.teammates).toEqual(['p1', 'p2', 'p4', 'p5']);
    expect(m?.opponents).toHaveLength(5);
    expect(m?.opponents?.find((o) => o.puuid === 'p7')?.role).toBe('JUNGLE');
  });

  it('returns null when the player is not part of the game', () => {
    expect(normalizeGame(abbreviated, 'someone-else')).toBeNull();
  });
});

describe('normalizeRanked', () => {
  it('keeps solo and flex only', () => {
    const entries = normalizeRanked({
      queues: [
        {
          queueType: 'RANKED_SOLO_5x5',
          tier: 'GOLD',
          division: 'II',
          leaguePoints: 40,
          wins: 30,
          losses: 20,
          previousSeasonEndTier: 'SILVER',
          previousSeasonEndDivision: 'I',
        },
        { queueType: 'RANKED_TFT', tier: 'DIAMOND', division: 'I', leaguePoints: 0, wins: 1, losses: 1 },
        { queueType: 'RANKED_FLEX_SR', tier: '', division: '', leaguePoints: 0, wins: 0, losses: 0 },
      ],
    });
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      queue: 'RANKED_SOLO_5x5',
      tier: 'GOLD',
      division: 'II',
      lp: 40,
      previousSeasonTier: 'SILVER',
    });
    expect(entries[1]).toMatchObject({ queue: 'RANKED_FLEX_SR', tier: 'NONE', division: 'NA' });
  });
});
