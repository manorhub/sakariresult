// src/pages/api/admin/settings.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db.ts';
import { setGlobalSetting } from '../../../lib/settings.ts';
import { logAdminAudit } from '../../../lib/logging/audit_logger.ts';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const adminSession = (locals as any)?.adminSession;
    const db = getDb(d1);

    const body = (await request.json()) as any;
    const { category, key, value } = body;

    if (!category || !key || value === undefined) {
      return new Response(JSON.stringify({ success: false, error: 'category, key, and value are required.' }), { status: 400 });
    }

    await setGlobalSetting(db, key, category, value);

    if (adminSession) {
      await logAdminAudit(db, adminSession.username || 'admin', 'maintenance_toggle', 'setting', key, { category, value });
    }

    return new Response(JSON.stringify({ success: true, message: 'Settings saved.' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message }), { status: 500 });
  }
};
