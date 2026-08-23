// src/pages/api/admin/dedup/sources.ts
// API Endpoint to Fetch All Source References for a Content Item

import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db.ts';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const session = (locals as any).adminSession;
  if (!session) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const contentItemId = url.searchParams.get('contentItemId');

  if (!contentItemId) {
    return new Response(JSON.stringify({ success: false, error: 'contentItemId is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const d1 = (locals as any)?.runtime?.env?.DB;
  const db = getDb(d1);

  try {
    const sourcesResult = await db.query<any>(
      `SELECT cs.*, s.name as source_name, s.base_url
       FROM content_sources cs
       LEFT JOIN sources s ON s.id = cs.source_id
       WHERE cs.content_item_id = ?
       ORDER BY cs.canonical_source DESC, cs.source_priority DESC, cs.discovered_at ASC`,
      [contentItemId]
    );
    const sources = sourcesResult.results || [];

    return new Response(JSON.stringify({ success: true, sources }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
