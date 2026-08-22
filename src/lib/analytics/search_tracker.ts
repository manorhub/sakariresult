// src/lib/analytics/search_tracker.ts
// Anonymous Aggregate Search Query Tracker

import type { DbClient } from '../db.ts';

export async function recordSearchQuery(
  db: DbClient,
  rawQuery: string,
  resultsCount: number
): Promise<void> {
  const query = rawQuery.trim().toLowerCase();
  if (!query || query.length < 2 || query.length > 80) return;

  const id = `sq_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

  try {
    await db.run(`
      INSERT INTO search_queries (id, query_normalized, results_count, hit_count, last_searched_at)
      VALUES (?, ?, ?, 1, datetime('now'))
      ON CONFLICT(query_normalized) DO UPDATE SET
        results_count = excluded.results_count,
        hit_count = hit_count + 1,
        last_searched_at = datetime('now')
    `, [id, query, resultsCount]);
  } catch (err: any) {
    console.error('[SearchTracker Error]:', err?.message);
  }
}

export async function getTopSearchQueries(
  db: DbClient,
  limit = 20
): Promise<{ query: string; hits: number; resultsCount: number; lastSearched: string }[]> {
  try {
    const res = await db.query<{
      query_normalized: string;
      hit_count: number;
      results_count: number;
      last_searched_at: string;
    }>(`
      SELECT query_normalized, hit_count, results_count, last_searched_at
      FROM search_queries
      ORDER BY hit_count DESC
      LIMIT ?
    `, [limit]);

    return res.results.map(r => ({
      query: r.query_normalized,
      hits: r.hit_count,
      resultsCount: r.results_count,
      lastSearched: r.last_searched_at,
    }));
  } catch {
    return [];
  }
}
