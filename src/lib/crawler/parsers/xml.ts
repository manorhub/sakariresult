// src/lib/crawler/parsers/xml.ts
// XML Sitemap and Sitemap Index Parser

import type { DiscoveredItem, ParseResult } from '../types';
import { normalizeUrl, resolveUrl, isPdfUrl } from '../normalizer.ts';

/**
 * Parses XML sitemaps and extracts URLs with last modified timestamps
 */
export function parseSitemapXml(xmlText: string, baseUrl: string): ParseResult {
  const items: DiscoveredItem[] = [];

  if (!xmlText || typeof xmlText !== 'string') {
    return { items, error: 'Empty XML content' };
  }

  // 1. Extract <url> blocks
  const urlBlocks = xmlText.match(/<url[\s\S]*?<\/url>/gi) || [];
  for (const block of urlBlocks) {
    const locMatch = block.match(/<loc[^>]*>([\s\S]*?)<\/loc>/i);
    const lastmodMatch = block.match(/<lastmod[^>]*>([\s\S]*?)<\/lastmod>/i);

    if (locMatch) {
      const rawUrl = locMatch[1].trim();
      const resolved = resolveUrl(rawUrl, baseUrl);
      if (resolved) {
        const lastmod = lastmodMatch ? lastmodMatch[1].trim() : undefined;
        const normalized = normalizeUrl(resolved);
        const isPdf = isPdfUrl(resolved);

        items.push({
          url: resolved,
          normalizedUrl: normalized,
          title: null,
          contentType: isPdf ? 'pdf' : 'html',
          isPdf,
          metadata: { lastmod },
          rawContent: `${resolved}\n${lastmod || ''}`
        });
      }
    }
  }

  // 2. Extract <sitemap> blocks if sitemap index
  if (items.length === 0) {
    const sitemapBlocks = xmlText.match(/<sitemap[\s\S]*?<\/sitemap>/gi) || [];
    for (const block of sitemapBlocks) {
      const locMatch = block.match(/<loc[^>]*>([\s\S]*?)<\/loc>/i);
      const lastmodMatch = block.match(/<lastmod[^>]*>([\s\S]*?)<\/lastmod>/i);

      if (locMatch) {
        const rawUrl = locMatch[1].trim();
        const resolved = resolveUrl(rawUrl, baseUrl);
        if (resolved) {
          const lastmod = lastmodMatch ? lastmodMatch[1].trim() : undefined;
          const normalized = normalizeUrl(resolved);

          items.push({
            url: resolved,
            normalizedUrl: normalized,
            title: 'Child Sitemap',
            contentType: 'xml',
            isPdf: false,
            metadata: { isSitemapIndex: true, lastmod },
            rawContent: `${resolved}\n${lastmod || ''}`
          });
        }
      }
    }
  }

  return { items };
}
