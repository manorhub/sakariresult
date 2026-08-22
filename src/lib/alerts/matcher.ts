// src/lib/alerts/matcher.ts
// User Alert Matcher: Matches published content against user follows & preferences

import type { DbClient } from '../db.ts';
import type { PublicJobItem } from '../public_queries.ts';
import type { AlertMatchResult } from './types.ts';
import type { NotificationType } from '../user_auth.ts';

/**
 * Finds all active, verified users who should receive an alert for a published content item
 */
export async function matchUsersForContent(
  db: DbClient,
  item: PublicJobItem
): Promise<AlertMatchResult[]> {
  const matches: Map<string, AlertMatchResult> = new Map();

  let notifType: NotificationType = 'job_alert';
  let prefColumn = 'job_alerts';

  if (item.type === 'result') {
    notifType = 'result_alert';
    prefColumn = 'result_alerts';
  } else if (item.type === 'admit_card') {
    notifType = 'admit_card_alert';
    prefColumn = 'admit_card_alerts';
  } else if (item.type === 'answer_key') {
    notifType = 'answer_key_alert';
    prefColumn = 'answer_key_alerts';
  }

  // 1. Match Users following the Organization
  if (item.organization_id) {
    const orgFollowers = (await db.query<{ id: string; email: string; name: string }>(`
      SELECT u.id, u.email, u.name
      FROM followed_organizations fo
      JOIN users u ON u.id = fo.user_id
      JOIN notification_preferences np ON np.user_id = u.id
      WHERE fo.organization_id = ?
        AND u.status = 'active'
        AND u.email_verified = 1
        AND np.email_enabled = 1
        AND np.${prefColumn} = 1
    `, [item.organization_id])).results;

    for (const u of orgFollowers) {
      matches.set(u.id, {
        userId: u.id,
        email: u.email,
        name: u.name,
        type: notifType,
        title: `${item.organization_name || 'Govt'}: ${item.title}`,
        message: `New verified ${item.type.replace('_', ' ')} published for ${item.title}.`,
        contentItemId: item.id,
      });
    }
  }

  // 2. Match Users following the Category
  if (item.category_id) {
    const catFollowers = (await db.query<{ id: string; email: string; name: string }>(`
      SELECT u.id, u.email, u.name
      FROM followed_categories fc
      JOIN users u ON u.id = fc.user_id
      JOIN notification_preferences np ON np.user_id = u.id
      WHERE fc.category_id = ?
        AND u.status = 'active'
        AND u.email_verified = 1
        AND np.email_enabled = 1
        AND np.${prefColumn} = 1
    `, [item.category_id])).results;

    for (const u of catFollowers) {
      if (!matches.has(u.id)) {
        matches.set(u.id, {
          userId: u.id,
          email: u.email,
          name: u.name,
          type: notifType,
          title: item.title,
          message: `New verified alert in ${item.category_name || 'Govt Jobs'}: ${item.title}.`,
          contentItemId: item.id,
        });
      }
    }
  }

  // 3. Match Users who saved a related Job (for Result / Admit Card / Answer Key announcements)
  if (['result', 'admit_card', 'answer_key'].includes(item.type) && item.organization_id) {
    const savedJobUsers = (await db.query<{ id: string; email: string; name: string }>(`
      SELECT DISTINCT u.id, u.email, u.name
      FROM saved_items si
      JOIN content_items target_ci ON target_ci.id = si.content_item_id
      JOIN users u ON u.id = si.user_id
      JOIN notification_preferences np ON np.user_id = u.id
      WHERE target_ci.organization_id = ?
        AND target_ci.type = 'job'
        AND u.status = 'active'
        AND u.email_verified = 1
        AND np.email_enabled = 1
        AND np.${prefColumn} = 1
    `, [item.organization_id])).results;

    for (const u of savedJobUsers) {
      if (!matches.has(u.id)) {
        matches.set(u.id, {
          userId: u.id,
          email: u.email,
          name: u.name,
          type: notifType,
          title: `Update on your saved job: ${item.title}`,
          message: `Official ${item.type.replace('_', ' ')} has been released.`,
          contentItemId: item.id,
        });
      }
    }
  }

  return Array.from(matches.values());
}
