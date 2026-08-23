// src/lib/dedup/types.ts
// Multi-Source Deduplication & Canonical Content Engine Types

export type SourceType =
  | 'official_government'
  | 'government_publication'
  | 'established_aggregator'
  | 'discovery_source';

export type DuplicateStatus =
  | 'unique'
  | 'candidate'
  | 'duplicate'
  | 'canonical'
  | 'merged'
  | 'archived'
  | 'review_required';

export type MatchTier = 'EXACT' | 'HIGH_CONFIDENCE' | 'POSSIBLE' | 'WEAK';

export interface StructuredIdentity {
  organization: string | null;
  normalized_organization: string | null;
  recruitment_name: string | null;
  normalized_recruitment_name: string | null;
  post_name: string | null;
  normalized_post_name: string | null;
  year: number | null;
  content_type: string; // 'job', 'result', 'admit_card', 'answer_key', etc.
  advertisement_number: string | null;
  notification_number: string | null;
  vacancy: number | null;
  application_start: string | null;
  application_end: string | null;
  exam_date: string | null;
  official_url: string | null;
  official_pdf_url: string | null;
  document_checksum: string | null;
  raw_title: string;
  normalized_title: string;
}

export interface ContentSourceRecord {
  id: string;
  content_item_id: string;
  source_id?: string | null;
  source_url: string;
  source_title?: string | null;
  source_type: SourceType;
  source_priority: number;
  source_published_at?: string | null;
  discovered_at?: string;
  last_checked_at?: string | null;
  content_hash?: string | null;
  normalized_hash?: string | null;
  official_source: boolean;
  canonical_source: boolean;
  active: boolean;
  archived: boolean;
  archive_reason?: string | null;
}

export interface MatchingSignals {
  exact_advt_number: boolean;
  exact_notif_number: boolean;
  exact_official_url: boolean;
  exact_pdf_checksum: boolean;
  same_org_and_exam: boolean;
  same_year: boolean;
  same_content_type: boolean;
  title_similarity_score: number;
  date_match: boolean;
  vacancy_match: boolean;
  different_stage: boolean; // e.g. Job vs Result -> MUST NOT MERGE
  different_year: boolean;  // e.g. 2025 vs 2026 -> MUST NOT MERGE
  different_recruitment: boolean; // e.g. NTPC vs Group D -> MUST NOT MERGE
}

export interface DuplicateDetectionResult {
  isDuplicate: boolean;
  confidenceScore: number; // 0 - 100
  tier: MatchTier;
  candidateItemId?: string | null;
  candidateItemTitle?: string | null;
  duplicateGroupId?: string | null;
  status: DuplicateStatus;
  matchingSignals: MatchingSignals;
  conflictingFields: string[];
  recommendedAction: 'link_to_canonical' | 'upgrade_canonical' | 'create_unique' | 'review_required' | 'link_related_stage';
  explanation: string;
}

export interface SourceAuthorityConfig {
  officialGovernmentBase: number;       // default: 100
  governmentPublicationBase: number;   // default: 80
  establishedAggregatorBase: number;   // default: 60
  discoverySourceBase: number;         // default: 30
  hasOfficialPdfBonus: number;         // default: 30
  hasOfficialApplyUrlBonus: number;    // default: 20
  recentUpdateBonus: number;           // default: 10
}

export interface MergeOptions {
  canonicalItemId: string;
  duplicateItemId: string;
  preferredFields?: Record<string, 'canonical' | 'duplicate'>;
  createRedirect?: boolean;
  adminUserId?: string;
  notes?: string;
}
