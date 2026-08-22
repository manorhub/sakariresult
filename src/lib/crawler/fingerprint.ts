// src/lib/crawler/fingerprint.ts
// Content cleaning and deterministic SHA-256 fingerprint generation

import { sha256Hex } from '../crypto.ts';

/**
 * Strips HTML tags, scripts, styles, comments, and dynamic noise to isolate core semantic content
 */
export function extractCleanContent(rawHtmlOrText: string): string {
  if (!rawHtmlOrText || typeof rawHtmlOrText !== 'string') return '';

  let cleaned = rawHtmlOrText;

  // 1. Remove script, style, noscript, svg, and iframe tags and their contents
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
  cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
  cleaned = cleaned.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ');
  cleaned = cleaned.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ');
  cleaned = cleaned.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, ' ');

  // 2. Remove HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, ' ');

  // 3. Remove all remaining HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');

  // 4. Decode common HTML entities
  cleaned = cleaned
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  // 5. Remove dynamic noise patterns (current time, common live counters, dynamic session tokens)
  cleaned = cleaned.replace(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+(?:GMT|IST|UTC)\b/gi, ' ');
  cleaned = cleaned.replace(/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|IST)?\b/gi, ' ');
  cleaned = cleaned.replace(/Visitor\s*Count\s*:\s*\d+/gi, ' ');
  cleaned = cleaned.replace(/Page\s*Hits\s*:\s*\d+/gi, ' ');

  // 6. Collapse consecutive whitespace and trim
  cleaned = cleaned.replace(/\s+/g, ' ').trim().toLowerCase();

  return cleaned;
}

/**
 * Computes a SHA-256 fingerprint for cleaned text or raw buffer
 */
export async function computeFingerprint(content: string | Uint8Array): Promise<string> {
  if (typeof content === 'string') {
    const cleanText = extractCleanContent(content);
    return await sha256Hex(cleanText.length > 0 ? cleanText : content.trim());
  }

  // Buffer fingerprinting for PDFs or binary data
  const digest = await crypto.subtle.digest('SHA-256', content as any);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
