// src/lib/seo/canonical.ts
// Standard Canonical URL Normalizer adhering strictly to Google Search Console standards

const DEFAULT_SITE_URL = 'https://sarkariinfo.in';

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'msclkid',
  'ref',
  'source',
  '_ga',
  '_gl',
  'preview',
]);

export interface CanonicalOptions {
  siteUrl?: string;
  customCanonical?: string | null;
  preserveParams?: string[];
}

/**
 * Builds a clean, normalized, HTTPS canonical URL
 */
export function buildCanonicalUrl(rawPathOrUrl: string, options: CanonicalOptions = {}): string {
  if (options.customCanonical && options.customCanonical.trim().length > 0) {
    return options.customCanonical.trim();
  }

  const baseOrigin = (options.siteUrl || DEFAULT_SITE_URL).replace(/\/+$/, '');

  let urlObj: URL;
  try {
    if (/^https?:\/\//i.test(rawPathOrUrl)) {
      urlObj = new URL(rawPathOrUrl);
    } else {
      const cleanPath = rawPathOrUrl.startsWith('/') ? rawPathOrUrl : `/${rawPathOrUrl}`;
      urlObj = new URL(cleanPath, baseOrigin);
    }
  } catch {
    urlObj = new URL('/', baseOrigin);
  }

  // Force HTTPS and base hostname
  const baseHost = new URL(baseOrigin).host;
  urlObj.protocol = 'https:';
  urlObj.host = baseHost;

  // Clean pathname: normalize repeated slashes, lowercase
  let pathname = urlObj.pathname.toLowerCase().replace(/\/+/g, '/');
  
  // Strip trailing slash except root
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  urlObj.pathname = pathname;

  // Strip tracking parameters
  const preserveSet = new Set(options.preserveParams || []);
  const paramsToDelete: string[] = [];

  urlObj.searchParams.forEach((_, key) => {
    const lowerKey = key.toLowerCase();
    if (TRACKING_PARAMS.has(lowerKey) && !preserveSet.has(key)) {
      paramsToDelete.push(key);
    }
  });

  for (const p of paramsToDelete) {
    urlObj.searchParams.delete(p);
  }

  // If no params left, return clean URL without search
  if (Array.from(urlObj.searchParams.keys()).length === 0) {
    return `${urlObj.origin}${urlObj.pathname}`;
  }

  // Sort remaining query params for determinism
  urlObj.searchParams.sort();
  return urlObj.toString();
}
