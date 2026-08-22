// src/pages/api/admin/seo/redirects.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db.ts';
import type { RedirectRecord } from '../../../../lib/seo/types.ts';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const redirects = (await db.query<RedirectRecord>('SELECT * FROM redirects ORDER BY created_at DESC')).results;

    return new Response(JSON.stringify({ success: true, redirects }), {
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
    const { sourcePath, destinationPath, statusCode = 301 } = body;

    if (!sourcePath || !destinationPath) {
      return new Response(JSON.stringify({ success: false, error: 'sourcePath and destinationPath are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const cleanSource = sourcePath.trim().startsWith('/') ? sourcePath.trim() : `/${sourcePath.trim()}`;
    const cleanDest = destinationPath.trim().startsWith('/') ? destinationPath.trim() : `/${destinationPath.trim()}`;

    if (cleanSource === cleanDest) {
      return new Response(JSON.stringify({ success: false, error: 'Source and destination cannot be identical (prevent loop).' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const id = `red_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    await db.run(`
      INSERT OR REPLACE INTO redirects (id, source_path, destination_path, status_code, active, updated_at)
      VALUES (?, ?, ?, ?, 1, datetime('now'))
    `, [id, cleanSource, cleanDest, Number(statusCode)]);

    return new Response(JSON.stringify({ success: true, id }), {
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

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const body = (await request.json()) as any;
    const { id } = body;

    if (!id) {
      return new Response(JSON.stringify({ success: false, error: 'Redirect ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await db.run('DELETE FROM redirects WHERE id = ?', [id]);

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
