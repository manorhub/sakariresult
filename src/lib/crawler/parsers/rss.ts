// src/lib/crawler/parsers/rss.ts
// RSS 2.0 and Atom XML Feed Parser

import type { DiscoveredItem, ParseResult } from '../types';
import { normalizeUrl, resolveUrl, isPdfUrl } from '../normalizer.ts';

function decodeXmlEntities(str: string): string {
  return str
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Parses RSS 2.0 and Atom XML feeds into DiscoveredItem records
 */
export function parseRssFeed(xmlText: string, baseUrl: string): ParseResult {
  const items: DiscoveredItem[] = [];

  if (!xmlText || typeof xmlText !== 'string') {
    return { items, error: 'Empty or invalid XML feed' };
  }

  // 1. Extract feed title if present
  let feedTitle = '';
  const channelTitleMatch = xmlText.match(/<title[^>]*>(.*?)<\/title>/i);
  if (channelTitleMatch) {
    feedTitle = decodeXmlEntities(channelTitleMatch[1]);
  }

  // 2. Check for standard RSS <item> tags
  const itemMatches = xmlText.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const itemXml of itemMatches) {
    const titleMatch = itemXml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkMatch = itemXml.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || itemXml.match(/<link[^>]*href=["']([^"']+)["']/i);
    const descMatch = itemXml.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
    const pubDateMatch = itemXml.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
    const enclosureMatch = itemXml.match(/<enclosure[^>]*url=["']([^"']+)["']/i);

    const title = titleMatch ? decodeXmlEntities(titleMatch[1]) : 'Untitled Notification';
    let rawLink = linkMatch ? decodeXmlEntities(linkMatch[1] || linkMatch[0]) : '';
    const description = descMatch ? decodeXmlEntities(descMatch[1]) : '';
    const pubDate = pubDateMatch ? decodeXmlEntities(pubDateMatch[1]) : '';
    const enclosureUrl = enclosureMatch ? enclosureMatch[1].trim() : null;

    // Use enclosure URL if link is missing or if enclosure is a PDF
    if (!rawLink && enclosureUrl) {
      rawLink = enclosureUrl;
    }

    if (rawLink) {
      const resolved = resolveUrl(rawLink, baseUrl);
      if (resolved) {
        const normalized = normalizeUrl(resolved);
        const isPdf = isPdfUrl(resolved) || (enclosureUrl ? isPdfUrl(enclosureUrl) : false);

        items.push({
          url: resolved,
          normalizedUrl: normalized,
          title,
          snippet: description.slice(0, 300),
          contentType: isPdf ? 'pdf' : 'html',
          isPdf,
          metadata: {
            pubDate,
            description,
            enclosureUrl,
          },
          rawContent: `${title}\n${description}\n${pubDate}`
        });
      }
    }
  }

  // 3. Check for Atom <entry> tags if no RSS items found
  if (items.length === 0) {
    const entryMatches = xmlText.match(/<entry[\s\S]*?<\/entry>/gi) || [];
    for (const entryXml of entryMatches) {
      const titleMatch = entryXml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const linkMatch = entryXml.match(/<link[^>]*href=["']([^"']+)["']/i) || entryXml.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
      const summaryMatch = entryXml.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) || entryXml.match(/<content[^>]*>([\s\S]*?)<\/content>/i);
      const updatedMatch = entryXml.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i) || entryXml.match(/<published[^>]*>([\s\S]*?)<\/published>/i);

      const title = titleMatch ? decodeXmlEntities(titleMatch[1]) : 'Untitled Atom Entry';
      const rawLink = linkMatch ? decodeXmlEntities(linkMatch[1] || linkMatch[0]) : '';
      const snippet = summaryMatch ? decodeXmlEntities(summaryMatch[1]) : '';
      const updated = updatedMatch ? decodeXmlEntities(updatedMatch[1]) : '';

      if (rawLink) {
        const resolved = resolveUrl(rawLink, baseUrl);
        if (resolved) {
          const normalized = normalizeUrl(resolved);
          const isPdf = isPdfUrl(resolved);

          items.push({
            url: resolved,
            normalizedUrl: normalized,
            title,
            snippet: snippet.slice(0, 300),
            contentType: isPdf ? 'pdf' : 'html',
            isPdf,
            metadata: {
              updated,
              snippet,
            },
            rawContent: `${title}\n${snippet}\n${updated}`
          });
        }
      }
    }
  }

  return { items, feedTitle };
}
