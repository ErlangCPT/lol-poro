import { describe, expect, it } from 'vitest';
import { analyzeLobby } from '../lobby';
import type { LobbyInput, LobbyPlayerInput } from '../types';
import { championInfo, makeMatch, makeMatches, NOW } from './fixtures';

function player(overrides: Partial<LobbyPlayerInput>): LobbyPlayerInput {
  return {
    cellId: 0,
    team: 'ally',
    visibility: 'visible',
    championId: 50,
    spells: [4, 14],
    ...overrides,
  };
}

describe('analyzeLobby', () => {
  it('produces stats, roles, premades, tags and team stats for a full lobby', () => {
    const sharedGames = [
      makeMatch({ gameId: 1, championId: 238 }),
      makeMatch({ gameId: 2, championId: 238 }),
    ];
    const input: LobbyInput = {
      queueId: 420,
      localPuuid: 'me',
      bans: { ally: [238], enemy: [] },
      now: NOW,
      championInfo,
      options: { windowDays: 30, rankedOnly: false },
      players: [
        player({
          cellId: 0,
          visibility: 'self',
          identity: { puuid: 'me', gameName: 'Me', tagLine: 'EUW' },
          championId: 54,
          spells: [4, 12],
          assignedPosition: 'TOP',
          matches: makeMatches(12, () => ({ championId: 54, role: 'TOP' })),
        }),
        player({
          cellId: 1,
          identity: { puuid: 'a', gameName: 'A', tagLine: 'EUW' },
          championId: 64,
          spells: [4, 11],
          assignedPosition: 'JUNGLE',
          matches: [
            ...sharedGames,
            ...makeMatches(10, () => ({ championId: 64, role: 'JUNGLE', spells: [4, 11] })),
          ],
        }),
        player({
          cellId: 2,
          identity: { puuid: 'b', gameName: 'B', tagLine: 'EUW' },
          championId: 50,
          assignedPosition: 'MIDDLE',
          matches: [...sharedGames, ...makeMatches(10, () => ({ championId: 238, role: 'MIDDLE' }))],
        }),
        player({
          cellId: 3,
          identity: { puuid: 'c', gameName: 'C', tagLine: 'EUW' },
          championId: 18,
          spells: [4, 7],
          assignedPosition: 'BOTTOM',
          matches: makeMatches(10, () => ({ championId: 18, role: 'BOTTOM' })),
        }),
        player({
          cellId: 4,
          visibility: 'hidden',
          championId: 89,
          spells: [4, 3],
          assignedPosition: 'UTILITY',
        }),
        player({
          cellId: 5,
          team: 'enemy',
          identity: { puuid: 'e1', gameName: 'E1', tagLine: 'EUW' },
          championId: 24,
          spells: [4, 12],
          matches: makeMatches(10, () => ({ championId: 24, role: 'TOP' })),
        }),
        player({
          cellId: 6,
          team: 'enemy',
          identity: { puuid: 'e2', gameName: 'E2', tagLine: 'EUW' },
          championId: 266,
          spells: [4, 11],
          matches: makeMatches(10, () => ({ championId: 266, role: 'JUNGLE', spells: [4, 11] })),
        }),
        player({
          cellId: 7,
          team: 'enemy',
          identity: { puuid: 'e3', gameName: 'E3', tagLine: 'EUW' },
          championId: 238,
          matches: makeMatches(10, () => ({ championId: 238, role: 'MIDDLE' })),
        }),
        player({
          cellId: 8,
          team: 'enemy',
          identity: { puuid: 'e4', gameName: 'E4', tagLine: 'EUW' },
          championId: 51,
          spells: [4, 7],
          matches: makeMatches(10, () => ({ championId: 51, role: 'BOTTOM' })),
        }),
        player({
          cellId: 9,
          team: 'enemy',
          identity: { puuid: 'e5', gameName: 'E5', tagLine: 'EUW' },
          championId: 40,
          spells: [4, 3],
          matches: makeMatches(10, () => ({ championId: 40, role: 'UTILITY' })),
        }),
      ],
    };

    const result = analyzeLobby(input);
    expect(result.players).toHaveLength(10);

    const byCell = (id: number) => result.players.find((p) => p.cellId === id)!;
    expect(byCell(0).role).toBe('TOP');
    expect(byCell(0).roleSource).toBe('assigned');
    // enemy roles are inferred from smite + history
    expect(byCell(6).role).toBe('JUNGLE');
    expect(byCell(9).role).toBe('UTILITY');
    expect(new Set(result.players.filter((p) => p.team === 'enemy').map((p) => p.role)).size).toBe(5);

    // premade group for players 1 and 2 (two shared games on the same team)
    expect(byCell(1).premadeGroup).toBe(1);
    expect(byCell(2).premadeGroup).toBe(1);
    expect(byCell(3).premadeGroup).toBeUndefined();
    expect(byCell(1).tags[0]?.id).toBe('premade');

    // hidden player has no stats and no tags
    expect(byCell(4).stats).toBeUndefined();
    expect(byCell(4).tags).toEqual([]);

    // player 2 mains Zed which is banned -> main banned; plays Swain first time
    expect(byCell(2).tags.map((t) => t.id)).toContain('main-banned');
    expect(byCell(2).tags.map((t) => t.id)).toContain('first-time');

    // team stats
    expect(result.teams.ally.playersWithData).toBe(4);
    expect(result.teams.enemy.playersWithData).toBe(5);
    expect(result.teams.ally.avgWinrate).toBeCloseTo(1);
    expect(result.teams.enemy.tags.length).toBeGreaterThan(0);
  });

  it('handles a lobby with only the local player', () => {
    const result = analyzeLobby({
      queueId: 420,
      bans: { ally: [], enemy: [] },
      now: NOW,
      championInfo,
      options: { windowDays: 30, rankedOnly: true },
      players: [
        player({
          cellId: 0,
          visibility: 'self',
          identity: { puuid: 'me', gameName: 'Me', tagLine: 'EUW' },
          matches: [],
        }),
      ],
    });
    expect(result.players[0]?.stats?.games).toBe(0);
    expect(result.teams.enemy.playersWithData).toBe(0);
  });
});
