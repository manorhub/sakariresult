// src/pages/api/admin/ads.ts
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
    await setGlobalSetting(db, 'ads_settings', 'ads', body);

    if (adminSession) {
      await logAdminAudit(db, adminSession.username || 'admin', 'ads_settings', 'setting', 'ads_settings', body);
    }

    return new Response(JSON.stringify({ success: true, message: 'Ad configuration updated.' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message }), { status: 500 });
  }
};
