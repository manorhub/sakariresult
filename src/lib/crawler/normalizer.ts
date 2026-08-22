// src/lib/crawler/normalizer.ts
// URL normalization and sanitization utility for deduplication

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'fbclid',
  'gclid',
  'msclkid',
  '_ga',
  '_gl',
  'mc_cid',
  'mc_eid',
  'ref',
  'source',
  'trk',
  'si',
]);

const INVALID_PROTOCOLS = new Set([
  'javascript:',
  'mailto:',
  'tel:',
  'data:',
  'sms:',
  'whatsapp:',
  'tg:',
  'file:',
  'ftp:',
]);

/**
 * Checks whether a candidate URL string is a valid crawlable web URL
 */
export function isValidCrawlUrl(rawUrl: string | null | undefined): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0 || trimmed.startsWith('#') || trimmed.toLowerCase().startsWith('javascript:')) {
    return false;
  }

  for (const proto of INVALID_PROTOCOLS) {
    if (trimmed.toLowerCase().startsWith(proto)) {
      return false;
    }
  }

  return true;
}

/**
 * Resolves a relative URL against a base URL safely
 */
export function resolveUrl(rawUrl: string, baseUrl: string): string | null {
  if (!isValidCrawlUrl(rawUrl)) return null;

  try {
    const base = new URL(baseUrl);
    const resolved = new URL(rawUrl.trim(), base);
    
    // Only accept http / https
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return null;
    }
    return resolved.toString();
  } catch {
    return null;
  }
}

/**
 * Normalizes a URL to a canonical format for exact deduplication
 */
export function normalizeUrl(urlStr: string): string {
  try {
    const parsed = new URL(urlStr.trim());

    // 1. Force lowercase protocol and hostname
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();

    // 2. Remove default ports
    if ((parsed.protocol === 'http:' && parsed.port === '80') || (parsed.protocol === 'https:' && parsed.port === '443')) {
      parsed.port = '';
    }

    // 3. Remove hash fragment
    parsed.hash = '';

    // 4. Remove tracking parameters and sort remaining parameters
    const searchParams = new URLSearchParams(parsed.search);
    const filteredParams = new URLSearchParams();
    const sortedKeys = Array.from(searchParams.keys()).sort();

    for (const key of sortedKeys) {
      if (!TRACKING_PARAMS.has(key.toLowerCase())) {
        const values = searchParams.getAll(key);
        for (const val of values) {
          filteredParams.append(key, val);
        }
      }
    }

    parsed.search = filteredParams.toString() ? `?${filteredParams.toString()}` : '';

    // 5. Remove trailing slash if pathname is more than '/'
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    parsed.pathname = pathname;

    return parsed.toString();
  } catch {
    // If URL parsing fails, return sanitized trimmed string
    return urlStr.trim().replace(/#.*$/, '');
  }
}

/**
 * Extracts the root domain / origin for robots.txt fetching
 */
export function getOriginUrl(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    return parsed.origin;
  } catch {
    return urlStr;
  }
}

/**
 * Checks if a URL ends with a PDF extension
 */
export function isPdfUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    return parsed.pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return urlStr.toLowerCase().endsWith('.pdf');
  }
}
