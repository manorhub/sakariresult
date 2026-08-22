// src/lib/alerts/processor.ts
// Background Notification Queue Processor & Transactional Dispatcher

import type { DbClient } from '../db.ts';
import { EmailService } from '../email/provider.ts';
import {
  buildJobAlertEmail,
  buildContentAlertEmail,
  buildDeadlineReminderEmail,
} from '../email/templates.ts';
import type { NotificationQueueItem } from './types.ts';
import type { PublicJobItem } from '../public_queries.ts';

export interface ProcessQueueResult {
  processed: number;
  succeeded: number;
  failed: number;
  retried: number;
}

/**
 * Processes a batch of pending/failed notifications from D1 queue
 */
export async function processNotificationQueue(
  db: DbClient,
  emailService: EmailService,
  options: { batchSize?: number; siteUrl?: string } = {}
): Promise<ProcessQueueResult> {
  const batchSize = options.batchSize || 30;
  const siteUrl = (options.siteUrl || 'https://sarkariinfo.in').replace(/\/+$/, '');

  // Select pending notifications with user details
  const queueItems = (await db.query<NotificationQueueItem>(`
    SELECT n.*, u.email, u.name
    FROM notifications n
    JOIN users u ON u.id = n.user_id
    WHERE n.status = 'pending' OR (n.status = 'failed' AND n.retry_count < 3)
    ORDER BY n.created_at ASC
    LIMIT ?
  `, [batchSize])).results;

  let succeeded = 0;
  let failed = 0;
  let retried = 0;

  for (const item of queueItems) {
    if (!item.email) {
      await db.run('UPDATE notifications SET status = "failed", error_message = "Missing user email" WHERE id = ?', [item.id]);
      failed++;
      continue;
    }

    try {
      let emailSubject = item.title;
      let emailHtml = `<p>${item.message}</p>`;
      let emailText = item.message;

      if (item.content_item_id) {
        // Fetch content details
        const content = await db.first<PublicJobItem>(`
          SELECT ci.id, ci.type, ci.title, ci.slug,
                 j.post_name, j.vacancy as total_vacancies, j.qualification, j.application_last_date,
                 o.name as organization_name
          FROM content_items ci
          LEFT JOIN jobs j ON j.content_item_id = ci.id
          LEFT JOIN organizations o ON o.id = ci.organization_id
          WHERE ci.id = ?
        `, [item.content_item_id]);

        if (content) {
          const actionUrl = `${siteUrl}/${content.type === 'job' ? 'jobs' : content.type.replace('_', '-')}/${content.slug}`;

          if (item.type === 'job_alert') {
            const tmpl = buildJobAlertEmail({
              title: content.title,
              organization: content.organization_name || 'Government of India',
              vacancies: content.total_vacancies ? String(content.total_vacancies) : undefined,
              qualification: content.qualification || undefined,
              lastDate: content.application_last_date || undefined,
              jobUrl: actionUrl,
            });
            emailSubject = tmpl.subject;
            emailHtml = tmpl.html;
            emailText = tmpl.text;
          } else if (item.type === 'deadline_reminder') {
            const tmpl = buildDeadlineReminderEmail({
              title: content.title,
              organization: content.organization_name || 'Government of India',
              daysRemaining: 3,
              lastDate: content.application_last_date || 'Closing Soon',
              jobUrl: actionUrl,
            });
            emailSubject = tmpl.subject;
            emailHtml = tmpl.html;
            emailText = tmpl.text;
          } else if (['result_alert', 'admit_card_alert', 'answer_key_alert'].includes(item.type)) {
            const t = item.type === 'result_alert' ? 'result' : (item.type === 'admit_card_alert' ? 'admit_card' : 'answer_key');
            const tmpl = buildContentAlertEmail({
              type: t,
              title: content.title,
              organization: content.organization_name || 'Government Authority',
              actionUrl,
            });
            emailSubject = tmpl.subject;
            emailHtml = tmpl.html;
            emailText = tmpl.text;
          }
        }
      }

      // Dispatch email
      const result = await emailService.sendEmail({
        to: { email: item.email, name: item.name },
        subject: emailSubject,
        html: emailHtml,
        text: emailText,
      });

      if (result.success) {
        await db.run(
          "UPDATE notifications SET status = 'sent', sent_at = datetime('now'), error_message = NULL WHERE id = ?",
          [item.id]
        );
        succeeded++;
      } else {
        const newRetry = (item.retry_count || 0) + 1;
        const newStatus = newRetry >= 3 ? 'failed' : 'pending';
        await db.run(
          'UPDATE notifications SET status = ?, retry_count = ?, error_message = ? WHERE id = ?',
          [newStatus, newRetry, result.error || 'Delivery failed', item.id]
        );
        if (newStatus === 'failed') failed++;
        else retried++;
      }
    } catch (err: any) {
      const newRetry = (item.retry_count || 0) + 1;
      const newStatus = newRetry >= 3 ? 'failed' : 'pending';
      await db.run(
        'UPDATE notifications SET status = ?, retry_count = ?, error_message = ? WHERE id = ?',
        [newStatus, newRetry, err?.message || 'Processing error', item.id]
      );
      if (newStatus === 'failed') failed++;
      else retried++;
    }
  }

  return {
    processed: queueItems.length,
    succeeded,
    failed,
    retried,
  };
}
