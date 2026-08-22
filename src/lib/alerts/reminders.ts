// src/lib/alerts/reminders.ts
// Application Deadline Reminder Engine

import type { DbClient } from '../db.ts';

export interface ReminderJobCandidate {
  content_item_id: string;
  title: string;
  organization_name: string;
  application_last_date: string;
  user_id: string;
  email: string;
  name: string;
  daysRemaining: number;
}

/**
 * Identifies upcoming application deadlines (7, 3, or 1 day left) and enqueues reminder notifications
 */
export async function checkAndEnqueueDeadlineReminders(
  db: DbClient
): Promise<{ remindersCreated: number }> {
  // Query saved jobs with active deadline reminders preference
  const candidates = (await db.query<{
    content_item_id: string;
    title: string;
    organization_name: string;
    application_last_date: string;
    user_id: string;
    email: string;
    name: string;
  }>(`
    SELECT si.content_item_id, ci.title, o.name as organization_name, j.application_last_date,
           u.id as user_id, u.email, u.name
    FROM saved_items si
    JOIN content_items ci ON ci.id = si.content_item_id AND ci.status = 'published'
    JOIN jobs j ON j.content_item_id = ci.id
    LEFT JOIN organizations o ON o.id = ci.organization_id
    JOIN users u ON u.id = si.user_id AND u.status = 'active' AND u.email_verified = 1
    JOIN notification_preferences np ON np.user_id = u.id AND np.email_enabled = 1 AND np.deadline_reminders = 1
    WHERE j.application_last_date IS NOT NULL
  `)).results;

  let remindersCreated = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const c of candidates) {
    const lastDate = new Date(c.application_last_date);
    lastDate.setHours(0, 0, 0, 0);

    const diffDays = Math.round((lastDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // Remind at 7, 3, or 1 days remaining
    if ([7, 3, 1].includes(diffDays)) {
      const type = 'deadline_reminder';
      const title = `Deadline Alert: ${diffDays} day${diffDays === 1 ? '' : 's'} left to apply for ${c.title}`;
      const message = `Application window for ${c.title} (${c.organization_name || 'Govt'}) closes on ${c.application_last_date}. Submit your form today.`;

      // Check duplicate reminder for this specific day threshold
      const existing = await db.first<{ id: string }>(`
        SELECT id FROM notifications
        WHERE user_id = ? AND content_item_id = ? AND type = ? AND title LIKE ?
      `, [c.user_id, c.content_item_id, type, `%${diffDays} day%`]);

      if (!existing) {
        const notifId = `rem_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
        await db.run(`
          INSERT INTO notifications (id, user_id, type, title, message, content_item_id, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
        `, [notifId, c.user_id, type, title, message, c.content_item_id]);
        remindersCreated++;
      }
    }
  }

  return { remindersCreated };
}
