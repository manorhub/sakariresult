// src/lib/crawler/parsers/json.ts
// JSON API response parser for structured government endpoints

import type { DiscoveredItem, ParseResult } from '../types';
import { normalizeUrl, resolveUrl, isPdfUrl } from '../normalizer.ts';

/**
 * Parses structured JSON API responses
 */
export function parseJsonFeed(jsonText: string, baseUrl: string): ParseResult {
  const items: DiscoveredItem[] = [];

  if (!jsonText || typeof jsonText !== 'string') {
    return { items, error: 'Empty JSON response' };
  }

  let data: any;
  try {
    data = JSON.parse(jsonText);
  } catch (err: any) {
    return { items, error: `Invalid JSON: ${err.message}` };
  }

  // Find array of records
  let records: any[] = [];
  if (Array.isArray(data)) {
    records = data;
  } else if (data && typeof data === 'object') {
    const candidateKeys = ['items', 'data', 'results', 'notifications', 'jobs', 'posts', 'articles', 'records'];
    for (const key of candidateKeys) {
      if (Array.isArray(data[key])) {
        records = data[key];
        break;
      }
    }
  }

  for (const rec of records) {
    if (!rec || typeof rec !== 'object') continue;

    const title = rec.title || rec.post_name || rec.subject || rec.name || rec.heading || 'Untitled Entry';
    const rawLink = rec.url || rec.link || rec.href || rec.apply_url || rec.pdf_url || rec.document_url || '';
    const description = rec.description || rec.summary || rec.snippet || '';
    const pubDate = rec.date || rec.created_at || rec.published_at || rec.publish_date || '';

    if (rawLink) {
      const resolved = resolveUrl(String(rawLink), baseUrl);
      if (resolved) {
        const normalized = normalizeUrl(resolved);
        const isPdf = isPdfUrl(resolved) || !!rec.pdf_url;

        items.push({
          url: resolved,
          normalizedUrl: normalized,
          title: String(title),
          snippet: String(description).slice(0, 300),
          contentType: isPdf ? 'pdf' : 'json',
          isPdf,
          metadata: {
            ...rec,
            pubDate,
          },
          rawContent: `${title}\n${description}\n${pubDate}\n${JSON.stringify(rec)}`
        });
      }
    }
  }

  return { items };
}
