// src/lib/crawler/robots.ts
// Robots.txt compliance parser with in-memory caching

interface RobotsRule {
  userAgent: string;
  disallow: string[];
  allow: string[];
  crawlDelay?: number;
}

interface CachedRobots {
  origin: string;
  fetchedAt: number;
  rules: RobotsRule[];
}

const ROBOTS_CACHE = new Map<string, CachedRobots>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export function parseRobotsTxt(content: string): RobotsRule[] {
  const lines = content.split('\n');
  const rules: RobotsRule[] = [];
  let currentRule: RobotsRule | null = null;

  for (let rawLine of lines) {
    // Strip comments
    const hashIdx = rawLine.indexOf('#');
    if (hashIdx !== -1) rawLine = rawLine.slice(0, hashIdx);
    const line = rawLine.trim();
    if (!line) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const field = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (field === 'user-agent') {
      const ua = value.toLowerCase();
      currentRule = { userAgent: ua, disallow: [], allow: [] };
      rules.push(currentRule);
    } else if (currentRule) {
      if (field === 'disallow') {
        if (value) currentRule.disallow.push(value);
      } else if (field === 'allow') {
        if (value) currentRule.allow.push(value);
      } else if (field === 'crawl-delay') {
        const delay = parseFloat(value);
        if (!isNaN(delay)) currentRule.crawlDelay = delay;
      }
    }
  }

  return rules;
}

/**
 * Checks if a specific path is allowed by parsed rules for a given user-agent
 */
export function isPathAllowed(rules: RobotsRule[], pathname: string, userAgent = 'SarkariBot'): boolean {
  if (!rules || rules.length === 0) return true;

  const uaTarget = userAgent.toLowerCase();
  
  // Find most specific rule: exact userAgent match or fallback to '*'
  const rule = rules.find(r => r.userAgent === uaTarget) || rules.find(r => r.userAgent === '*');
  if (!rule) return true;

  // Check allowances first
  for (const allowPattern of rule.allow) {
    if (pathMatches(pathname, allowPattern)) {
      return true;
    }
  }

  // Check disallowances
  for (const disallowPattern of rule.disallow) {
    if (pathMatches(pathname, disallowPattern)) {
      return false;
    }
  }

  return true;
}

function pathMatches(pathname: string, pattern: string): boolean {
  if (!pattern) return false;
  if (pattern === '/') return pathname.startsWith('/');

  // Support basic wildcard matching (* and $)
  const regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');

  const reg = new RegExp(`^${regexPattern}`);
  return reg.test(pathname);
}

/**
 * Fetch or load cached robots.txt for an origin
 */
export async function getRobotsRules(originUrl: string, fetchFn: (url: string) => Promise<string | null>): Promise<RobotsRule[]> {
  const cached = ROBOTS_CACHE.get(originUrl);
  const now = Date.now();

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.rules;
  }

  try {
    const robotsUrl = `${originUrl.replace(/\/+$/, '')}/robots.txt`;
    const content = await fetchFn(robotsUrl);
    
    const rules = content ? parseRobotsTxt(content) : [];
    ROBOTS_CACHE.set(originUrl, { origin: originUrl, fetchedAt: now, rules });
    return rules;
  } catch {
    const rules: RobotsRule[] = [];
    ROBOTS_CACHE.set(originUrl, { origin: originUrl, fetchedAt: now, rules });
    return rules;
  }
}
