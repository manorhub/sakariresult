// src/lib/alerts/queue.ts
// Notification Enqueuing & Duplicate Defense

import type { DbClient } from '../db.ts';
import type { AlertMatchResult } from './types.ts';

/**
 * Enqueues notification records into D1 queue while strictly preventing duplicates
 */
export async function enqueueNotifications(
  db: DbClient,
  matches: AlertMatchResult[]
): Promise<{ enqueued: number; skippedDuplicates: number }> {
  let enqueued = 0;
  let skippedDuplicates = 0;

  for (const match of matches) {
    // Check duplicate protection
    const existing = await db.first<{ id: string }>(`
      SELECT id FROM notifications
      WHERE user_id = ? AND content_item_id = ? AND type = ?
    `, [match.userId, match.contentItemId, match.type]);

    if (existing) {
      skippedDuplicates++;
      continue;
    }

    const notifId = `notif_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    await db.run(`
      INSERT INTO notifications (id, user_id, type, title, message, content_item_id, status, retry_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, datetime('now'))
    `, [notifId, match.userId, match.type, match.title, match.message, match.contentItemId]);

    enqueued++;
  }

  return { enqueued, skippedDuplicates };
}
