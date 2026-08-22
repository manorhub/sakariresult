// src/pages/api/admin/revenue.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db.ts';
import { logAdminAudit } from '../../../lib/logging/audit_logger.ts';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const adminSession = (locals as any)?.adminSession;
    const db = getDb(d1);

    const body = (await request.json()) as any;
    const { revenue_type, amount, source, period_start, period_end, notes } = body;

    if (!revenue_type || !amount || !source || !period_start || !period_end) {
      return new Response(JSON.stringify({ success: false, error: 'Missing required revenue fields.' }), { status: 400 });
    }

    const id = `rev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    await db.run(`
      INSERT INTO revenue_records (id, revenue_type, amount, currency, source, period_start, period_end, notes, created_at, updated_at)
      VALUES (?, ?, ?, 'INR', ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [id, revenue_type, amount, source, period_start, period_end, notes || null]);

    if (adminSession) {
      await logAdminAudit(db, adminSession.username || 'admin', 'revenue_entry', 'revenue', id, { amount, revenue_type });
    }

    return new Response(JSON.stringify({ success: true, id }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message }), { status: 500 });
  }
};
