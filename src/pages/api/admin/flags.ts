// src/pages/api/admin/flags.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db.ts';
import { setFeatureFlag } from '../../../lib/settings.ts';
import { logAdminAudit } from '../../../lib/logging/audit_logger.ts';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const adminSession = (locals as any)?.adminSession;
    const db = getDb(d1);

    const body = (await request.json()) as any;
    const { key, enabled } = body;

    if (!key) {
      return new Response(JSON.stringify({ success: false, error: 'Flag key is required.' }), { status: 400 });
    }

    await setFeatureFlag(db, key, enabled === true || enabled === 1);

    if (adminSession) {
      await logAdminAudit(db, adminSession.username || 'admin', 'flag_toggle', 'flag', key, { enabled });
    }

    return new Response(JSON.stringify({ success: true, key, enabled }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message }), { status: 500 });
  }
};
