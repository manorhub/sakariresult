// src/pages/api/admin/dedup/merge.ts
// API Endpoint for Admin Merge Action

import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db.ts';
import { mergeDuplicateItems } from '../../../../lib/dedup/merger.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const session = (locals as any).adminSession;
  if (!session) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const d1 = (locals as any)?.runtime?.env?.DB;
  const db = getDb(d1);

  try {
    const body = (await request.json()) as any;
    const { canonicalItemId, duplicateItemId, createRedirect = true, notes } = body || {};

    if (!canonicalItemId || !duplicateItemId) {
      return new Response(JSON.stringify({ success: false, error: 'Both canonicalItemId and duplicateItemId are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await mergeDuplicateItems(db, {
      canonicalItemId,
      duplicateItemId,
      createRedirect,
      adminUserId: session.adminId || 'admin',
      notes,
    });

    return new Response(JSON.stringify(result), {
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
