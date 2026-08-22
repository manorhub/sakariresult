// src/pages/api/admin/logs/errors.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db.ts';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const body = (await request.json()) as any;
    const { errorId } = body;

    if (!errorId) {
      return new Response(JSON.stringify({ success: false, error: 'errorId is required.' }), { status: 400 });
    }

    await db.run('UPDATE error_logs SET resolved = 1 WHERE id = ?', [errorId]);

    return new Response(JSON.stringify({ success: true, message: 'Error log marked as resolved.' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message }), { status: 500 });
  }
};
