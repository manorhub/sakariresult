// src/pages/api/admin/seo/audit.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db.ts';
import { runSeoHealthAudit } from '../../../../lib/seo/audit.ts';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const audit = await runSeoHealthAudit(db);

    return new Response(JSON.stringify({ success: true, audit }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
