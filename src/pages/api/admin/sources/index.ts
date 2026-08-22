// src/pages/api/admin/sources/index.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { generateId } from '../../../../lib/utils';
import type { Source } from '../../../../lib/types';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const res = await db.query<Source>('SELECT * FROM sources ORDER BY priority ASC, name ASC');
    return new Response(JSON.stringify({ success: true, data: res.results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = (await request.json()) as any;
    const name = body.name?.trim();
    const base_url = body.base_url?.trim();

    if (!name || !base_url) {
      return new Response(JSON.stringify({ success: false, error: 'Source name and base URL are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const source_type = body.source_type || 'HTML';
    const category = body.category || null;
    const priority = Number(body.priority) || 3;
    const trust_level = Number(body.trust_level) || 3;
    const crawl_frequency = body.crawl_frequency || 'daily';
    const parser_type = body.parser_type || 'standard';
    const status = body.status || 'active';
    const robots_allowed = body.robots_allowed === false || body.robots_allowed === 0 ? 0 : 1;
    const id = generateId('src');

    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    await db.run(
      `INSERT INTO sources (
        id, name, base_url, source_type, category, priority, trust_level,
        crawl_frequency, parser_type, status, robots_allowed, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [id, name, base_url, source_type, category, priority, trust_level, crawl_frequency, parser_type, status, robots_allowed]
    );

    return new Response(JSON.stringify({ success: true, data: { id, name, base_url } }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
