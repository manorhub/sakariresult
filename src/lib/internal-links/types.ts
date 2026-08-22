// src/lib/internal-links/types.ts
// Internal Linking Engine Type Definitions

import type { PublicJobItem } from '../public_queries.ts';

export interface InternalLinkCandidate {
  item: PublicJobItem;
  score: number;
  matchReasons: string[];
  suggestedAnchor: string;
  targetUrl: string;
}

export interface ContextualLinkOption {
  text: string;
  url: string;
  title: string;
}

export interface InternalLinkRules {
  maxBodyLinks: number;
  maxRelatedLinks: number;
  minScoreThreshold: number;
  avoidSelfLinks: boolean;
  maxLinksPerDomain: number;
}

export const DEFAULT_LINK_RULES: InternalLinkRules = {
  maxBodyLinks: 3,
  maxRelatedLinks: 6,
  minScoreThreshold: 20,
  avoidSelfLinks: true,
  maxLinksPerDomain: 1,
};
