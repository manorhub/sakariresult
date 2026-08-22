// src/pages/api/admin/users.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db.ts';
import type { User } from '../../../lib/user_auth.ts';

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const url = new URL(request.url);
    const q = url.searchParams.get('q') || '';
    const status = url.searchParams.get('status') || '';

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (q) {
      conditions.push('(email LIKE ? OR name LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }

    if (status && status !== 'all') {
      conditions.push('status = ?');
      params.push(status);
    }

    const users = (await db.query<User>(`
      SELECT id, email, name, status, email_verified, created_at, updated_at, last_login_at
      FROM users
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT 100
    `, params)).results;

    const totalCount = (await db.first<{ count: number }>(`
      SELECT COUNT(*) as count FROM users WHERE ${conditions.join(' AND ')}
    `, params))?.count || 0;

    return new Response(JSON.stringify({ success: true, users, totalCount }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const body = (await request.json()) as any;
    const { userId, action } = body;

    if (!userId || !action) {
      return new Response(JSON.stringify({ success: false, error: 'userId and action are required.' }), { status: 400 });
    }

    if (action === 'suspend') {
      await db.run('UPDATE users SET status = "suspended", updated_at = datetime("now") WHERE id = ?', [userId]);
      // Invalidate sessions
      await db.run('DELETE FROM user_sessions WHERE user_id = ?', [userId]);
    } else if (action === 'activate') {
      await db.run('UPDATE users SET status = "active", updated_at = datetime("now") WHERE id = ?', [userId]);
    } else if (action === 'delete') {
      await db.run('DELETE FROM users WHERE id = ?', [userId]);
    }

    return new Response(JSON.stringify({ success: true, message: `User status updated to ${action}.` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message }), { status: 500 });
  }
};
