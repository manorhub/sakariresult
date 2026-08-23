// src/lib/dedup/engine.ts
// Multi-Stage Deterministic Matching & Deduplication Engine

import type { DbClient } from '../db.ts';
import type {
  StructuredIdentity,
  MatchingSignals,
  DuplicateDetectionResult,
  MatchTier,
  DuplicateStatus,
} from './types.ts';
import { calculateStringSimilarity } from './normalizer.ts';

/**
 * Compare two Structured Identities and compute matching signals & confidence
 */
export function compareIdentities(
  sourceA: StructuredIdentity,
  sourceB: StructuredIdentity
): DuplicateDetectionResult {
  const signals: MatchingSignals = {
    exact_advt_number: false,
    exact_notif_number: false,
    exact_official_url: false,
    exact_pdf_checksum: false,
    same_org_and_exam: false,
    same_year: false,
    same_content_type: false,
    title_similarity_score: 0,
    date_match: false,
    vacancy_match: false,
    different_stage: false,
    different_year: false,
    different_recruitment: false,
  };

  const conflictingFields: string[] = [];

  // 1. Guardrail: Different Recruitment Stages (e.g. Job vs Admit Card vs Result)
  if (sourceA.content_type && sourceB.content_type && sourceA.content_type !== sourceB.content_type) {
    signals.different_stage = true;
    return {
      isDuplicate: false,
      confidenceScore: 0,
      tier: 'WEAK',
      status: 'unique',
      matchingSignals: signals,
      conflictingFields: ['content_type'],
      recommendedAction: 'link_related_stage',
      explanation: `Different recruitment stages (${sourceA.content_type} vs ${sourceB.content_type}). Should remain separate and cross-linked.`,
    };
  }
  signals.same_content_type = true;

  // 2. Guardrail: Different Years (e.g. 2025 vs 2026)
  if (sourceA.year && sourceB.year && sourceA.year !== sourceB.year) {
    signals.different_year = true;
    conflictingFields.push('year');
    return {
      isDuplicate: false,
      confidenceScore: 0,
      tier: 'WEAK',
      status: 'unique',
      matchingSignals: signals,
      conflictingFields,
      recommendedAction: 'create_unique',
      explanation: `Different recruitment years (${sourceA.year} vs ${sourceB.year}). Must NOT be merged.`,
    };
  }
  if (sourceA.year && sourceB.year && sourceA.year === sourceB.year) {
    signals.same_year = true;
  }

  // 3. Guardrail: Different Recruitments under same organization (e.g. NTPC vs Group D vs JE)
  if (
    sourceA.normalized_recruitment_name &&
    sourceB.normalized_recruitment_name &&
    sourceA.normalized_recruitment_name !== sourceB.normalized_recruitment_name
  ) {
    signals.different_recruitment = true;
    conflictingFields.push('recruitment_name');
    return {
      isDuplicate: false,
      confidenceScore: 0,
      tier: 'WEAK',
      status: 'unique',
      matchingSignals: signals,
      conflictingFields,
      recommendedAction: 'create_unique',
      explanation: `Different recruitments (${sourceA.normalized_recruitment_name} vs ${sourceB.normalized_recruitment_name}). Must NOT be merged.`,
    };
  }

  // 4. Exact Document Checksum Match (Strongest signal)
  if (
    sourceA.document_checksum &&
    sourceB.document_checksum &&
    sourceA.document_checksum === sourceB.document_checksum
  ) {
    signals.exact_pdf_checksum = true;
    return {
      isDuplicate: true,
      confidenceScore: 100,
      tier: 'EXACT',
      status: 'canonical',
      matchingSignals: signals,
      conflictingFields: [],
      recommendedAction: 'link_to_canonical',
      explanation: 'Exact official document/PDF checksum match (100% confidence).',
    };
  }

  // 5. Exact Advertisement / Notification Number Match
  if (
    sourceA.advertisement_number &&
    sourceB.advertisement_number &&
    sourceA.advertisement_number === sourceB.advertisement_number
  ) {
    signals.exact_advt_number = true;
    return {
      isDuplicate: true,
      confidenceScore: 98,
      tier: 'EXACT',
      status: 'canonical',
      matchingSignals: signals,
      conflictingFields: [],
      recommendedAction: 'link_to_canonical',
      explanation: `Exact advertisement number match (${sourceA.advertisement_number}).`,
    };
  }

  if (
    sourceA.notification_number &&
    sourceB.notification_number &&
    sourceA.notification_number === sourceB.notification_number
  ) {
    signals.exact_notif_number = true;
    return {
      isDuplicate: true,
      confidenceScore: 98,
      tier: 'EXACT',
      status: 'canonical',
      matchingSignals: signals,
      conflictingFields: [],
      recommendedAction: 'link_to_canonical',
      explanation: `Exact notification number match (${sourceA.notification_number}).`,
    };
  }

  // 6. Exact Official Notification / Website URL Match
  if (
    sourceA.official_pdf_url &&
    sourceB.official_pdf_url &&
    sourceA.official_pdf_url === sourceB.official_pdf_url
  ) {
    signals.exact_official_url = true;
    return {
      isDuplicate: true,
      confidenceScore: 96,
      tier: 'EXACT',
      status: 'canonical',
      matchingSignals: signals,
      conflictingFields: [],
      recommendedAction: 'link_to_canonical',
      explanation: `Exact official PDF notification URL match (${sourceA.official_pdf_url}).`,
    };
  }

  // 7. Structured Identity Match (Org + Recruitment + Year)
  let confidence = 0;

  if (
    sourceA.normalized_organization &&
    sourceB.normalized_organization &&
    sourceA.normalized_organization === sourceB.normalized_organization
  ) {
    confidence += 35;
    if (
      sourceA.normalized_recruitment_name &&
      sourceB.normalized_recruitment_name &&
      sourceA.normalized_recruitment_name === sourceB.normalized_recruitment_name
    ) {
      confidence += 35;
      signals.same_org_and_exam = true;
    }
  }

  if (signals.same_year) {
    confidence += 15;
  }

  // Title similarity
  const titleSim = calculateStringSimilarity(sourceA.raw_title, sourceB.raw_title);
  signals.title_similarity_score = titleSim;
  confidence += Math.round(titleSim * 20);

  // Vacancy comparison
  if (sourceA.vacancy && sourceB.vacancy) {
    if (sourceA.vacancy === sourceB.vacancy) {
      signals.vacancy_match = true;
      confidence += 10;
    } else {
      conflictingFields.push(`vacancy (A: ${sourceA.vacancy} vs B: ${sourceB.vacancy})`);
      confidence -= 15;
    }
  }

  // Date comparison
  if (sourceA.application_end && sourceB.application_end) {
    if (sourceA.application_end === sourceB.application_end) {
      signals.date_match = true;
      confidence += 10;
    } else {
      conflictingFields.push(`application_end (A: ${sourceA.application_end} vs B: ${sourceB.application_end})`);
      confidence -= 10;
    }
  }

  confidence = Math.max(0, Math.min(100, confidence));

  let tier: MatchTier = 'WEAK';
  let status: DuplicateStatus = 'unique';
  let recommendedAction: DuplicateDetectionResult['recommendedAction'] = 'create_unique';

  if (confidence >= 95) {
    tier = 'EXACT';
    status = 'canonical';
    recommendedAction = 'link_to_canonical';
  } else if (confidence >= 85) {
    tier = 'HIGH_CONFIDENCE';
    if (conflictingFields.length > 0) {
      status = 'review_required';
      recommendedAction = 'review_required';
    } else {
      status = 'canonical';
      recommendedAction = 'link_to_canonical';
    }
  } else if (confidence >= 50 || (conflictingFields.length > 0 && titleSim >= 0.3)) {
    tier = 'POSSIBLE';
    status = 'review_required';
    recommendedAction = 'review_required';
  } else {
    tier = 'WEAK';
    status = 'unique';
    recommendedAction = 'create_unique';
  }

  return {
    isDuplicate: confidence >= 85 && conflictingFields.length === 0,
    confidenceScore: confidence,
    tier,
    status,
    matchingSignals: signals,
    conflictingFields,
    recommendedAction,
    explanation: `Multi-signal match calculated at ${confidence}% confidence (Org/Exam/Year match: ${signals.same_org_and_exam}, Title Similarity: ${Math.round(titleSim * 100)}%).`,
  };
}

/**
 * Scan database to find an existing duplicate candidate for an incoming StructuredIdentity
 */
export async function findDuplicateCandidate(
  db: DbClient,
  identity: StructuredIdentity
): Promise<{
  candidateItem: any | null;
  matchResult: DuplicateDetectionResult;
}> {
  // Query 1: Exact Advertisement Number or Notification Number match
  if (identity.advertisement_number || identity.notification_number) {
    const advtMatch = await db.first<any>(
      `SELECT * FROM content_items 
       WHERE (advertisement_number IS NOT NULL AND advertisement_number = ?)
          OR (notification_number IS NOT NULL AND notification_number = ?)
       LIMIT 1`,
      [identity.advertisement_number || '', identity.notification_number || '']
    );
    if (advtMatch) {
      const match = compareIdentities(identity, {
        ...identity,
        raw_title: advtMatch.title,
        normalized_title: advtMatch.normalized_title || advtMatch.title,
        advertisement_number: advtMatch.advertisement_number,
        notification_number: advtMatch.notification_number,
        content_type: advtMatch.type,
      });
      return { candidateItem: advtMatch, matchResult: match };
    }
  }

  // Query 2: Exact Document Checksum match
  if (identity.document_checksum) {
    const docMatch = await db.first<any>(
      `SELECT * FROM content_items WHERE document_checksum = ? LIMIT 1`,
      [identity.document_checksum]
    );
    if (docMatch) {
      const match = compareIdentities(identity, {
        ...identity,
        raw_title: docMatch.title,
        document_checksum: docMatch.document_checksum,
        content_type: docMatch.type,
      });
      return { candidateItem: docMatch, matchResult: match };
    }
  }

  // Query 3: Search candidates by type and title tokens
  const candidatesResult = await db.query<any>(
    `SELECT ci.*, j.vacancy, j.application_last_date, j.official_notification_url, j.official_apply_url, j.official_website_url
     FROM content_items ci
     LEFT JOIN jobs j ON j.content_item_id = ci.id
     WHERE ci.type = ? AND ci.status IN ('published', 'draft', 'review')
     ORDER BY ci.created_at DESC LIMIT 30`,
    [identity.content_type]
  );
  const candidates = candidatesResult.results || [];

  let bestMatch: DuplicateDetectionResult = {
    isDuplicate: false,
    confidenceScore: 0,
    tier: 'WEAK',
    status: 'unique',
    matchingSignals: {} as any,
    conflictingFields: [],
    recommendedAction: 'create_unique',
    explanation: 'No candidate matches found in database.',
  };
  let bestCandidate: any | null = null;

  for (const cand of candidates) {
    const candIdentity: StructuredIdentity = {
      organization: null,
      normalized_organization: identity.normalized_organization, // Compare relative
      recruitment_name: null,
      normalized_recruitment_name: identity.normalized_recruitment_name,
      post_name: null,
      normalized_post_name: null,
      year: identity.year,
      content_type: cand.type,
      advertisement_number: cand.advertisement_number,
      notification_number: cand.notification_number,
      vacancy: cand.vacancy ? parseInt(String(cand.vacancy), 10) : null,
      application_start: null,
      application_end: cand.application_last_date,
      exam_date: null,
      official_url: cand.official_website_url || cand.official_apply_url,
      official_pdf_url: cand.official_notification_url,
      document_checksum: cand.document_checksum,
      raw_title: cand.title,
      normalized_title: cand.normalized_title || cand.title,
    };

    const res = compareIdentities(identity, candIdentity);
    if (res.confidenceScore > bestMatch.confidenceScore) {
      bestMatch = res;
      bestCandidate = cand;
    }
  }

  return { candidateItem: bestCandidate, matchResult: bestMatch };
}
