// src/lib/crawler/scheduler.ts
// Source scheduling logic evaluating crawl frequencies and priorities

import type { Source, CrawlFrequency } from '../types';

const FREQUENCY_MAP_MS: Record<string, number> = {
  '10m': 10 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  'hourly': 60 * 60 * 1000,
  '3h': 3 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  'daily': 24 * 60 * 60 * 1000,
  'weekly': 7 * 24 * 60 * 60 * 1000,
  'manual': Number.POSITIVE_INFINITY,
};

/**
 * Returns crawl frequency in milliseconds
 */
export function getFrequencyMs(freq: string | CrawlFrequency): number {
  const normalized = (freq || 'daily').toLowerCase().trim();
  return FREQUENCY_MAP_MS[normalized] ?? 24 * 60 * 60 * 1000;
}

/**
 * Determines if a source is currently due for a scheduled crawl
 */
export function isSourceDue(source: Source, now = Date.now()): boolean {
  if (source.status !== 'active') {
    return false;
  }

  const freqMs = getFrequencyMs(source.crawl_frequency);
  if (!Number.isFinite(freqMs)) {
    return false; // Manual only
  }

  if (!source.last_checked_at) {
    return true; // Never crawled
  }

  const lastCheckedTime = new Date(source.last_checked_at).getTime();
  if (isNaN(lastCheckedTime)) {
    return true;
  }

  return now - lastCheckedTime >= freqMs;
}

/**
 * Filters and prioritizes sources that are due for execution
 */
export function getDueSources(sources: Source[], limit = 5, now = Date.now()): Source[] {
  return sources
    .filter(s => isSourceDue(s, now))
    .sort((a, b) => {
      // 1. Sort by Priority DESC (5 is highest, 1 is lowest)
      const priorityDiff = (b.priority || 3) - (a.priority || 3);
      if (priorityDiff !== 0) return priorityDiff;

      // 2. Sort by last_checked_at ASC (oldest checked first)
      const aTime = a.last_checked_at ? new Date(a.last_checked_at).getTime() : 0;
      const bTime = b.last_checked_at ? new Date(b.last_checked_at).getTime() : 0;
      return aTime - bTime;
    })
    .slice(0, limit);
}
