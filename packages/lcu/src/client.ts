import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { HttpError, requestJson } from './http';
import type { LcuCredentials, LcuEvent } from './types';

export interface LcuClientEvents {
  event: [LcuEvent];
  close: [];
  error: [Error];
}

/** REST + WebSocket client for one running League Client instance. */
export class LcuClient extends EventEmitter<LcuClientEvents> {
  private ws: WebSocket | null = null;
  private readonly authHeader: string;
  private subscriptions = new Set<string>();
  private closed = false;

  constructor(public readonly credentials: LcuCredentials) {
    super();
    this.authHeader = `Basic ${Buffer.from(`riot:${credentials.password}`).toString('base64')}`;
  }

  get port(): number {
    return this.credentials.port;
  }

  async request<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await requestJson<T>({
      host: '127.0.0.1',
      port: this.credentials.port,
      path,
      method,
      body,
      headers: { Authorization: this.authHeader },
    });
    return res.body;
  }

  get<T = unknown>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  /** Returns undefined for 404 instead of throwing. */
  async getOptional<T = unknown>(path: string): Promise<T | undefined> {
    try {
      return await this.get<T>(path);
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) return undefined;
      throw e;
    }
  }

  /** Connects the event WebSocket and subscribes to the given topics (e.g. OnJsonApiEvent_lol-gameflow_v1_gameflow-phase). */
  connectWebSocket(topics: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws) {
        resolve();
        return;
      }
      const ws = new WebSocket(`wss://127.0.0.1:${this.credentials.port}`, 'wamp', {
        headers: { Authorization: this.authHeader },
        rejectUnauthorized: false,
      });
      let opened = false;
      ws.on('open', () => {
        opened = true;
        this.ws = ws;
        for (const t of topics) this.subscribe(t);
        resolve();
      });
      ws.on('message', (raw) => {
        const text = raw.toString();
        if (!text) return;
        try {
          const parsed = JSON.parse(text) as unknown;
          if (!Array.isArray(parsed) || parsed[0] !== 8) return;
          const topic = String(parsed[1]);
          const payload = parsed[2] as { uri: string; eventType: LcuEvent['eventType']; data: unknown };
          this.emit('event', { topic, uri: payload.uri, eventType: payload.eventType, data: payload.data });
        } catch (e) {
          this.emit('error', e instanceof Error ? e : new Error(String(e)));
        }
      });
      ws.on('error', (err) => {
        if (!opened) reject(err);
        else this.emit('error', err);
      });
      ws.on('close', () => {
        this.ws = null;
        if (!this.closed) this.emit('close');
      });
    });
  }

  subscribe(topic: string): void {
    this.subscriptions.add(topic);
    this.ws?.send(JSON.stringify([5, topic]));
  }

  unsubscribe(topic: string): void {
    this.subscriptions.delete(topic);
    this.ws?.send(JSON.stringify([6, topic]));
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }
}

export { HttpError };
