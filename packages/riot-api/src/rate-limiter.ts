export interface RateWindow {
  limit: number;
  windowMs: number;
}

/** Development/personal key defaults; updated from the X-App-Rate-Limit header at runtime. */
export const DEFAULT_APP_LIMITS: RateWindow[] = [
  { limit: 20, windowMs: 1000 },
  { limit: 100, windowMs: 120_000 },
];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Parses "100:120,20:1" into rate windows. */
export function parseRateLimitHeader(value: string | null | undefined): RateWindow[] | null {
  if (!value) return null;
  const windows: RateWindow[] = [];
  for (const part of value.split(',')) {
    const [limit, seconds] = part.split(':').map((n) => Number(n.trim()));
    if (limit && seconds) windows.push({ limit, windowMs: seconds * 1000 });
  }
  return windows.length ? windows : null;
}

/**
 * Sliding-window limiter per routing host. Keeps a small safety margin below the published limits
 * so that a burst from another client of the same key does not immediately produce 429s.
 */
export class RateLimiter {
  private readonly sent = new Map<string, number[]>();
  private readonly limits = new Map<string, RateWindow[]>();
  private readonly blockedUntil = new Map<string, number>();
  private readonly queues = new Map<string, Promise<void>>();

  constructor(private readonly defaults: RateWindow[] = DEFAULT_APP_LIMITS) {}

  updateFromHeaders(host: string, headers: { get(name: string): string | null }): void {
    const parsed = parseRateLimitHeader(headers.get('x-app-rate-limit'));
    if (parsed) this.limits.set(host, parsed);
  }

  block(host: string, ms: number): void {
    this.blockedUntil.set(host, Date.now() + ms);
  }

  /** Waits until a request to the host is allowed, then records it. Serialised per host. */
  async acquire(host: string): Promise<void> {
    const previous = this.queues.get(host) ?? Promise.resolve();
    const next = previous.then(() => this.waitForSlot(host));
    this.queues.set(
      host,
      next.catch(() => undefined),
    );
    await next;
  }

  private async waitForSlot(host: string): Promise<void> {
    for (;;) {
      const now = Date.now();
      const blocked = this.blockedUntil.get(host) ?? 0;
      if (blocked > now) {
        await sleep(blocked - now);
        continue;
      }
      const windows = this.limits.get(host) ?? this.defaults;
      const history = (this.sent.get(host) ?? []).filter(
        (t) => now - t < Math.max(...windows.map((w) => w.windowMs)),
      );
      this.sent.set(host, history);
      let waitMs = 0;
      for (const w of windows) {
        const inWindow = history.filter((t) => now - t < w.windowMs);
        const allowed = Math.max(1, Math.floor(w.limit * 0.9));
        if (inWindow.length >= allowed) {
          const oldest = inWindow[0]!;
          waitMs = Math.max(waitMs, oldest + w.windowMs - now + 25);
        }
      }
      if (waitMs > 0) {
        await sleep(waitMs);
        continue;
      }
      history.push(now);
      return;
    }
  }
}
