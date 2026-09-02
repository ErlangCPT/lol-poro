import { describe, expect, it } from 'vitest';
import { LiveClient } from '../client';
import { LivePoller } from '../poller';
import type { LiveAllGameData, LiveEvent } from '../types';

function data(gameTime: number, events: LiveEvent[]): LiveAllGameData {
  return {
    activePlayer: { currentGold: 0, level: 1, summonerName: 'me' },
    allPlayers: [],
    events: { Events: events },
    gameData: { gameMode: 'CLASSIC', gameTime, mapName: 'Map11', mapNumber: 11, mapTerrain: 'Default' },
  };
}

const ev = (id: number, name: string, time: number): LiveEvent => ({
  EventID: id,
  EventName: name,
  EventTime: time,
});

describe('LivePoller', () => {
  it('emits connected once and only fresh events per poll', async () => {
    const responses: LiveAllGameData[] = [
      data(10, [ev(0, 'GameStart', 0)]),
      data(11, [ev(0, 'GameStart', 0), ev(1, 'MinionsSpawning', 65)]),
      data(12, [ev(0, 'GameStart', 0), ev(1, 'MinionsSpawning', 65)]),
    ];
    let i = 0;
    const client = new LiveClient({ fetchJson: async () => responses[Math.min(i++, responses.length - 1)] });
    const poller = new LivePoller({ client });
    const log: string[] = [];
    poller.on('connected', () => log.push('connected'));
    poller.on('snapshot', (_d, fresh) => log.push(`fresh:${fresh.map((e) => e.EventName).join(',')}`));
    await poller.poll();
    await poller.poll();
    await poller.poll();
    expect(log).toEqual(['connected', 'fresh:GameStart', 'fresh:MinionsSpawning', 'fresh:']);
    expect(poller.isConnected).toBe(true);
  });

  it('emits disconnected on errors and reconnects with a fresh diff', async () => {
    let fail = false;
    const client = new LiveClient({
      fetchJson: async () => {
        if (fail) throw new Error('ECONNREFUSED');
        return data(5, [ev(0, 'GameStart', 0)]);
      },
    });
    const poller = new LivePoller({ client });
    const log: string[] = [];
    poller.on('connected', () => log.push('connected'));
    poller.on('disconnected', () => log.push('disconnected'));
    poller.on('error', () => log.push('error'));
    poller.on('snapshot', (_d, fresh) => log.push(`fresh:${fresh.length}`));
    await poller.poll();
    fail = true;
    await poller.poll();
    await poller.poll();
    fail = false;
    await poller.poll();
    expect(log).toEqual(['connected', 'fresh:1', 'disconnected', 'error', 'error', 'connected', 'fresh:1']);
  });

  it('detects a new game when the game time jumps back', async () => {
    const poller = new LivePoller({ client: new LiveClient({ fetchJson: async () => data(0, []) }) });
    const log: string[] = [];
    poller.on('newgame', () => log.push('newgame'));
    expect(poller.ingest(data(900, [ev(0, 'GameStart', 0), ev(1, 'DragonKill', 320)])).length).toBe(2);
    expect(poller.ingest(data(901, [ev(0, 'GameStart', 0), ev(1, 'DragonKill', 320)])).length).toBe(0);
    expect(poller.ingest(data(3, [ev(0, 'GameStart', 0)])).length).toBe(1);
    expect(log).toEqual(['newgame']);
  });
});
