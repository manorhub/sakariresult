// src/lib/internal-links/scorer.ts
// Deterministic Scoring Algorithm for Contextual Internal Linking

import type { PublicJobItem } from '../public_queries.ts';

export interface ScoreBreakdown {
  score: number;
  reasons: string[];
}

/**
 * Calculates a deterministic relationship score between two content items
 */
export function calculateRelationshipScore(
  source: PublicJobItem,
  target: PublicJobItem
): ScoreBreakdown {
  if (source.id === target.id) {
    return { score: 0, reasons: ['Self'] };
  }

  let score = 0;
  const reasons: string[] = [];

  // 1. Same Organization: +40
  if (source.organization_id && target.organization_id && source.organization_id === target.organization_id) {
    score += 40;
    reasons.push('Same Organization (+40)');
  }

  // 2. Exam / Post Name Match: +35
  if (source.post_name && target.post_name) {
    const srcPost = source.post_name.toLowerCase().trim();
    const tgtPost = target.post_name.toLowerCase().trim();
    if (srcPost === tgtPost || srcPost.includes(tgtPost) || tgtPost.includes(srcPost)) {
      score += 35;
      reasons.push('Same Exam/Post (+35)');
    }
  }

  // 3. Same Category: +25
  if (source.category_id && target.category_id && source.category_id === target.category_id) {
    score += 25;
    reasons.push('Same Category (+25)');
  }

  // 4. Same Qualification: +15
  if (source.qualification && target.qualification) {
    const srcQ = source.qualification.toLowerCase();
    const tgtQ = target.qualification.toLowerCase();
    if (
      (srcQ.includes('10th') && tgtQ.includes('10th')) ||
      (srcQ.includes('12th') && tgtQ.includes('12th')) ||
      (srcQ.includes('graduate') && tgtQ.includes('graduate')) ||
      (srcQ.includes('b.tech') && tgtQ.includes('b.tech'))
    ) {
      score += 15;
      reasons.push('Same Qualification (+15)');
    }
  }

  // 5. Related Content Type (Job <-> Result/Admit Card/Answer Key): +15
  const isDirectLifecyclePair = 
    (source.type === 'job' && ['result', 'admit_card', 'answer_key'].includes(target.type)) ||
    (target.type === 'job' && ['result', 'admit_card', 'answer_key'].includes(source.type));
  
  if (isDirectLifecyclePair) {
    score += 15;
    reasons.push('Direct Lifecycle Relation (+15)');
  }

  // 6. Recency (within 14 days): +5
  if (target.published_at) {
    const pubTime = new Date(target.published_at).getTime();
    const now = Date.now();
    const diffDays = (now - pubTime) / (1000 * 60 * 60 * 24);
    if (diffDays >= 0 && diffDays <= 14) {
      score += 5;
      reasons.push('Recent Publication (+5)');
    }
  }

  return { score, reasons };
}
