// src/lib/dedup/merger.ts
// Lossless Content Merge & Source Attachment Engine

import type { DbClient } from '../db.ts';
import type { MergeOptions, SourceType } from './types.ts';
import { generateId, getContentTypeRoute } from '../utils.ts';
import { detectSourceType, calculateSourceAuthorityScore } from './authority.ts';

/**
 * Attach a discovered source URL to a canonical content item
 */
export async function attachSourceToCanonical(
  db: DbClient,
  contentItemId: string,
  sourceData: {
    source_url: string;
    source_id?: string | null;
    source_title?: string | null;
    source_type?: SourceType;
    source_priority?: number;
    source_published_at?: string | null;
    content_hash?: string | null;
    has_pdf?: boolean;
    has_apply_url?: boolean;
  }
): Promise<{ sourceRecordId: string; canonicalUpgraded: boolean }> {
  const type = sourceData.source_type || detectSourceType(sourceData.source_url);
  const priority = sourceData.source_priority || calculateSourceAuthorityScore(type, {
    hasOfficialPdf: sourceData.has_pdf,
    hasOfficialApplyUrl: sourceData.has_apply_url,
  });

  const sourceRecordId = generateId('csrc');

  // 1. Check if source URL is already tracked for this item
  const existingSource = await db.first<any>(
    'SELECT id, canonical_source, source_priority FROM content_sources WHERE content_item_id = ? AND source_url = ?',
    [contentItemId, sourceData.source_url]
  );

  if (existingSource) {
    await db.run(
      `UPDATE content_sources 
       SET last_checked_at = CURRENT_TIMESTAMP, 
           updated_at = CURRENT_TIMESTAMP,
           content_hash = COALESCE(?, content_hash)
       WHERE id = ?`,
      [sourceData.content_hash || null, existingSource.id]
    );
    return { sourceRecordId: existingSource.id, canonicalUpgraded: false };
  }

  // 2. Insert new content_source record
  await db.run(
    `INSERT INTO content_sources (
      id, content_item_id, source_id, source_url, source_title, source_type,
      source_priority, source_published_at, discovered_at, last_checked_at,
      content_hash, official_source, canonical_source, active, archived, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, 0, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      sourceRecordId,
      contentItemId,
      sourceData.source_id || null,
      sourceData.source_url,
      sourceData.source_title || null,
      type,
      priority,
      sourceData.source_published_at || null,
      sourceData.content_hash || null,
      type === 'official_government' ? 1 : 0,
    ]
  );

  // 3. Check if this new source should upgrade the canonical source of the content item
  let canonicalUpgraded = false;
  const canonicalItem = await db.first<any>(
    'SELECT id, canonical_source_id, canonical_source_url FROM content_items WHERE id = ?',
    [contentItemId]
  );

  if (canonicalItem) {
    let currentPriority = 0;
    if (canonicalItem.canonical_source_url) {
      const curType = detectSourceType(canonicalItem.canonical_source_url);
      currentPriority = calculateSourceAuthorityScore(curType);
    }

    if (!canonicalItem.canonical_source_url || priority > currentPriority) {
      // Upgrade canonical source
      await db.run(
        `UPDATE content_items 
         SET canonical_source_id = ?,
             canonical_source_url = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [sourceData.source_id || null, sourceData.source_url, contentItemId]
      );

      // Reset previous canonical flags and set this source as canonical
      await db.run('UPDATE content_sources SET canonical_source = 0 WHERE content_item_id = ?', [contentItemId]);
      await db.run('UPDATE content_sources SET canonical_source = 1 WHERE id = ?', [sourceRecordId]);

      canonicalUpgraded = true;
    }
  }

  return { sourceRecordId, canonicalUpgraded };
}

/**
 * Execute a lossless merge of Duplicate Content Item B into Canonical Content Item A
 */
export async function mergeDuplicateItems(
  db: DbClient,
  options: MergeOptions
): Promise<{ success: boolean; redirectedUrl?: string; message: string }> {
  const { canonicalItemId, duplicateItemId, createRedirect = true, adminUserId = 'system' } = options;

  if (canonicalItemId === duplicateItemId) {
    throw new Error('Cannot merge an item with itself.');
  }

  const canonicalItem = await db.first<any>('SELECT * FROM content_items WHERE id = ?', [canonicalItemId]);
  const duplicateItem = await db.first<any>('SELECT * FROM content_items WHERE id = ?', [duplicateItemId]);

  if (!canonicalItem || !duplicateItem) {
    throw new Error('Canonical or duplicate item not found.');
  }

  // 1. Reparent all content_sources from duplicate to canonical
  await db.run(
    `UPDATE content_sources 
     SET content_item_id = ?, 
         archive_reason = 'merged_from_' || ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE content_item_id = ?`,
    [canonicalItemId, duplicateItemId, duplicateItemId]
  );

  // 2. Preserve non-null fields from duplicate item into canonical if canonical was missing them
  const fieldsToBackfill: Record<string, any> = {};
  if (!canonicalItem.advertisement_number && duplicateItem.advertisement_number) {
    fieldsToBackfill.advertisement_number = duplicateItem.advertisement_number;
  }
  if (!canonicalItem.notification_number && duplicateItem.notification_number) {
    fieldsToBackfill.notification_number = duplicateItem.notification_number;
  }
  if (!canonicalItem.document_checksum && duplicateItem.document_checksum) {
    fieldsToBackfill.document_checksum = duplicateItem.document_checksum;
  }

  if (Object.keys(fieldsToBackfill).length > 0) {
    const setClauses = Object.keys(fieldsToBackfill).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(fieldsToBackfill), canonicalItemId];
    await db.run(`UPDATE content_items SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values);
  }

  // 3. Setup 301 SEO Redirect if duplicate was public
  let redirectedUrl: string | undefined;
  if (createRedirect && duplicateItem.slug && duplicateItem.slug !== canonicalItem.slug) {
    const route = getContentTypeRoute(duplicateItem.type || 'job');
    const fromPath = `/${route}/${duplicateItem.slug}`;
    const toPath = `/${route}/${canonicalItem.slug}`;

    try {
      await db.run(
        `INSERT INTO seo_redirects (id, source_path, target_path, status_code, is_active, created_at)
         VALUES (?, ?, ?, 301, 1, CURRENT_TIMESTAMP)
         ON CONFLICT(source_path) DO UPDATE SET target_path = excluded.target_path, status_code = 301`,
        [generateId('redir'), fromPath, toPath]
      );
      redirectedUrl = fromPath;
    } catch (redirErr: any) {
      console.warn('[SEO Redirect Warning]', redirErr?.message);
    }
  }

  // 4. Archive duplicate content item safely
  await db.run(
    `UPDATE content_items 
     SET status = 'archived',
         duplicate_status = 'merged',
         duplicate_group_id = ?,
         merged_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [canonicalItemId, duplicateItemId]
  );

  // 5. Update canonical item duplicate status
  await db.run(
    `UPDATE content_items 
     SET duplicate_status = 'canonical',
         duplicate_group_id = COALESCE(duplicate_group_id, ?),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [canonicalItemId, canonicalItemId]
  );

  // 6. Log to audit_logs
  try {
    await db.run(
      `INSERT INTO audit_logs (id, admin_user_id, action, entity_type, entity_id, old_values_json, new_values_json, created_at)
       VALUES (?, ?, 'MERGE_DUPLICATE', 'content_items', ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        generateId('audit'),
        adminUserId,
        canonicalItemId,
        JSON.stringify({ duplicateItemId, duplicateTitle: duplicateItem.title }),
        JSON.stringify({ canonicalItemId, canonicalTitle: canonicalItem.title, redirectedUrl }),
      ]
    );
  } catch {}

  return {
    success: true,
    redirectedUrl,
    message: `Successfully merged duplicate "${duplicateItem.title}" into canonical "${canonicalItem.title}". Sources preserved.`,
  };
}
