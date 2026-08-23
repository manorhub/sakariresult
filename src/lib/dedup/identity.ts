// src/lib/dedup/identity.ts
// Structured Identity Extractor for Multi-Source Deduplication

import type { StructuredIdentity } from './types.ts';
import {
  normalizeText,
  normalizeOrganization,
  normalizeRecruitmentName,
  extractYear,
  normalizeNoticeNumber,
} from './normalizer.ts';

/**
 * Extract structured identity from extracted data or source document metadata
 */
export function extractStructuredIdentity(data: {
  title: string;
  type?: string | null;
  organization?: string | null;
  recruitment_name?: string | null;
  post_name?: string | null;
  advertisement_number?: string | null;
  notification_number?: string | null;
  vacancy?: number | string | null;
  application_start?: string | null;
  application_end?: string | null;
  application_last_date?: string | null;
  exam_date?: string | null;
  official_website_url?: string | null;
  official_notification_url?: string | null;
  official_apply_url?: string | null;
  document_checksum?: string | null;
}): StructuredIdentity {
  const rawTitle = data.title || '';
  const normalizedTitle = normalizeText(rawTitle);

  // 1. Detect Year
  const year = extractYear(rawTitle) || (data.application_start ? extractYear(data.application_start) : null) || new Date().getFullYear();

  // 2. Organization Extraction & Normalization
  const org = data.organization || detectOrganizationFromTitle(rawTitle);
  const normalizedOrg = org ? normalizeOrganization(org) : null;

  // 3. Recruitment / Exam Name Extraction
  const recruitment = data.recruitment_name || detectExamNameFromTitle(rawTitle);
  const normalizedRecruitment = recruitment ? normalizeRecruitmentName(recruitment) : null;

  // 4. Post Name Extraction
  const post = data.post_name || null;
  const normalizedPost = post ? normalizeText(post) : null;

  // 5. Advertisement / Notification Number
  const advtNo = normalizeNoticeNumber(data.advertisement_number || detectAdvtNumber(rawTitle));
  const notifNo = normalizeNoticeNumber(data.notification_number);

  // 6. Vacancy parsing
  let vacancy: number | null = null;
  if (data.vacancy !== null && data.vacancy !== undefined) {
    const parsed = parseInt(String(data.vacancy).replace(/[^\d]/g, ''), 10);
    if (!isNaN(parsed) && parsed > 0) {
      vacancy = parsed;
    }
  }

  // 7. Dates
  const appStart = data.application_start || null;
  const appEnd = data.application_end || data.application_last_date || null;
  const examDate = data.exam_date || null;

  // 8. Official URLs
  const officialUrl = data.official_website_url || data.official_apply_url || null;
  const officialPdfUrl = data.official_notification_url || null;

  return {
    organization: org || null,
    normalized_organization: normalizedOrg,
    recruitment_name: recruitment || null,
    normalized_recruitment_name: normalizedRecruitment,
    post_name: post,
    normalized_post_name: normalizedPost,
    year,
    content_type: data.type || 'job',
    advertisement_number: advtNo,
    notification_number: notifNo,
    vacancy,
    application_start: appStart,
    application_end: appEnd,
    exam_date: examDate,
    official_url: officialUrl,
    official_pdf_url: officialPdfUrl,
    document_checksum: data.document_checksum || null,
    raw_title: rawTitle,
    normalized_title: normalizedTitle,
  };
}

/**
 * Helper to identify common government organizations from raw text
 */
function detectOrganizationFromTitle(title: string): string | null {
  const norm = normalizeText(title);
  if (/\b(rrb|railway|railways)\b/.test(norm)) return 'Railway Recruitment Board';
  if (/\bssc\b/.test(norm)) return 'Staff Selection Commission';
  if (/\bupsc\b/.test(norm)) return 'Union Public Service Commission';
  if (/\bibps\b/.test(norm)) return 'Institute of Banking Personnel Selection';
  if (/\bsbi\b/.test(norm)) return 'State Bank of India';
  if (/\bnta\b/.test(norm)) return 'National Testing Agency';
  if (/\bbpsc\b/.test(norm)) return 'Bihar Public Service Commission';
  if (/\buppsc\b/.test(norm)) return 'Uttar Pradesh Public Service Commission';
  if (/\brpsc\b/.test(norm)) return 'Rajasthan Public Service Commission';
  if (/\bmppsc\b/.test(norm)) return 'Madhya Pradesh Public Service Commission';
  if (/\bdrdo\b/.test(norm)) return 'DRDO';
  if (/\bisro\b/.test(norm)) return 'ISRO';
  if (/\bdsssb\b/.test(norm)) return 'DSSSB';
  if (/\bkvs\b/.test(norm)) return 'Kendriya Vidyalaya Sangathan';
  return null;
}

/**
 * Helper to identify exam/recruitment names from raw text
 */
function detectExamNameFromTitle(title: string): string | null {
  const norm = normalizeText(title);
  if (/\b(cgl|combined graduate level)\b/.test(norm)) return 'CGL';
  if (/\b(chsl|10\+2)\b/.test(norm)) return 'CHSL';
  if (/\b(mts|multi tasking)\b/.test(norm)) return 'MTS';
  if (/\b(cpo|sub inspector)\b/.test(norm)) return 'CPO';
  if (/\b(ntpc)\b/.test(norm)) return 'NTPC';
  if (/\b(alp|loco pilot)\b/.test(norm)) return 'ALP';
  if (/\b(group d|level 1)\b/.test(norm)) return 'Group D';
  if (/\b(je|junior engineer)\b/.test(norm)) return 'Junior Engineer';
  if (/\b(gd constable|gd)\b/.test(norm)) return 'GD Constable';
  if (/\b(cse|civil services)\b/.test(norm)) return 'Civil Services';
  if (/\b(nda)\b/.test(norm)) return 'NDA';
  if (/\b(cds)\b/.test(norm)) return 'CDS';
  if (/\b(po|probationary officer)\b/.test(norm)) return 'PO';
  if (/\b(clerk)\b/.test(norm)) return 'Clerk';
  return null;
}

/**
 * Helper to detect advertisement numbers like "CEN 06/2026" or "Advt. No. 02/2026"
 */
function detectAdvtNumber(title: string): string | null {
  const match = title.match(/\b(cen|advt\.?\s*no\.?|notification\s*no\.?|emp\s*no\.?)\s*[:\-\s]?\s*([0-9A-Z\/\-]+)/i);
  return match ? match[2] : null;
}
