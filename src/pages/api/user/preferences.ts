// src/pages/api/user/preferences.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db.ts';
import type { UserSession, NotificationPreferences } from '../../../lib/user_auth.ts';

export const GET: APIRoute = async ({ locals }) => {
  const session = (locals as any).userSession as UserSession | null;
  if (!session) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    let pref = await db.first<NotificationPreferences>('SELECT * FROM notification_preferences WHERE user_id = ?', [session.userId]);

    if (!pref) {
      const id = `pref_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
      await db.run(`
        INSERT INTO notification_preferences (id, user_id, email_enabled, job_alerts, result_alerts, admit_card_alerts, answer_key_alerts, daily_digest, weekly_digest, deadline_reminders)
        VALUES (?, ?, 1, 1, 1, 1, 1, 0, 0, 1)
      `, [id, session.userId]);
      pref = (await db.first<NotificationPreferences>('SELECT * FROM notification_preferences WHERE user_id = ?', [session.userId]))!;
    }

    return new Response(JSON.stringify({ success: true, preferences: pref }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
    const {
      email_enabled = 1,
      job_alerts = 1,
      result_alerts = 1,
      admit_card_alerts = 1,
      answer_key_alerts = 1,
      daily_digest = 0,
      weekly_digest = 0,
      deadline_reminders = 1,
    } = body;

    await db.run(`
      INSERT INTO notification_preferences (id, user_id, email_enabled, job_alerts, result_alerts, admit_card_alerts, answer_key_alerts, daily_digest, weekly_digest, deadline_reminders, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        email_enabled = excluded.email_enabled,
        job_alerts = excluded.job_alerts,
        result_alerts = excluded.result_alerts,
        admit_card_alerts = excluded.admit_card_alerts,
        answer_key_alerts = excluded.answer_key_alerts,
        daily_digest = excluded.daily_digest,
        weekly_digest = excluded.weekly_digest,
        deadline_reminders = excluded.deadline_reminders,
        updated_at = datetime('now')
    `, [
      `pref_${Date.now().toString(36)}`,
      session.userId,
      email_enabled ? 1 : 0,
      job_alerts ? 1 : 0,
      result_alerts ? 1 : 0,
      admit_card_alerts ? 1 : 0,
      answer_key_alerts ? 1 : 0,
      daily_digest ? 1 : 0,
      weekly_digest ? 1 : 0,
      deadline_reminders ? 1 : 0,
    ]);

    return new Response(JSON.stringify({ success: true, message: 'Notification preferences updated successfully.' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message }), { status: 500 });
  }
};
