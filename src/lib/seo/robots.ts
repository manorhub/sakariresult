// src/lib/seo/robots.ts
// Robots Meta Directive Engine to prevent search index bloat and thin content penalties

import type { RobotsDirective } from './types.ts';

export interface RobotsEvaluationInput {
  pathname: string;
  searchParams?: Record<string, string | number | undefined>;
  itemStatus?: string;
  isPreview?: boolean;
  totalResults?: number;
  minContentThreshold?: number;
  explicitRobots?: string | null;
}

/**
 * Evaluates whether a page should be indexed by search engines
 */
export function evaluateRobotsDirective(input: RobotsEvaluationInput): RobotsDirective {
  // 1. Explicit override from database or admin
  if (input.explicitRobots && input.explicitRobots.trim().length > 0) {
    const trimmed = input.explicitRobots.trim().toLowerCase();
    if (trimmed.includes('noindex')) {
      return trimmed.includes('nofollow') ? 'noindex, nofollow' : 'noindex, follow';
    }
    return 'index, follow';
  }

  // 2. Admin Preview Mode or Unpublished Content
  if (input.isPreview || (input.itemStatus && input.itemStatus !== 'published')) {
    return 'noindex, follow';
  }

  // 3. Admin routes and internal endpoints
  if (input.pathname.startsWith('/admin') || input.pathname.startsWith('/api')) {
    return 'noindex, nofollow';
  }

  // 4. 404 Page
  if (input.pathname === '/404' || input.pathname.startsWith('/404')) {
    return 'noindex, nofollow';
  }

  // 5. Search Results with user queries
  const params = input.searchParams || {};
  if (input.pathname === '/search' && params.q && String(params.q).trim().length > 0) {
    return 'noindex, follow';
  }

  // 6. Multi-parameter filter bloat (3 or more active filter parameters)
  const filterKeys = Object.keys(params).filter(k => k !== 'page' && params[k] !== undefined && params[k] !== '' && params[k] !== 'all');
  if (filterKeys.length >= 3) {
    return 'noindex, follow';
  }

  // 7. Empty or Thin Result Sets
  if (typeof input.totalResults === 'number') {
    const threshold = input.minContentThreshold ?? 1;
    if (input.totalResults < threshold) {
      return 'noindex, follow';
    }
  }

  // Default: Clean, high-value indexable page
  return 'index, follow';
}
