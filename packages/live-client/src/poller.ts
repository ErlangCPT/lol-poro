import { EventEmitter } from 'node:events';
import { LiveClient } from './client';
import type { LiveAllGameData, LiveEvent } from './types';

export interface LivePollerOptions {
  client?: LiveClient;
  /** polling interval while a game is expected (default 1000 ms) */
  intervalMs?: number;
  /** polling interval while idle, e.g. in the main menu (default 5000 ms) */
  idleIntervalMs?: number;
}

export interface LivePollerEvents {
  connected: [];
  disconnected: [];
  /** a new game started (event ids or game time went backwards) */
  newgame: [];
  /** every successful poll; `fresh` holds the events not seen before */
  snapshot: [data: LiveAllGameData, fresh: LiveEvent[]];
  error: [error: Error];
}

/**
 * Polls the Live Client Data API and diffs the event list, so consumers get each game event once.
 * Cheap to keep running: while no game runs the connection is refused immediately.
 */
export class LivePoller extends EventEmitter<LivePollerEvents> {
  private readonly client: LiveClient;
  private readonly intervalMs: number;
  private readonly idleIntervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private active = false;
  private polling = false;
  private connected = false;
  private lastEventId = -1;
  private lastGameTime = -1;

  constructor(options: LivePollerOptions = {}) {
    super();
    this.client = options.client ?? new LiveClient();
    this.intervalMs = options.intervalMs ?? 1000;
    this.idleIntervalMs = options.idleIntervalMs ?? 5000;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  /** `active` switches to the fast interval (call with true while the gameflow phase is in-game). */
  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    if (this.running) this.schedule(0);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule(0);
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.connected) {
      this.connected = false;
      this.emit('disconnected');
    }
  }

  /** Runs one poll immediately (also used by tests). */
  async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const data = await this.client.allGameData();
      const fresh = this.ingest(data);
      this.emit('snapshot', data, fresh);
    } catch (e) {
      if (this.connected) {
        this.connected = false;
        this.emit('disconnected');
      }
      // no game running is the normal case; only report when someone listens
      if (this.listenerCount('error') > 0) this.emit('error', e instanceof Error ? e : new Error(String(e)));
    } finally {
      this.polling = false;
    }
  }

  /** Applies a poll result to the diff state; returns the events not seen before. */
  ingest(data: LiveAllGameData): LiveEvent[] {
    const events = data.events?.Events ?? [];
    const gameTime = data.gameData?.gameTime ?? 0;
    const maxId = events.reduce((m, e) => Math.max(m, e.EventID), -1);
    if (!this.connected) {
      this.connected = true;
      this.lastEventId = -1;
      this.emit('connected');
    } else if (gameTime + 5 < this.lastGameTime || maxId < this.lastEventId) {
      // the client went from one game to the next without a gap in polling
      this.lastEventId = -1;
      this.emit('newgame');
    }
    this.lastGameTime = gameTime;
    const fresh = events.filter((e) => e.EventID > this.lastEventId);
    if (events.length > 0) this.lastEventId = Math.max(this.lastEventId, ...events.map((e) => e.EventID));
    return fresh;
  }

  private schedule(delay: number): void {
    if (!this.running) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.poll().finally(() =>
        this.schedule(this.connected || this.active ? this.intervalMs : this.idleIntervalMs),
      );
    }, delay);
  }
}
