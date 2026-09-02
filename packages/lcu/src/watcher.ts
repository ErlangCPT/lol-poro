import { EventEmitter } from 'node:events';
import { LcuClient } from './client';
import { findLcuCredentials } from './discovery';
import type { LcuSummoner } from './types';

export type LcuStatus = 'searching' | 'connecting' | 'connected' | 'disconnected';

export interface LcuWatcherEvents {
  status: [LcuStatus];
  connected: [LcuClient, LcuSummoner];
  disconnected: [];
  error: [Error];
}

export interface LcuWatcherOptions {
  pollMs?: number;
  topics?: string[];
  extraLockfilePaths?: string[];
}

export const DEFAULT_TOPICS = [
  'OnJsonApiEvent_lol-gameflow_v1_gameflow-phase',
  'OnJsonApiEvent_lol-gameflow_v1_session',
  'OnJsonApiEvent_lol-champ-select_v1_session',
];

/**
 * Keeps a connection to the League Client alive: polls for the process, verifies the login state,
 * opens the WebSocket and starts over when the client disappears.
 */
export class LcuWatcher extends EventEmitter<LcuWatcherEvents> {
  private timer: NodeJS.Timeout | null = null;
  private client: LcuClient | null = null;
  private stopped = false;
  private _status: LcuStatus = 'searching';
  private readonly pollMs: number;
  private readonly topics: string[];
  private readonly extraLockfilePaths: string[];

  constructor(opts: LcuWatcherOptions = {}) {
    super();
    this.pollMs = opts.pollMs ?? 3000;
    this.topics = opts.topics ?? DEFAULT_TOPICS;
    this.extraLockfilePaths = opts.extraLockfilePaths ?? [];
  }

  get status(): LcuStatus {
    return this._status;
  }

  get current(): LcuClient | null {
    return this.client;
  }

  start(): void {
    this.stopped = false;
    void this.tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.client?.close();
    this.client = null;
  }

  private setStatus(s: LcuStatus): void {
    if (this._status !== s) {
      this._status = s;
      this.emit('status', s);
    }
  }

  private schedule(): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), this.pollMs);
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.client) return;
    this.setStatus(this._status === 'disconnected' ? 'disconnected' : 'searching');
    const creds = await findLcuCredentials(this.extraLockfilePaths);
    if (!creds) {
      this.schedule();
      return;
    }
    this.setStatus('connecting');
    const client = new LcuClient(creds);
    try {
      // The endpoint answers 404/500 until the player is logged in; keep polling in that case.
      const summoner = await client.get<LcuSummoner>('/lol-summoner/v1/current-summoner');
      if (!summoner?.puuid) throw new Error('not logged in yet');
      await client.connectWebSocket(this.topics);
      client.on('close', () => this.handleClose());
      client.on('error', (e) => this.emit('error', e));
      this.client = client;
      this.setStatus('connected');
      this.emit('connected', client, summoner);
    } catch (e) {
      client.close();
      this.emit('error', e instanceof Error ? e : new Error(String(e)));
      this.schedule();
    }
  }

  private handleClose(): void {
    this.client?.close();
    this.client = null;
    this.setStatus('disconnected');
    this.emit('disconnected');
    this.schedule();
  }
}
