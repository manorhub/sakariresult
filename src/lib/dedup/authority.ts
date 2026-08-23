// src/lib/dedup/authority.ts
// Deterministic Source Authority Ranking & Canonical Upgrade Algorithm

import type { SourceType, SourceAuthorityConfig } from './types.ts';

export const DEFAULT_AUTHORITY_CONFIG: SourceAuthorityConfig = {
  officialGovernmentBase: 100,
  governmentPublicationBase: 80,
  establishedAggregatorBase: 60,
  discoverySourceBase: 30,
  hasOfficialPdfBonus: 30,
  hasOfficialApplyUrlBonus: 20,
  recentUpdateBonus: 10,
};

/**
 * Detect Source Type from URL or domain
 */
export function detectSourceType(url: string): SourceType {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.endsWith('.gov.in') || host.endsWith('.nic.in') || host.endsWith('.ac.in') || host.includes('upsc.gov') || host.includes('ssc.nic') || host.includes('rrbcdg.gov')) {
      return 'official_government';
    }
    if (host.includes('employmentnews') || host.includes('ncs.gov') || host.includes('pib.gov')) {
      return 'government_publication';
    }
    if (host.includes('sarkari') || host.includes('result') || host.includes('freejobalert') || host.includes('jagranjosh')) {
      return 'established_aggregator';
    }
    return 'discovery_source';
  } catch {
    return 'discovery_source';
  }
}

/**
 * Compute total authority score for a source entry
 */
export function calculateSourceAuthorityScore(
  sourceType: SourceType,
  metadata: {
    hasOfficialPdf?: boolean;
    hasOfficialApplyUrl?: boolean;
    isRecent?: boolean;
  } = {},
  config: SourceAuthorityConfig = DEFAULT_AUTHORITY_CONFIG
): number {
  let score = 0;

  // Base tier score
  switch (sourceType) {
    case 'official_government':
      score += config.officialGovernmentBase;
      break;
    case 'government_publication':
      score += config.governmentPublicationBase;
      break;
    case 'established_aggregator':
      score += config.establishedAggregatorBase;
      break;
    case 'discovery_source':
    default:
      score += config.discoverySourceBase;
      break;
  }

  // Bonus signals
  if (metadata.hasOfficialPdf) {
    score += config.hasOfficialPdfBonus;
  }
  if (metadata.hasOfficialApplyUrl) {
    score += config.hasOfficialApplyUrlBonus;
  }
  if (metadata.isRecent) {
    score += config.recentUpdateBonus;
  }

  return score;
}

/**
 * Compare two sources and determine if Candidate Source B should upgrade/replace Current Source A as canonical
 */
export function shouldUpgradeCanonicalSource(
  currentSource: { type: SourceType; priority: number; hasPdf?: boolean; url: string },
  newSource: { type: SourceType; priority: number; hasPdf?: boolean; url: string },
  config: SourceAuthorityConfig = DEFAULT_AUTHORITY_CONFIG
): boolean {
  const currentScore = calculateSourceAuthorityScore(currentSource.type, {
    hasOfficialPdf: currentSource.hasPdf,
  }, config);

  const newScore = calculateSourceAuthorityScore(newSource.type, {
    hasOfficialPdf: newSource.hasPdf,
  }, config);

  // New source wins if score is strictly higher
  return newScore > currentScore;
}
