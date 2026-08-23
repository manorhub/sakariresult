// src/pages/api/admin/content/publish-all.ts
// One-click API endpoint to auto-publish all pending drafts and process unindexed source pages

import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db.ts';
import { getStorage } from '../../../../lib/r2.ts';
import { DeepSeekClient } from '../../../../lib/ai/deepseek.ts';
import { runAIPipeline } from '../../../../lib/ai/pipeline.ts';
import type { SourcePage, Source } from '../../../../lib/types.ts';

export const prerender = false;

export const POST: APIRoute = async ({ locals }) => {
  const session = (locals as any).adminSession;
  if (!session) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const d1 = (locals as any)?.runtime?.env?.DB;
  const r2 = (locals as any)?.runtime?.env?.R2;
  const apiKey = (locals as any)?.runtime?.env?.DEEPSEEK_API_KEY || (typeof process !== 'undefined' ? process.env?.DEEPSEEK_API_KEY : '');
  const db = getDb(d1);
  const storage = getStorage(r2);

  try {
    // 1. Convert any draft / un-published content items to published
    await db.run(`
      UPDATE content_items
      SET status = 'published',
          published_at = COALESCE(published_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
      WHERE status = 'draft' OR (status = 'archived' AND auto_publish_eligible = 1)
    `);

    // 2. Fetch up to 25 unprocessed source pages and run AI extraction + auto-publish
    const pendingPages = (await db.query<SourcePage & { source_name?: string }>(`
      SELECT sp.*, s.name as source_name
      FROM source_pages sp
      LEFT JOIN sources s ON s.id = sp.source_id
      LEFT JOIN content_items ci ON ci.source_url = sp.url
      WHERE ci.id IS NULL OR ci.status = 'draft'
      ORDER BY sp.last_seen_at DESC
      LIMIT 25
    `)).results;

    const aiClient = new DeepSeekClient(
      {
        apiKey,
        mockMode: !apiKey || apiKey === 'mock_key',
      },
      db
    );

    let newlyPublishedCount = 0;
    for (const page of pendingPages) {
      try {
        const source = page.source_id ? await db.first<Source>('SELECT * FROM sources WHERE id = ?', [page.source_id]) : null;
        const res = await runAIPipeline(db, storage, aiClient, page, source);
        if (res.success) {
          newlyPublishedCount++;
        }
      } catch (err) {
        console.warn('[Publish All Processing Warning]', page.url, err);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Auto-Publish completed! Processed ${newlyPublishedCount} new posts and updated existing drafts to published.`,
      newlyPublishedCount,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({
      success: false,
      error: err.message || 'Auto-publish failed.',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
