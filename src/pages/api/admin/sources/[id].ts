// src/pages/api/admin/sources/[id].ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import type { Source } from '../../../../lib/types';

export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const id = params.id;
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const source = await db.first<Source>('SELECT * FROM sources WHERE id = ?', [id]);
    if (!source) {
      return new Response(JSON.stringify({ success: false, error: 'Source not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, data: source }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
  try {
    const id = params.id;
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

    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    await db.run(
      `UPDATE sources
       SET name = ?, base_url = ?, source_type = ?, category = ?, priority = ?,
           trust_level = ?, crawl_frequency = ?, parser_type = ?, status = ?,
           robots_allowed = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, base_url, source_type, category, priority, trust_level, crawl_frequency, parser_type, status, robots_allowed, id]
    );

    return new Response(JSON.stringify({ success: true, message: 'Source updated successfully' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  try {
    const id = params.id;
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    await db.run('DELETE FROM sources WHERE id = ?', [id]);
    return new Response(JSON.stringify({ success: true, message: 'Source deleted successfully' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
