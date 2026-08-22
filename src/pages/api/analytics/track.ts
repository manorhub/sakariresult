// src/pages/api/analytics/track.ts
// Search Query Recording Endpoint

import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db.ts';
import { recordSearchQuery } from '../../../lib/analytics/search_tracker.ts';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    if (!d1) return new Response(JSON.stringify({ success: false }), { status: 200 });

    const db = getDb(d1);
    const body = (await request.json()) as any;
    const { query, resultsCount = 0 } = body;

    if (query) {
      await recordSearchQuery(db, String(query), Number(resultsCount));
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ success: false }), { status: 200 });
  }
};
