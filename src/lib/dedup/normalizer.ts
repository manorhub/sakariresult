// src/lib/dedup/normalizer.ts
// Robust Normalization Engine for Multi-Source Government Content Matching

const ORG_ALIASES: Record<string, string> = {
  rrb: 'railway recruitment board',
  railway: 'railway recruitment board',
  railways: 'railway recruitment board',
  ssc: 'staff selection commission',
  upsc: 'union public service commission',
  ibps: 'institute of banking personnel selection',
  sbi: 'state bank of india',
  nta: 'national testing agency',
  bpsc: 'bihar public service commission',
  uppsc: 'uttar pradesh public service commission',
  rpsc: 'rajasthan public service commission',
  mppsc: 'madhya pradesh public service commission',
  drdo: 'defence research and development organisation',
  isro: 'indian space research organisation',
  kvs: 'kendriya vidyalaya sangathan',
  nvs: 'navodaya vidyalaya samiti',
  dsssb: 'delhi subordinate services selection board',
  ignou: 'indira gandhi national open university',
  ctet: 'central teacher eligibility test',
};

const EXAM_ALIASES: Record<string, string> = {
  cgl: 'combined graduate level',
  chsl: 'combined higher secondary level',
  mts: 'multi tasking staff',
  cpo: 'central police organisation',
  je: 'junior engineer',
  gd: 'general duty constable',
  ntpc: 'non technical popular categories',
  alp: 'assistant loco pilot',
  'group d': 'group d level 1',
  'level 1': 'group d level 1',
  cse: 'civil services examination',
  nda: 'national defence academy',
  cds: 'combined defence services',
  po: 'probationary officer',
  clerk: 'clerical cadre',
  so: 'specialist officer',
};

/**
 * Standardize text: lowercase, trim, normalize unicode, strip noise
 */
export function normalizeText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\w\s\-\/\.]/g, ' ') // Keep alphanumeric, spaces, hyphens, slashes, dots
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize Organization name to standard canonical token
 */
export function normalizeOrganization(org: string | null | undefined): string {
  if (!org) return '';
  const cleaned = normalizeText(org);
  for (const [alias, full] of Object.entries(ORG_ALIASES)) {
    const regex = new RegExp(`\\b${alias}\\b`, 'i');
    if (regex.test(cleaned)) {
      return full;
    }
  }
  return cleaned;
}

/**
 * Normalize Exam / Recruitment name
 */
export function normalizeRecruitmentName(name: string | null | undefined): string {
  if (!name) return '';
  let cleaned = normalizeText(name);
  for (const [alias, full] of Object.entries(EXAM_ALIASES)) {
    const regex = new RegExp(`\\b${alias}\\b`, 'i');
    if (regex.test(cleaned)) {
      cleaned = cleaned.replace(regex, full);
    }
  }
  return cleaned;
}

/**
 * Extract 4-digit Year from Title or Text (e.g. 2024, 2025, 2026, 2027)
 */
export function extractYear(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.match(/\b(202[0-9]|203[0-9])\b/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Normalize Notification / Advertisement Number (e.g. "Advt. No. 06/2026", "CEN 02/2026", "02/2026")
 */
export function normalizeNoticeNumber(num: string | null | undefined): string | null {
  if (!num) return null;
  const cleaned = normalizeText(num)
    .replace(/\b(advt|advertisement|notice|notification|no|cen|en|emp)\b/gi, '')
    .replace(/[^\w\/]/g, '')
    .trim();
  return cleaned.length >= 2 ? cleaned : null;
}

/**
 * Generate a Normalized Identity Hash string from core entities
 */
export function generateIdentityHash(parts: (string | number | null | undefined)[]): string {
  const normalized = parts
    .filter(p => p !== null && p !== undefined && String(p).trim().length > 0)
    .map(p => normalizeText(String(p)))
    .join('|');
  return normalized;
}

/**
 * Calculate token-based Jaccard similarity between two strings (0.0 to 1.0)
 */
export function calculateStringSimilarity(strA: string, strB: string): number {
  const normA = normalizeText(strA);
  const normB = normalizeText(strB);
  if (normA === normB) return 1.0;
  if (!normA || !normB) return 0.0;

  const tokensA = new Set(normA.split(' ').filter(w => w.length > 1));
  const tokensB = new Set(normB.split(' ').filter(w => w.length > 1));

  if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

  const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);

  return intersection.size / union.size;
}
