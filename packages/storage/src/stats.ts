import type { Role, RuneSet } from '@poro/core';
import type { ChampionGroup, CrawlStore, MatchExtract, MatchupGroup, ParticipantRow } from '@poro/stats';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * SQLite store for the statistics pipeline: crawl queue (players, match ids) and the crawled participants.
 * Aggregations run as SQL GROUP BY; builds of one champion are aggregated in memory from its rows.
 */
export class StatsStore implements CrawlStore {
  private readonly db: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS crawl_players (
        puuid TEXT NOT NULL, platform TEXT NOT NULL, source TEXT NOT NULL,
        added_at INTEGER NOT NULL, fetched_at INTEGER,
        PRIMARY KEY (puuid, platform)
      );
      CREATE INDEX IF NOT EXISTS crawl_players_pending ON crawl_players (platform, fetched_at, added_at);
      CREATE TABLE IF NOT EXISTS crawl_matches (
        match_id TEXT PRIMARY KEY, platform TEXT NOT NULL, status TEXT NOT NULL,
        added_at INTEGER NOT NULL, done_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS crawl_matches_pending ON crawl_matches (platform, status, added_at);
      CREATE TABLE IF NOT EXISTS matches (
        match_id TEXT PRIMARY KEY, platform TEXT NOT NULL, patch TEXT NOT NULL, queue_id INTEGER NOT NULL,
        game_creation INTEGER NOT NULL, duration_sec INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS matches_by_patch ON matches (platform, patch, queue_id);
      CREATE TABLE IF NOT EXISTS participants (
        match_id TEXT NOT NULL, platform TEXT NOT NULL, patch TEXT NOT NULL, queue_id INTEGER NOT NULL,
        team_id INTEGER NOT NULL, champion_id INTEGER NOT NULL, role TEXT NOT NULL, win INTEGER NOT NULL,
        kills INTEGER NOT NULL, deaths INTEGER NOT NULL, assists INTEGER NOT NULL, cs INTEGER NOT NULL, gold INTEGER NOT NULL,
        opponent_champion_id INTEGER NOT NULL, items TEXT NOT NULL, trinket INTEGER NOT NULL,
        runes TEXT, spell1 INTEGER NOT NULL, spell2 INTEGER NOT NULL,
        PRIMARY KEY (match_id, team_id, champion_id)
      );
      CREATE INDEX IF NOT EXISTS participants_by_champion ON participants (platform, patch, queue_id, champion_id, role);
      CREATE TABLE IF NOT EXISTS bans (
        match_id TEXT NOT NULL, platform TEXT NOT NULL, patch TEXT NOT NULL, queue_id INTEGER NOT NULL, champion_id INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS bans_by_patch ON bans (platform, patch, queue_id, champion_id);
    `);
  }

  // ---- crawl queue ----

  enqueueMatches(platform: string, matchIds: string[]): number {
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO crawl_matches (match_id, platform, status, added_at) VALUES (?, ?, ?, ?)',
    );
    let added = 0;
    const now = Date.now();
    this.db.exec('BEGIN');
    try {
      for (const id of matchIds) added += Number(stmt.run(id, platform, 'pending', now).changes);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return added;
  }

  nextMatches(platform: string, limit: number): string[] {
    const rows = this.db
      .prepare(
        'SELECT match_id FROM crawl_matches WHERE platform = ? AND status = ? ORDER BY added_at DESC LIMIT ?',
      )
      .all(platform, 'pending', limit) as Array<{ match_id: string }>;
    return rows.map((r) => r.match_id);
  }

  markMatch(matchId: string, status: 'done' | 'skipped' | 'failed'): void {
    this.db
      .prepare('UPDATE crawl_matches SET status = ?, done_at = ? WHERE match_id = ?')
      .run(status, Date.now(), matchId);
  }

  pendingMatches(platform: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM crawl_matches WHERE platform = ? AND status = ?')
      .get(platform, 'pending') as { n: number };
    return row.n;
  }

  upsertPlayers(platform: string, puuids: string[], source: 'ladder' | 'match'): number {
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO crawl_players (puuid, platform, source, added_at) VALUES (?, ?, ?, ?)',
    );
    let added = 0;
    const now = Date.now();
    this.db.exec('BEGIN');
    try {
      for (const p of puuids) added += Number(stmt.run(p, platform, source, now).changes);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return added;
  }

  nextPlayers(platform: string, limit: number): string[] {
    const rows = this.db
      .prepare(
        'SELECT puuid FROM crawl_players WHERE platform = ? AND fetched_at IS NULL ORDER BY added_at ASC LIMIT ?',
      )
      .all(platform, limit) as Array<{ puuid: string }>;
    return rows.map((r) => r.puuid);
  }

  markPlayer(puuid: string): void {
    this.db.prepare('UPDATE crawl_players SET fetched_at = ? WHERE puuid = ?').run(Date.now(), puuid);
  }

  playerCounts(platform: string): { total: number; pending: number } {
    const row = this.db
      .prepare(
        'SELECT COUNT(*) AS total, SUM(CASE WHEN fetched_at IS NULL THEN 1 ELSE 0 END) AS pending FROM crawl_players WHERE platform = ?',
      )
      .get(platform) as { total: number; pending: number | null };
    return { total: row.total, pending: row.pending ?? 0 };
  }

  /** Lets players be crawled again for a new patch. */
  resetPlayers(platform: string): void {
    this.db.prepare('UPDATE crawl_players SET fetched_at = NULL WHERE platform = ?').run(platform);
  }

  // ---- matches ----

  hasMatch(matchId: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM matches WHERE match_id = ?').get(matchId);
  }

  insertMatch(m: MatchExtract): boolean {
    if (this.hasMatch(m.matchId)) return false;
    const part = this.db.prepare(
      `INSERT OR IGNORE INTO participants (match_id, platform, patch, queue_id, team_id, champion_id, role, win, kills, deaths, assists, cs, gold,
         opponent_champion_id, items, trinket, runes, spell1, spell2)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const ban = this.db.prepare(
      'INSERT INTO bans (match_id, platform, patch, queue_id, champion_id) VALUES (?, ?, ?, ?, ?)',
    );
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(
          'INSERT INTO matches (match_id, platform, patch, queue_id, game_creation, duration_sec) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(m.matchId, m.platform, m.patch, m.queueId, m.gameCreation, m.durationSec);
      for (const p of m.participants) {
        part.run(
          m.matchId,
          m.platform,
          m.patch,
          m.queueId,
          p.teamId,
          p.championId,
          p.role,
          p.win ? 1 : 0,
          p.kills,
          p.deaths,
          p.assists,
          p.cs,
          p.gold,
          p.opponentChampionId,
          JSON.stringify(p.items),
          p.trinket,
          p.runes ? JSON.stringify(p.runes) : null,
          p.spells[0],
          p.spells[1],
        );
      }
      for (const c of m.bans) ban.run(m.matchId, m.platform, m.patch, m.queueId, c);
      this.db.exec('COMMIT');
      return true;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  matchCount(platform: string, patch: string, queueId: number): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM matches WHERE platform = ? AND patch = ? AND queue_id = ?')
      .get(platform, patch, queueId) as { n: number };
    return row.n;
  }

  /** Patches with crawled matches, newest first. */
  patches(platform: string, queueId: number): Array<{ patch: string; matches: number }> {
    return this.db
      .prepare(
        'SELECT patch, COUNT(*) AS matches FROM matches WHERE platform = ? AND queue_id = ? GROUP BY patch ORDER BY patch DESC',
      )
      .all(platform, queueId) as Array<{ patch: string; matches: number }>;
  }

  championGroups(platform: string, patch: string, queueId: number): ChampionGroup[] {
    const rows = this.db
      .prepare(
        `SELECT champion_id, role, COUNT(*) AS games, SUM(win) AS wins, SUM(kills) AS kills, SUM(deaths) AS deaths, SUM(assists) AS assists
         FROM participants WHERE platform = ? AND patch = ? AND queue_id = ? GROUP BY champion_id, role`,
      )
      .all(platform, patch, queueId) as Array<{
      champion_id: number;
      role: Role;
      games: number;
      wins: number;
      kills: number;
      deaths: number;
      assists: number;
    }>;
    return rows.map((r) => ({
      championId: r.champion_id,
      role: r.role,
      games: r.games,
      wins: r.wins,
      kills: r.kills,
      deaths: r.deaths,
      assists: r.assists,
    }));
  }

  banCounts(platform: string, patch: string, queueId: number): Record<number, number> {
    const rows = this.db
      .prepare(
        'SELECT champion_id, COUNT(*) AS n FROM bans WHERE platform = ? AND patch = ? AND queue_id = ? GROUP BY champion_id',
      )
      .all(platform, patch, queueId) as Array<{ champion_id: number; n: number }>;
    const out: Record<number, number> = {};
    for (const r of rows) out[r.champion_id] = r.n;
    return out;
  }

  matchupGroups(platform: string, patch: string, queueId: number, minGames = 1): MatchupGroup[] {
    const rows = this.db
      .prepare(
        `SELECT champion_id, opponent_champion_id, role, COUNT(*) AS games, SUM(win) AS wins
         FROM participants WHERE platform = ? AND patch = ? AND queue_id = ? AND opponent_champion_id > 0
         GROUP BY champion_id, opponent_champion_id, role HAVING COUNT(*) >= ?`,
      )
      .all(platform, patch, queueId, minGames) as Array<{
      champion_id: number;
      opponent_champion_id: number;
      role: Role;
      games: number;
      wins: number;
    }>;
    return rows.map((r) => ({
      championId: r.champion_id,
      opponentChampionId: r.opponent_champion_id,
      role: r.role,
      games: r.games,
      wins: r.wins,
    }));
  }

  championRows(
    platform: string,
    patch: string,
    queueId: number,
    championId: number,
    role: Role,
  ): ParticipantRow[] {
    const rows = this.db
      .prepare(
        `SELECT match_id, team_id, win, kills, deaths, assists, cs, gold, opponent_champion_id, items, trinket, runes, spell1, spell2, game_creation, duration_sec
         FROM participants JOIN matches USING (match_id)
         WHERE participants.platform = ? AND participants.patch = ? AND participants.queue_id = ? AND champion_id = ? AND role = ?`,
      )
      .all(platform, patch, queueId, championId, role) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      matchId: r.match_id as string,
      platform,
      patch,
      queueId,
      gameCreation: r.game_creation as number,
      durationSec: r.duration_sec as number,
      teamId: r.team_id as number,
      championId,
      role,
      win: r.win === 1,
      kills: r.kills as number,
      deaths: r.deaths as number,
      assists: r.assists as number,
      cs: r.cs as number,
      gold: r.gold as number,
      opponentChampionId: r.opponent_champion_id as number,
      items: JSON.parse(r.items as string) as number[],
      trinket: r.trinket as number,
      runes: r.runes ? (JSON.parse(r.runes as string) as RuneSet) : undefined,
      spells: [r.spell1 as number, r.spell2 as number],
    }));
  }

  /** Removes crawled data of old patches (keeps the newest `keep`). */
  pruneOldPatches(platform: string, queueId: number, keep = 2): number {
    const all = this.patches(platform, queueId).map((p) => p.patch);
    const old = all.slice(keep);
    for (const patch of old) {
      for (const table of ['participants', 'bans', 'matches']) {
        this.db
          .prepare(`DELETE FROM ${table} WHERE platform = ? AND patch = ? AND queue_id = ?`)
          .run(platform, patch, queueId);
      }
    }
    return old.length;
  }

  close(): void {
    this.db.close();
  }
}
