// src/pages/api/admin/ai/batch-process.ts
// API route to batch-process unindexed or updated source pages

import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { getStorage } from '../../../../lib/r2';
import { DeepSeekClient } from '../../../../lib/ai/deepseek';
import { runAIPipeline } from '../../../../lib/ai/pipeline';
import type { SourcePage, Source } from '../../../../lib/types';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const r2 = (locals as any)?.runtime?.env?.R2;
    const apiKey = (locals as any)?.runtime?.env?.DEEPSEEK_API_KEY || (typeof process !== 'undefined' ? process.env?.DEEPSEEK_API_KEY : '');

    const db = getDb(d1);
    const storage = getStorage(r2);
    const body = (await request.json().catch(() => ({}))) as any;

    const limit = Math.min(Math.max(body.limit || 5, 1), 20);

    // Fetch pages that need AI processing: NEW or UPDATED without recent content item or with pending status
    const pages = (await db.query<SourcePage & { source_name: string; trust_level: number }>(`
      SELECT sp.*, s.name as source_name, s.trust_level
      FROM source_pages sp
      LEFT JOIN sources s ON s.id = sp.source_id
      LEFT JOIN content_items ci ON ci.source_url = sp.url
      WHERE (ci.id IS NULL OR ci.ai_status = 'pending' OR sp.last_status = 'UPDATED')
      ORDER BY sp.last_seen_at DESC
      LIMIT ?
    `, [limit])).results;

    if (pages.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No unprocessed source pages found.', processed: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const aiClient = new DeepSeekClient(
      {
        apiKey,
        mockMode: !apiKey || apiKey === 'mock_key',
      },
      db
    );

    const results = [];
    for (const page of pages) {
      const source = page.source_id ? await db.first<Source>('SELECT * FROM sources WHERE id = ?', [page.source_id]) : null;
      const res = await runAIPipeline(db, storage, aiClient, page, source);
      results.push({
        sourcePageId: page.id,
        url: page.url,
        title: page.title,
        status: res.status,
        eligibility: res.publishEligibility,
        qualityScore: res.quality?.totalScore || 0,
        errors: res.errors,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        data: results,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Batch AI processing failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
