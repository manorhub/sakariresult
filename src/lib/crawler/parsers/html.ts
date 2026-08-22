// src/lib/crawler/parsers/html.ts
// HTML link discovery, title extraction, and canonical metadata analyzer

import type { DiscoveredItem, ParseResult } from '../types';
import { normalizeUrl, resolveUrl, isValidCrawlUrl, isPdfUrl } from '../normalizer.ts';

/**
 * Extracts links and metadata from raw HTML
 */
export function parseHtmlPage(htmlText: string, baseUrl: string): ParseResult {
  const items: DiscoveredItem[] = [];

  if (!htmlText || typeof htmlText !== 'string') {
    return { items, error: 'Empty HTML content' };
  }

  // 1. Extract Page Title
  let pageTitle = '';
  const titleMatch = htmlText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    pageTitle = titleMatch[1].replace(/<[^>]+>/g, '').trim();
  }

  // 2. Extract Canonical URL if present
  let canonicalUrl: string | null = null;
  const canonicalMatch = htmlText.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
  if (canonicalMatch) {
    const resolvedCanonical = resolveUrl(canonicalMatch[1], baseUrl);
    if (resolvedCanonical) {
      canonicalUrl = normalizeUrl(resolvedCanonical);
    }
  }

  // 3. Extract Meta Description
  let metaDescription = '';
  const metaDescMatch = htmlText.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
  if (metaDescMatch) {
    metaDescription = metaDescMatch[1].trim();
  }

  // 4. Discover all <a> links
  const seenNormalizedUrls = new Set<string>();
  const linkRegex = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(htmlText)) !== null) {
    const rawHref = match[1];
    const rawAnchorText = match[2];

    if (!isValidCrawlUrl(rawHref)) continue;

    const resolved = resolveUrl(rawHref, baseUrl);
    if (!resolved) continue;

    const normalized = normalizeUrl(resolved);
    if (seenNormalizedUrls.has(normalized)) continue;
    seenNormalizedUrls.add(normalized);

    const anchorText = rawAnchorText
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const isPdf = isPdfUrl(resolved);

    items.push({
      url: resolved,
      normalizedUrl: normalized,
      canonicalUrl,
      title: anchorText.length > 0 ? anchorText : null,
      contentType: isPdf ? 'pdf' : 'html',
      isPdf,
      metadata: {
        anchorText,
        pageCanonical: canonicalUrl,
      },
      rawContent: `${resolved}\n${anchorText}`
    });
  }

  return {
    items,
    feedTitle: pageTitle,
    feedDescription: metaDescription,
  };
}
