import { describe, expect, it } from 'vitest';
import { analyzeLobby } from '../lobby';
import type { LobbyInput } from '../types';
import { championInfo, makeMatches, NOW } from './fixtures';

describe('pro player tag', () => {
  const base: Omit<LobbyInput, 'players'> = {
    queueId: 420,
    bans: { ally: [], enemy: [] },
    now: NOW,
    championInfo,
    options: { windowDays: 30, rankedOnly: false },
  };

  it('adds a "Pro" tag in front of the other tags when the player is on the list', () => {
    const analysis = analyzeLobby({
      ...base,
      players: [
        {
          cellId: 0,
          team: 'enemy',
          visibility: 'visible',
          identity: { puuid: 'x', gameName: 'Hide on bush', tagLine: 'KR1' },
          championId: 7,
          spells: [4, 14],
          assignedPosition: 'MIDDLE',
          matches: makeMatches(12, () => ({ championId: 7, role: 'MIDDLE' })),
          pro: 'T1 Faker',
        },
      ],
    });
    const player = analysis.players[0]!;
    expect(player.pro).toBe('T1 Faker');
    expect(player.tags[0]?.id).toBe('pro');
    expect(player.tags[0]?.label.en).toBe('Pro: T1 Faker');
  });

  it('tags a listed player even without match data', () => {
    const analysis = analyzeLobby({
      ...base,
      players: [
        {
          cellId: 3,
          team: 'ally',
          visibility: 'visible',
          identity: { puuid: 'y', gameName: 'Someone', tagLine: 'EUW' },
          championId: 7,
          spells: [4, 14],
          pro: 'G2 Caps',
        },
      ],
    });
    expect(analysis.players[0]?.tags.map((t) => t.id)).toEqual(['pro']);
  });

  it('adds nothing for unknown players', () => {
    const analysis = analyzeLobby({
      ...base,
      players: [{ cellId: 0, team: 'ally', visibility: 'visible', championId: 7, spells: [4, 14] }],
    });
    expect(analysis.players[0]?.tags).toEqual([]);
  });
});
