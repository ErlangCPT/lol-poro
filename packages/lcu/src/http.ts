import { request as httpsRequest } from 'node:https';

export interface JsonResponse<T = unknown> {
  status: number;
  body: T;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    public readonly body: unknown,
  ) {
    super(`HTTP ${status} ${path}`);
    this.name = 'HttpError';
  }
}

export interface JsonRequestOptions {
  host: string;
  port: number;
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

/** Minimal JSON client for the local self-signed Riot services (LCU and Live Client Data API). */
export function requestJson<T = unknown>(opts: JsonRequestOptions): Promise<JsonResponse<T>> {
  return new Promise((resolve, reject) => {
    const payload = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const req = httpsRequest(
      {
        host: opts.host,
        port: opts.port,
        path: opts.path,
        method: opts.method ?? 'GET',
        rejectUnauthorized: false, // self-signed Riot certificate on localhost
        headers: {
          Accept: 'application/json',
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
          ...opts.headers,
        },
        timeout: opts.timeoutMs ?? 15000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let body: unknown = undefined;
          if (text.length > 0) {
            try {
              body = JSON.parse(text);
            } catch {
              body = text;
            }
          }
          const status = res.statusCode ?? 0;
          if (status >= 200 && status < 300) resolve({ status, body: body as T });
          else reject(new HttpError(status, opts.path, body));
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error(`timeout ${opts.path}`)));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}
