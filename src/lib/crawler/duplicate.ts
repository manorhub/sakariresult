// src/lib/crawler/duplicate.ts
// Deduplication & change detection against existing database records

import type { DbClient } from '../db';
import type { SourcePage, PageStatus } from '../types';

export interface DuplicateCheckResult {
  status: PageStatus;
  existingPage: SourcePage | null;
  isDuplicateUrl: boolean;
  isDuplicateFingerprint: boolean;
}

/**
 * Checks a discovered item against existing source_pages records
 */
export async function checkDuplicateAndChange(
  db: DbClient,
  sourceId: string,
  normalizedUrl: string,
  fingerprint: string,
  canonicalUrl?: string | null
): Promise<DuplicateCheckResult> {
  // 1. Search by exact normalized_url for this source
  let existingPage = await db.first<SourcePage>(
    'SELECT * FROM source_pages WHERE source_id = ? AND normalized_url = ?',
    [sourceId, normalizedUrl]
  );

  // 2. If not found by URL, check canonical_url if provided
  if (!existingPage && canonicalUrl) {
    existingPage = await db.first<SourcePage>(
      'SELECT * FROM source_pages WHERE source_id = ? AND canonical_url = ?',
      [sourceId, canonicalUrl]
    );
  }

  // If no existing record exists, it is brand NEW
  if (!existingPage) {
    // Check if another page on the same source has identical fingerprint
    const sameHashPage = await db.first<SourcePage>(
      'SELECT * FROM source_pages WHERE source_id = ? AND fingerprint = ?',
      [sourceId, fingerprint]
    );

    return {
      status: 'NEW',
      existingPage: null,
      isDuplicateUrl: false,
      isDuplicateFingerprint: !!sameHashPage,
    };
  }

  // Existing record found: determine if content has changed
  if (existingPage.fingerprint !== fingerprint) {
    return {
      status: 'UPDATED',
      existingPage,
      isDuplicateUrl: true,
      isDuplicateFingerprint: false,
    };
  }

  // Exact fingerprint and URL match -> UNCHANGED
  return {
    status: 'UNCHANGED',
    existingPage,
    isDuplicateUrl: true,
    isDuplicateFingerprint: true,
  };
}
