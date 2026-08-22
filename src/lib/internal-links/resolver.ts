// src/lib/internal-links/resolver.ts
// Resolver for contextual inline links and related widget links

import type { DbClient } from '../db.ts';
import type { PublicJobItem } from '../public_queries.ts';
import type { InternalLinkCandidate, InternalLinkRules } from './types.ts';
import { DEFAULT_LINK_RULES } from './types.ts';
import { rankInternalCandidates } from './matcher.ts';

/**
 * Resolves optimal internal links for a content item using D1
 */
export async function resolveInternalLinks(
  db: DbClient,
  sourceItem: PublicJobItem,
  rules: InternalLinkRules = DEFAULT_LINK_RULES
): Promise<{
  bodyCandidates: InternalLinkCandidate[];
  relatedWidgetCandidates: InternalLinkCandidate[];
}> {
  // Fetch published candidate content items from D1
  const candidates = (await db.query<PublicJobItem>(`
    SELECT ci.*, j.post_name, j.vacancy as total_vacancies, j.qualification, j.application_last_date,
           c.name as category_name, o.name as organization_name
    FROM content_items ci
    LEFT JOIN jobs j ON j.content_item_id = ci.id
    LEFT JOIN categories c ON c.id = ci.category_id
    LEFT JOIN organizations o ON o.id = ci.organization_id
    WHERE ci.status = 'published' AND ci.id != ?
    ORDER BY ci.published_at DESC
    LIMIT 60
  `, [sourceItem.id])).results;

  const ranked = rankInternalCandidates(sourceItem, candidates, rules.minScoreThreshold);

  return {
    bodyCandidates: ranked.slice(0, rules.maxBodyLinks),
    relatedWidgetCandidates: ranked.slice(0, rules.maxRelatedLinks),
  };
}
