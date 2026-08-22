// src/lib/internal-links/matcher.ts
// Matcher and Ranking for Internal Content Candidates

import type { PublicJobItem } from '../public_queries.ts';
import type { InternalLinkCandidate } from './types.ts';
import { calculateRelationshipScore } from './scorer.ts';

export function getTargetUrl(item: PublicJobItem): string {
  if (item.type === 'job') return `/jobs/${item.slug}`;
  if (item.type === 'result') return `/results/${item.slug}`;
  if (item.type === 'admit_card') return `/admit-card/${item.slug}`;
  if (item.type === 'answer_key') return `/answer-key/${item.slug}`;
  if (item.type === 'exam') return `/exams/${item.slug}`;
  if (item.type === 'scholarship') return `/scholarships/${item.slug}`;
  if (item.type === 'syllabus') return `/syllabus/${item.slug}`;
  if (item.type === 'scheme') return `/schemes/${item.slug}`;
  return `/important-updates/${item.slug}`;
}

/**
 * Ranks all available candidate items for a given source item
 */
export function rankInternalCandidates(
  source: PublicJobItem,
  candidates: PublicJobItem[],
  minScore: number = 20
): InternalLinkCandidate[] {
  const scored: InternalLinkCandidate[] = [];

  for (const target of candidates) {
    if (target.id === source.id || target.status !== 'published') continue;

    const { score, reasons } = calculateRelationshipScore(source, target);
    if (score >= minScore) {
      scored.push({
        item: target,
        score,
        matchReasons: reasons,
        suggestedAnchor: target.post_name || target.title,
        targetUrl: getTargetUrl(target),
      });
    }
  }

  return scored.sort((a, b) => b.score - a.score);
}
