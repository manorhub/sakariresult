// src/pages/api/admin/seo/settings.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db.ts';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const rows = (await db.query<{ key: string; value: string; type: string }>('SELECT key, value, type FROM settings WHERE key LIKE "seo_%" OR key = "site_name" OR key = "site_url"')).results;

    const settings: Record<string, any> = {};
    for (const r of rows) {
      if (r.type === 'number') settings[r.key] = Number(r.value);
      else if (r.type === 'boolean') settings[r.key] = r.value === 'true' || r.value === '1';
      else settings[r.key] = r.value;
    }

    return new Response(JSON.stringify({ success: true, settings }), {
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

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const body = (await request.json()) as any;

    for (const [k, v] of Object.entries(body)) {
      const type = typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'string';
      const strVal = String(v);

      await db.run(`
        INSERT INTO settings (id, key, value, type, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
      `, [`set_${k}`, k, strVal, type]);
    }

    return new Response(JSON.stringify({ success: true }), {
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
