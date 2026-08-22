// src/lib/ai/types.ts
// Comprehensive TypeScript definitions for Phase 3 DeepSeek AI Engine

import type { ContentType, AIPipelineStatus, VerificationStatus, PublishEligibility, AIOperation } from '../types.ts';
export type { AIPipelineStatus, VerificationStatus, PublishEligibility, AIOperation };

export type ClassificationType = 
  | 'government_job'
  | 'result'
  | 'admit_card'
  | 'answer_key'
  | 'exam'
  | 'scholarship'
  | 'syllabus'
  | 'scheme'
  | 'important_update'
  | 'other';

export interface ClassificationResult {
  type: ClassificationType;
  confidence: number;
  reason: string;
  mappedContentType: ContentType;
}

export interface SourceEvidenceItem {
  field: string;
  value: string | number | null;
  evidence: string;
  location?: string;
}

export interface JobExtractionData {
  organization: string | null;
  recruitment_name: string | null;
  post_name: string | null;
  advertisement_number: string | null;
  vacancy: string | number | null;
  qualification: string | null;
  age_min: number | null;
  age_max: number | null;
  age_relaxation: string | null;
  application_start: string | null;
  application_last_date: string | null;
  exam_date: string | null;
  application_fee: string | null;
  salary: string | null;
  selection_process: string | null;
  job_location: string | null;
  official_notification_url: string | null;
  official_apply_url: string | null;
  official_website_url: string | null;
  evidence: SourceEvidenceItem[];
  extraction_confidence: number;
}

export interface ResultExtractionData {
  organization: string | null;
  exam_name: string | null;
  result_date: string | null;
  exam_date: string | null;
  result_url: string | null;
  merit_list_url: string | null;
  cutoff_url: string | null;
  official_website_url: string | null;
  evidence: SourceEvidenceItem[];
  extraction_confidence: number;
}

export interface AdmitCardExtractionData {
  organization: string | null;
  exam_name: string | null;
  admit_card_date: string | null;
  exam_date: string | null;
  download_url: string | null;
  official_website_url: string | null;
  evidence: SourceEvidenceItem[];
  extraction_confidence: number;
}

export interface AnswerKeyExtractionData {
  organization: string | null;
  exam_name: string | null;
  answer_key_date: string | null;
  objection_start: string | null;
  objection_end: string | null;
  answer_key_url: string | null;
  official_website_url: string | null;
  evidence: SourceEvidenceItem[];
  extraction_confidence: number;
}

export interface GenericExtractionData {
  organization: string | null;
  title: string | null;
  date: string | null;
  summary: string | null;
  official_url: string | null;
  evidence: SourceEvidenceItem[];
  extraction_confidence: number;
}

export type ExtractedData = 
  | JobExtractionData 
  | ResultExtractionData 
  | AdmitCardExtractionData 
  | AnswerKeyExtractionData 
  | GenericExtractionData;

export interface LinkValidationResult {
  url: string;
  field: string;
  isValidFormat: boolean;
  isAllowedProtocol: boolean;
  domainMatch: boolean;
  domainName: string;
  status: 'valid' | 'suspicious' | 'broken' | 'unverified';
  flagReason?: string;
}

export interface VerificationConflict {
  field: string;
  extractedValue: string | number | null;
  sourceValue: string | number | null;
  snippet: string;
  severity: 'CRITICAL' | 'WARNING';
  reason: string;
}

export interface VerificationResult {
  isVerified: boolean;
  hasCriticalConflicts: boolean;
  conflicts: VerificationConflict[];
  confidence: number;
  linksValidated: LinkValidationResult[];
  checkedFieldsCount: number;
}

export interface QualityScoreBreakdown {
  sourceTrustScore: number;       // max 30
  requiredFieldsScore: number;    // max 20
  evidenceCoverageScore: number;  // max 20
  linkVerificationScore: number;  // max 15
  conflictFreeScore: number;      // max 15
  totalScore: number;             // max 100
  eligibility: PublishEligibility;
  reasons: string[];
}

export interface GeneratedArticle {
  title: string;
  overview: string;
  bodyMarkdown: string;
  sections: {
    overview: string;
    importantDates: string;
    vacancyDetails: string;
    eligibility: string;
    ageLimit: string;
    applicationFee: string;
    salary: string;
    selectionProcess: string;
    howToApply: string;
    importantLinks: string;
    faq: string;
    disclaimer: string;
  };
}

export interface GeneratedSEO {
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  ogTitle: string;
  ogDescription: string;
  canonicalUrl?: string;
}

export interface FAQItem {
  question: string;
  answer: string;
  verifiedFromField: string;
}

export interface UpdateSummaryResult {
  hasUpdates: boolean;
  summary: string | null;
  changes: Array<{
    field: string;
    oldValue: any;
    newValue: any;
    description: string;
  }>;
}

export interface DeepSeekUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
}

export interface DeepSeekClientOptions {
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  retryCount?: number;
  endpoint?: string;
  mockMode?: boolean;
}

export interface PipelineOptions {
  forceReprocess?: boolean;
  mockAIEngine?: boolean;
  customApiKey?: string;
}

export interface PipelineExecutionResult {
  success: boolean;
  contentItemId: string;
  sourcePageId?: string;
  status: AIPipelineStatus;
  classification?: ClassificationResult;
  extraction?: ExtractedData;
  verification?: VerificationResult;
  quality?: QualityScoreBreakdown;
  article?: GeneratedArticle;
  seo?: GeneratedSEO;
  faqs?: FAQItem[];
  updateSummary?: UpdateSummaryResult;
  publishEligibility: PublishEligibility;
  totalTokensUsed: number;
  durationMs: number;
  errors: string[];
}
