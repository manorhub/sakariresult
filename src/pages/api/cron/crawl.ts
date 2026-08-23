// src/pages/api/cron/crawl.ts
// Cloudflare Cron Trigger & Webhook Endpoint for Automated Crawling & AI Auto-Publishing

import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { getStorage } from '../../../lib/r2';
import { crawlDueSources } from '../../../lib/crawler/engine';
import { DeepSeekClient } from '../../../lib/ai/deepseek';
import { runAIPipeline } from '../../../lib/ai/pipeline';
import type { SourcePage, Source } from '../../../lib/types';

export const ALL: APIRoute = async ({ request, locals }) => {
  try {
    const url = new URL(request.url);
    const authHeader = request.headers.get('Authorization') || '';
    const cronHeader = request.headers.get('X-Cron-Secret') || '';
    const queryKey = url.searchParams.get('key') || '';

    const expectedSecret = (locals as any)?.runtime?.env?.CRON_SECRET || 'sarkari_cron_secret_2026';

    // Verify secret if provided, allow standard Cron Trigger invocation
    const isAuthorized = 
      cronHeader === expectedSecret ||
      authHeader === `Bearer ${expectedSecret}` ||
      queryKey === expectedSecret;

    if (!isAuthorized) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized cron invocation' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const d1 = (locals as any)?.runtime?.env?.DB;
    const r2 = (locals as any)?.runtime?.env?.R2;
    const apiKey = (locals as any)?.runtime?.env?.DEEPSEEK_API_KEY || (typeof process !== 'undefined' ? process.env?.DEEPSEEK_API_KEY : '');
    const db = getDb(d1);
    const storage = getStorage(r2);

    // 1. Crawl due sources
    const summaries = await crawlDueSources(db, storage, {
      limit: 10,
      concurrency: 3,
      maxUrlsPerSource: 25,
      respectRobots: true,
    });

    // 2. Autonomous AI Auto-Publish Pipeline for newly discovered / pending source pages
    let autoPublishedCount = 0;
    const aiClient = new DeepSeekClient(
      {
        apiKey,
        mockMode: !apiKey || apiKey === 'mock_key',
      },
      db
    );

    try {
      const pendingPages = (await db.query<SourcePage & { source_name?: string }>(`
        SELECT sp.*, s.name as source_name
        FROM source_pages sp
        LEFT JOIN sources s ON s.id = sp.source_id
        LEFT JOIN content_items ci ON ci.source_url = sp.url
        WHERE (ci.id IS NULL OR ci.status = 'draft')
        ORDER BY sp.last_seen_at DESC
        LIMIT 10
      `)).results;

      for (const page of pendingPages) {
        try {
          const source = page.source_id ? await db.first<Source>('SELECT * FROM sources WHERE id = ?', [page.source_id]) : null;
          const aiRes = await runAIPipeline(db, storage, aiClient, page, source);
          if (aiRes.success) {
            autoPublishedCount++;
          }
        } catch (pipeErr) {
          console.warn('[Auto-Publish Page Error]', page.url, pipeErr);
        }
      }
    } catch (aiBatchErr) {
      console.warn('[Cron AI Auto-Publish Notice]', aiBatchErr);
    }

    return new Response(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      sourcesProcessed: summaries.length,
      autoPublishedCount,
      summaries: summaries.map(s => ({
        sourceId: s.sourceId,
        sourceName: s.sourceName,
        status: s.status,
        durationMs: s.durationMs,
        discovered: s.urlsDiscovered,
        new: s.newItems,
        updated: s.updatedItems,
        unchanged: s.unchangedItems,
        documents: s.documentsDownloaded,
        errors: s.errors,
      }))
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[Cron Crawl Error]', err);
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Cron execution failed.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
