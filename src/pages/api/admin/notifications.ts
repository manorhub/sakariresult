// src/pages/api/admin/notifications.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db.ts';
import type { UserNotification } from '../../../lib/user_auth.ts';

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const url = new URL(request.url);
    const status = url.searchParams.get('status') || '';
    const type = url.searchParams.get('type') || '';

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (status && status !== 'all') {
      conditions.push('n.status = ?');
      params.push(status);
    }

    if (type && type !== 'all') {
      conditions.push('n.type = ?');
      params.push(type);
    }

    const notifications = (await db.query<UserNotification>(`
      SELECT n.*, u.email as user_email, u.name as user_name
      FROM notifications n
      LEFT JOIN users u ON u.id = n.user_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY n.created_at DESC
      LIMIT 100
    `, params)).results;

    const stats = {
      pending: (await db.first<{ c: number }>('SELECT COUNT(*) as c FROM notifications WHERE status = "pending"'))?.c || 0,
      sent: (await db.first<{ c: number }>('SELECT COUNT(*) as c FROM notifications WHERE status = "sent"'))?.c || 0,
      failed: (await db.first<{ c: number }>('SELECT COUNT(*) as c FROM notifications WHERE status = "failed"'))?.c || 0,
      total: (await db.first<{ c: number }>('SELECT COUNT(*) as c FROM notifications'))?.c || 0,
      today: (await db.first<{ c: number }>('SELECT COUNT(*) as c FROM notifications WHERE date(created_at) = date("now")'))?.c || 0,
    };

    return new Response(JSON.stringify({ success: true, notifications, stats }), {
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
    const { notificationId, action } = body;

    if (action === 'retry' && notificationId) {
      await db.run('UPDATE notifications SET status = "pending", retry_count = 0, error_message = NULL WHERE id = ?', [notificationId]);
      return new Response(JSON.stringify({ success: true, message: 'Notification reset to pending.' }), { status: 200 });
    }

    return new Response(JSON.stringify({ success: false, error: 'Invalid action.' }), { status: 400 });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message }), { status: 500 });
  }
};
