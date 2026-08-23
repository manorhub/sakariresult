// src/lib/alerts/digest.ts
// Daily & Weekly Digest Aggregator

import type { DbClient } from '../db.ts';
import { EmailService } from '../email/provider.ts';
import { buildDigestEmail } from '../email/templates.ts';

export interface DigestGenerationResult {
  digestType: 'Daily' | 'Weekly';
  sentCount: number;
  skippedEmptyCount: number;
}

/**
 * Aggregates and sends email digests to subscribed users
 */
export async function sendEmailDigests(
  db: DbClient,
  emailService: EmailService,
  digestType: 'Daily' | 'Weekly',
  siteUrl: string = 'https://realsarkariexam.com'
): Promise<DigestGenerationResult> {
  const prefColumn = digestType === 'Daily' ? 'daily_digest' : 'weekly_digest';
  const lookbackHours = digestType === 'Daily' ? 24 : 168; // 1 day vs 7 days

  // 1. Fetch users subscribed to this digest
  const subscribers = (await db.query<{ id: string; email: string; name: string }>(`
    SELECT u.id, u.email, u.name
    FROM users u
    JOIN notification_preferences np ON np.user_id = u.id
    WHERE u.status = 'active'
      AND u.email_verified = 1
      AND np.email_enabled = 1
      AND np.${prefColumn} = 1
  `)).results;

  let sentCount = 0;
  let skippedEmptyCount = 0;

  for (const user of subscribers) {
    // 2. Fetch published items in user's followed categories & organizations
    const recentItems = (await db.query<{ id: string; title: string; type: string; slug: string }>(`
      SELECT DISTINCT ci.id, ci.title, ci.type, ci.slug
      FROM content_items ci
      LEFT JOIN followed_categories fc ON fc.category_id = ci.category_id AND fc.user_id = ?
      LEFT JOIN followed_organizations fo ON fo.organization_id = ci.organization_id AND fo.user_id = ?
      WHERE ci.status = 'published'
        AND (fc.id IS NOT NULL OR fo.id IS NOT NULL)
        AND ci.published_at >= datetime('now', '-${lookbackHours} hours')
      ORDER BY ci.published_at DESC
      LIMIT 10
    `, [user.id, user.id])).results;

    if (recentItems.length === 0) {
      skippedEmptyCount++;
      continue;
    }

    const digestItems = recentItems.map(item => ({
      title: item.title,
      type: item.type,
      url: `${siteUrl}/${item.type === 'job' ? 'jobs' : item.type.replace('_', '-')}/${item.slug}`,
    }));

    const emailTmpl = buildDigestEmail({
      digestType,
      items: digestItems,
      siteUrl,
    });

    const res = await emailService.sendEmail({
      to: { email: user.email, name: user.name },
      subject: emailTmpl.subject,
      html: emailTmpl.html,
      text: emailTmpl.text,
    });

    if (res.success) {
      sentCount++;
    }
  }

  return {
    digestType,
    sentCount,
    skippedEmptyCount,
  };
}
