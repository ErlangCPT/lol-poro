import type { PostGameHistoryEntry, PostGameReport } from '@poro/core';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface HistoryRecord {
  entry: PostGameHistoryEntry;
  report?: PostGameReport;
}

/**
 * Local game history of the analysed post-game reports (SQLite via node:sqlite, one row per game and player).
 * The compact entry drives the trend and the history list; the full report is stored as JSON.
 */
export class HistoryStore {
  private readonly db: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS games (
        puuid TEXT NOT NULL,
        platform TEXT NOT NULL,
        game_id INTEGER NOT NULL,
        game_creation INTEGER NOT NULL,
        queue_id INTEGER NOT NULL,
        champion_id INTEGER NOT NULL,
        win INTEGER NOT NULL,
        has_timeline INTEGER NOT NULL,
        entry TEXT NOT NULL,
        report TEXT,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (puuid, platform, game_id)
      );
      CREATE INDEX IF NOT EXISTS games_by_player ON games (puuid, game_creation DESC);
    `);
  }

  /** Inserts or updates a game; a stored report is kept when the new call has none. */
  upsert(puuid: string, entry: PostGameHistoryEntry, report?: PostGameReport): void {
    const existing = report ? undefined : this.get(puuid, entry.platform, entry.gameId)?.report;
    const stored = report ?? existing;
    this.db
      .prepare(
        `INSERT INTO games (puuid, platform, game_id, game_creation, queue_id, champion_id, win, has_timeline, entry, report, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (puuid, platform, game_id) DO UPDATE SET
           game_creation = excluded.game_creation, queue_id = excluded.queue_id, champion_id = excluded.champion_id,
           win = excluded.win, has_timeline = excluded.has_timeline, entry = excluded.entry,
           report = excluded.report, updated_at = excluded.updated_at`,
      )
      .run(
        puuid,
        entry.platform,
        entry.gameId,
        entry.gameCreation,
        entry.queueId,
        entry.championId,
        entry.win ? 1 : 0,
        entry.hasTimeline ? 1 : 0,
        JSON.stringify(entry),
        stored ? JSON.stringify(stored) : null,
        Date.now(),
      );
  }

  get(puuid: string, platform: string, gameId: number): HistoryRecord | undefined {
    const row = this.db
      .prepare('SELECT entry, report FROM games WHERE puuid = ? AND platform = ? AND game_id = ?')
      .get(puuid, platform, gameId) as { entry: string; report: string | null } | undefined;
    if (!row) return undefined;
    return { entry: JSON.parse(row.entry), report: row.report ? JSON.parse(row.report) : undefined };
  }

  has(puuid: string, platform: string, gameId: number, withTimeline = false): boolean {
    const row = this.db
      .prepare('SELECT has_timeline FROM games WHERE puuid = ? AND platform = ? AND game_id = ?')
      .get(puuid, platform, gameId) as { has_timeline: number } | undefined;
    if (!row) return false;
    return withTimeline ? row.has_timeline === 1 : true;
  }

  /** Newest first. */
  list(puuid: string, limit = 50): PostGameHistoryEntry[] {
    const rows = this.db
      .prepare('SELECT entry FROM games WHERE puuid = ? ORDER BY game_creation DESC LIMIT ?')
      .all(puuid, limit) as Array<{ entry: string }>;
    return rows.map((r) => JSON.parse(r.entry));
  }

  count(puuid: string): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM games WHERE puuid = ?').get(puuid) as {
      n: number;
    };
    return row.n;
  }

  close(): void {
    this.db.close();
  }
}
