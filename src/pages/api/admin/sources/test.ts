// src/pages/api/admin/sources/test.ts
// Dry-run "Test Source" diagnostic endpoint

import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { getStorage } from '../../../../lib/r2';
import { crawlSingleSource } from '../../../../lib/crawler/engine';
import type { Source } from '../../../../lib/types';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = (await request.json()) as any;
    const d1 = (locals as any)?.runtime?.env?.DB;
    const r2 = (locals as any)?.runtime?.env?.R2;
    const db = getDb(d1);
    const storage = getStorage(r2);

    let source: Source | null = null;

    if (body.sourceId) {
      source = await db.first<Source>('SELECT * FROM sources WHERE id = ?', [body.sourceId]);
    } else if (body.base_url) {
      source = {
        id: 'src_test_temp',
        name: body.name || 'Test Source',
        base_url: body.base_url.trim(),
        source_type: body.source_type || 'HTML',
        category: body.category || null,
        priority: Number(body.priority) || 3,
        trust_level: Number(body.trust_level) || 3,
        crawl_frequency: body.crawl_frequency || 'daily',
        parser_type: body.parser_type || 'standard',
        status: 'active',
        robots_allowed: body.robots_allowed === false || body.robots_allowed === 0 ? 0 : 1,
        last_checked_at: null,
        last_success_at: null,
        last_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    if (!source) {
      return new Response(JSON.stringify({ success: false, error: 'Source or base_url is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const summary = await crawlSingleSource(db, storage, source, {
      maxUrlsPerSource: 20,
      isTestRun: true,
      respectRobots: source.robots_allowed === 1,
    });

    return new Response(JSON.stringify({
      success: summary.status !== 'failed',
      summary,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[Test Source Error]', err);
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Test crawl failed.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
