// src/pages/api/cron/crawl.ts
// Cloudflare Cron Trigger & Webhook Endpoint for Automated Crawling

import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { getStorage } from '../../../lib/r2';
import { crawlDueSources } from '../../../lib/crawler/engine';

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
    const db = getDb(d1);
    const storage = getStorage(r2);

    const summaries = await crawlDueSources(db, storage, {
      limit: 10,
      concurrency: 3,
      maxUrlsPerSource: 25,
      respectRobots: true,
    });

    return new Response(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      sourcesProcessed: summaries.length,
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
