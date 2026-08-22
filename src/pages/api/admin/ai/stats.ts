// src/pages/api/admin/ai/stats.ts
// AI Usage & Performance Metrics API

import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    // Today's metrics
    const todayStats = (await db.first<{
      requests: number;
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
      success: number;
      failed: number;
      avg_duration: number;
    }>(`
      SELECT
        COUNT(id) as requests,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0) as success,
        COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failed,
        COALESCE(AVG(duration_ms), 0) as avg_duration
      FROM ai_generations
      WHERE created_at >= date('now', 'start of day')
    `)) || { requests: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0, success: 0, failed: 0, avg_duration: 0 };

    // Month's metrics
    const monthStats = (await db.first<{
      requests: number;
      total_tokens: number;
    }>(`
      SELECT
        COUNT(id) as requests,
        COALESCE(SUM(total_tokens), 0) as total_tokens
      FROM ai_generations
      WHERE created_at >= date('now', 'start of month')
    `)) || { requests: 0, total_tokens: 0 };

    // Operations breakdown
    const operations = (await db.query<{ operation: string; count: number; tokens: number }>(`
      SELECT operation, COUNT(id) as count, SUM(total_tokens) as tokens
      FROM ai_generations
      GROUP BY operation
      ORDER BY count DESC
    `)).results;

    // Conflicts & Review queue count
    const pendingReviewCount = (await db.first<{ count: number }>(`
      SELECT COUNT(id) as count FROM content_items 
      WHERE status = 'review' OR verification_status = 'conflict_detected' OR ai_status = 'verification_required'
    `))?.count || 0;

    const conflictCount = (await db.first<{ count: number }>(`
      SELECT COUNT(id) as count FROM content_items WHERE verification_status = 'conflict_detected'
    `))?.count || 0;

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          requestsToday: todayStats.requests,
          requestsMonth: monthStats.requests,
          tokensToday: todayStats.total_tokens,
          tokensMonth: monthStats.total_tokens,
          successToday: todayStats.success,
          failedToday: todayStats.failed,
          avgDurationMs: Math.round(todayStats.avg_duration),
          pendingReviewCount,
          conflictCount,
          operationsBreakdown: operations,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Failed to fetch AI stats' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
