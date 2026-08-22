// src/pages/api/user/notifications.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db.ts';
import type { UserSession, UserNotification } from '../../../lib/user_auth.ts';

export const GET: APIRoute = async ({ locals }) => {
  const session = (locals as any).userSession as UserSession | null;
  if (!session) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const notifications = (await db.query<UserNotification>(`
      SELECT n.*, ci.slug as content_slug, ci.type as content_type
      FROM notifications n
      LEFT JOIN content_items ci ON ci.id = n.content_item_id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC
      LIMIT 50
    `, [session.userId])).results;

    const unreadCount = (await db.first<{ count: number }>(`
      SELECT COUNT(*) as count FROM notifications
      WHERE user_id = ? AND read_at IS NULL
    `, [session.userId]))?.count || 0;

    return new Response(JSON.stringify({ success: true, notifications, unreadCount }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const session = (locals as any).userSession as UserSession | null;
  if (!session) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const body = (await request.json()) as any;
    const { notificationId, markAllRead } = body;

    if (markAllRead) {
      await db.run('UPDATE notifications SET read_at = datetime("now"), status = "read" WHERE user_id = ? AND read_at IS NULL', [session.userId]);
      return new Response(JSON.stringify({ success: true, message: 'All notifications marked as read.' }), { status: 200 });
    }

    if (notificationId) {
      await db.run('UPDATE notifications SET read_at = datetime("now"), status = "read" WHERE id = ? AND user_id = ?', [notificationId, session.userId]);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ success: false, error: 'Invalid parameters.' }), { status: 400 });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message }), { status: 500 });
  }
};
