// src/pages/api/cron/process-alerts.ts
// Cloudflare Cron Task Endpoint for Processing Alert Queues & Deadline Reminders

import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db.ts';
import { EmailService } from '../../../lib/email/provider.ts';
import { processNotificationQueue } from '../../../lib/alerts/processor.ts';
import { checkAndEnqueueDeadlineReminders } from '../../../lib/alerts/reminders.ts';

export const ALL: APIRoute = async ({ locals, url, site }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    if (!d1) {
      return new Response(JSON.stringify({ success: false, error: 'Database binding unavailable' }), { status: 500 });
    }

    const db = getDb(d1);
    const emailService = new EmailService();
    const siteUrl = (site ? site.toString() : url.origin).replace(/\/+$/, '');

    // 1. Check & Enqueue approaching deadline reminders
    const reminderResult = await checkAndEnqueueDeadlineReminders(db);

    // 2. Process pending notification queue batch
    const queueResult = await processNotificationQueue(db, emailService, { batchSize: 50, siteUrl });

    // 3. Cleanup expired tokens (older than 7 days)
    await db.run('DELETE FROM email_verification_tokens WHERE expires_at < ?', [Date.now() - 7 * 24 * 60 * 60 * 1000]).catch(() => {});
    await db.run('DELETE FROM password_reset_tokens WHERE expires_at < ?', [Date.now() - 7 * 24 * 60 * 60 * 1000]).catch(() => {});

    return new Response(JSON.stringify({
      success: true,
      remindersCreated: reminderResult.remindersCreated,
      queue: queueResult,
      timestamp: new Date().toISOString(),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message }), { status: 500 });
  }
};
