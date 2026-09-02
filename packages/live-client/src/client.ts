import { request as httpsRequest } from 'node:https';
import type { LiveAllGameData, LiveEvent } from './types';

export const LIVE_CLIENT_PORT = 2999;

export interface LiveClientOptions {
  port?: number;
  timeoutMs?: number;
  /** injectable for tests; defaults to node https with the Riot self-signed certificate accepted */
  fetchJson?: (path: string) => Promise<unknown>;
}

function nodeFetchJson(port: number, timeoutMs: number) {
  return (path: string): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const req = httpsRequest(
        { host: '127.0.0.1', port, path, method: 'GET', rejectUnauthorized: false, timeout: timeoutMs },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8');
            if (res.statusCode !== 200) {
              reject(new Error(`live client ${res.statusCode}: ${body.slice(0, 200)}`));
              return;
            }
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              reject(e);
            }
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error('live client timeout')));
      req.on('error', reject);
      req.end();
    });
}

/** Thin client for the Live Client Data API of the running game. */
export class LiveClient {
  private readonly fetchJson: (path: string) => Promise<unknown>;

  constructor(options: LiveClientOptions = {}) {
    this.fetchJson =
      options.fetchJson ?? nodeFetchJson(options.port ?? LIVE_CLIENT_PORT, options.timeoutMs ?? 1500);
  }

  allGameData(): Promise<LiveAllGameData> {
    return this.fetchJson('/liveclientdata/allgamedata') as Promise<LiveAllGameData>;
  }

  async events(): Promise<LiveEvent[]> {
    const data = (await this.fetchJson('/liveclientdata/eventdata')) as { Events: LiveEvent[] };
    return data.Events;
  }
}
