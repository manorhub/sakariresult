// src/lib/ai/quality.ts
// Deterministic Quality Scoring Engine (0 - 100) & Publish Eligibility Evaluator

import type { ExtractedData, QualityScoreBreakdown, VerificationResult, PublishEligibility } from './types.ts';
import type { Source } from '../types.ts';

export interface QualityScoringInput {
  extracted: ExtractedData;
  verification: VerificationResult;
  source?: Source | null;
  autoPublishThreshold?: number; // default: 90
  minReviewThreshold?: number;   // default: 75
}

/**
 * Calculates a deterministic, rule-based quality score from 0 to 100
 */
export function calculateQualityScore(input: QualityScoringInput): QualityScoreBreakdown {
  const { extracted, verification, source } = input;
  const autoPublishThreshold = input.autoPublishThreshold ?? 90;
  const minReviewThreshold = input.minReviewThreshold ?? 75;

  const reasons: string[] = [];

  // 1. Source Trust Score (max 30 points)
  let sourceTrustScore = 20; // default for unknown source
  if (source && typeof source.trust_level === 'number') {
    const level = Math.min(Math.max(source.trust_level, 1), 5);
    sourceTrustScore = level * 6; // 1 -> 6, 2 -> 12, 3 -> 18, 4 -> 24, 5 -> 30
    reasons.push(`Source trust level ${level}/5 (+${sourceTrustScore} pts)`);
  } else {
    reasons.push(`Default source trust (+${sourceTrustScore} pts)`);
  }

  // 2. Required Fields Completeness (max 20 points)
  let requiredFieldsScore = 0;
  if ('organization' in extracted && extracted.organization) requiredFieldsScore += 4;
  if ('post_name' in extracted && extracted.post_name) requiredFieldsScore += 4;
  if ('exam_name' in extracted && extracted.exam_name) requiredFieldsScore += 4;
  if ('title' in extracted && extracted.title) requiredFieldsScore += 4;
  if ('vacancy' in extracted && extracted.vacancy) requiredFieldsScore += 4;
  if ('application_last_date' in extracted && extracted.application_last_date) requiredFieldsScore += 4;
  if ('result_date' in extracted && extracted.result_date) requiredFieldsScore += 4;
  if ('admit_card_date' in extracted && extracted.admit_card_date) requiredFieldsScore += 4;
  if ('answer_key_date' in extracted && extracted.answer_key_date) requiredFieldsScore += 4;
  if ('official_notification_url' in extracted && extracted.official_notification_url) requiredFieldsScore += 4;
  if ('official_apply_url' in extracted && extracted.official_apply_url) requiredFieldsScore += 4;
  if ('result_url' in extracted && extracted.result_url) requiredFieldsScore += 4;
  if ('download_url' in extracted && extracted.download_url) requiredFieldsScore += 4;

  requiredFieldsScore = Math.min(requiredFieldsScore, 20);
  reasons.push(`Required field completeness (+${requiredFieldsScore}/20 pts)`);

  // 3. Evidence Coverage (max 20 points)
  let evidenceCoverageScore = 0;
  const evidenceCount = extracted.evidence?.length || 0;
  if (evidenceCount >= 3) {
    evidenceCoverageScore = 20;
  } else if (evidenceCount === 2) {
    evidenceCoverageScore = 15;
  } else if (evidenceCount === 1) {
    evidenceCoverageScore = 10;
  } else {
    evidenceCoverageScore = 0;
    reasons.push('No source evidence items provided (-20 pts)');
  }
  if (evidenceCoverageScore > 0) {
    reasons.push(`Evidence coverage with ${evidenceCount} verified snippets (+${evidenceCoverageScore}/20 pts)`);
  }

  // 4. Link Verification (max 15 points)
  let linkVerificationScore = 15;
  const links = verification.linksValidated || [];
  const brokenCount = links.filter((l) => l.status === 'broken').length;
  const suspiciousCount = links.filter((l) => l.status === 'suspicious').length;

  if (brokenCount > 0) {
    linkVerificationScore -= brokenCount * 10;
    reasons.push(`Broken links detected (${brokenCount}) (-${brokenCount * 10} pts)`);
  }
  if (suspiciousCount > 0) {
    linkVerificationScore -= suspiciousCount * 10;
    reasons.push(`Suspicious domain links detected (${suspiciousCount}) (-${suspiciousCount * 10} pts)`);
  }
  linkVerificationScore = Math.max(0, linkVerificationScore);
  if (brokenCount === 0 && suspiciousCount === 0) {
    reasons.push(`Link verification passed (+${linkVerificationScore}/15 pts)`);
  }

  // 5. Conflict-Free Status (max 15 points)
  let conflictFreeScore = 15;
  const criticalCount = verification.conflicts.filter((c) => c.severity === 'CRITICAL').length;
  const warningCount = verification.conflicts.filter((c) => c.severity === 'WARNING').length;

  if (criticalCount > 0) {
    conflictFreeScore = 0;
    reasons.push(`CRITICAL CONFLICTS DETECTED (${criticalCount}) - Auto-publish blocked (-15 pts)`);
  } else if (warningCount > 0) {
    conflictFreeScore = Math.max(0, 15 - warningCount * 5);
    reasons.push(`Minor verification warnings (${warningCount}) (+${conflictFreeScore}/15 pts)`);
  } else {
    reasons.push(`Clean fact-check with 0 conflicts (+15/15 pts)`);
  }

  let totalScore = sourceTrustScore + requiredFieldsScore + evidenceCoverageScore + linkVerificationScore + conflictFreeScore;
  totalScore = Math.min(Math.max(totalScore, 0), 100);

  // Determine Publish Eligibility
  let eligibility: PublishEligibility = 'rejected';

  if (verification.hasCriticalConflicts || criticalCount > 0) {
    eligibility = 'review_required';
    reasons.push('Status forced to review_required due to critical conflict.');
  } else if (totalScore >= autoPublishThreshold) {
    eligibility = 'auto_publish_eligible';
  } else if (totalScore >= minReviewThreshold) {
    eligibility = 'review_required';
  } else {
    eligibility = 'rejected';
  }

  return {
    sourceTrustScore,
    requiredFieldsScore,
    evidenceCoverageScore,
    linkVerificationScore,
    conflictFreeScore,
    totalScore,
    eligibility,
    reasons,
  };
}
