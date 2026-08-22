// src/pages/api/admin/sources/crawl.ts
// Manual "Run Now" trigger endpoint for a specific source

import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { getStorage } from '../../../../lib/r2';
import { crawlSingleSource } from '../../../../lib/crawler/engine';
import type { Source } from '../../../../lib/types';

// In-memory cooldown tracking per source (10 seconds)
const LAST_RUN_TIMESTAMPS = new Map<string, number>();
const COOLDOWN_MS = 10_000;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = (await request.json()) as any;
    const sourceId = body.sourceId?.trim();

    if (!sourceId) {
      return new Response(JSON.stringify({ success: false, error: 'sourceId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Cooldown check
    const now = Date.now();
    const lastRun = LAST_RUN_TIMESTAMPS.get(sourceId) || 0;
    if (now - lastRun < COOLDOWN_MS) {
      const remainingSec = Math.ceil((COOLDOWN_MS - (now - lastRun)) / 1000);
      return new Response(JSON.stringify({
        success: false,
        error: `Please wait ${remainingSec}s before running this source again (cooldown active).`
      }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    LAST_RUN_TIMESTAMPS.set(sourceId, now);

    const d1 = (locals as any)?.runtime?.env?.DB;
    const r2 = (locals as any)?.runtime?.env?.R2;
    const db = getDb(d1);
    const storage = getStorage(r2);

    const source = await db.first<Source>('SELECT * FROM sources WHERE id = ?', [sourceId]);
    if (!source) {
      return new Response(JSON.stringify({ success: false, error: 'Source not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const summary = await crawlSingleSource(db, storage, source, {
      maxUrlsPerSource: 30,
      respectRobots: source.robots_allowed === 1,
    });

    return new Response(JSON.stringify({
      success: true,
      message: `Crawl ${summary.status}: Discovered ${summary.urlsDiscovered} URLs, ${summary.newItems} new, ${summary.updatedItems} updated.`,
      summary,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[Manual Crawl Error]', err);
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Manual crawl failed.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
