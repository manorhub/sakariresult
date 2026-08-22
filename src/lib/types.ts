// src/lib/types.ts

export type ContentType = 
  | 'job'
  | 'result'
  | 'admit_card'
  | 'answer_key'
  | 'exam'
  | 'scholarship'
  | 'syllabus'
  | 'scheme'
  | 'update'
  | 'important_update';

export type ContentStatus = 'draft' | 'review' | 'published' | 'archived';
export type AdminRole = 'superadmin' | 'admin' | 'editor';
export type AdminStatus = 'active' | 'inactive';
export type SourceType = 'API' | 'RSS' | 'XML' | 'HTML' | 'PDF' | 'JSON' | 'Sitemap' | 'Manual URL';
export type CrawlFrequency = '10m' | '15m' | '30m' | '1h' | '3h' | '6h' | '12h' | 'daily' | 'hourly' | 'weekly' | 'manual';
export type EntityStatus = 'active' | 'paused' | 'disabled' | 'inactive';
export type HealthStatus = 'healthy' | 'warning' | 'failed';
export type PageStatus = 'NEW' | 'UPDATED' | 'UNCHANGED' | 'REMOVED' | 'ERROR';
export type CrawlLogStatus = 'running' | 'completed' | 'partial' | 'failed';

// Phase 3 AI Pipeline Enums & Statuses
export type AIPipelineStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'verification_required';
export type VerificationStatus = 'unverified' | 'verified' | 'conflict_detected' | 'manual_override';
export type AIOperation = 
  | 'classification'
  | 'extraction'
  | 'verification'
  | 'article_generation'
  | 'seo_generation'
  | 'faq_generation'
  | 'update_summary';

export type PublishEligibility = 'auto_publish_eligible' | 'review_required' | 'rejected';

export interface AdminUser {
  id: string;
  email: string;
  password_hash: string;
  salt: string;
  name: string;
  role: AdminRole;
  status: AdminStatus;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface AdminSession {
  adminId: string;
  email: string;
  name: string;
  role: AdminRole;
  expiresAt: number;
}

export interface Source {
  id: string;
  name: string;
  base_url: string;
  source_type: SourceType;
  category: string | null;
  priority: number; // 1 - 5
  trust_level: number; // 1 - 5
  crawl_frequency: CrawlFrequency;
  parser_type: string;
  status: EntityStatus;
  robots_allowed: number;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  health_status?: HealthStatus;
  consecutive_failures?: number;
  avg_response_time_ms?: number;
  created_at: string;
  updated_at: string;

  // Joined / aggregated metrics
  pages_discovered?: number;
  pages_changed?: number;
  crawl_count?: number;
}

export interface SourcePage {
  id: string;
  source_id: string;
  url: string;
  normalized_url: string;
  canonical_url: string | null;
  title: string | null;
  content_type: 'html' | 'pdf' | 'json' | 'xml' | 'rss';
  fingerprint: string;
  last_content_hash: string;
  first_seen_at: string;
  last_seen_at: string;
  last_changed_at: string;
  last_status: PageStatus;
  http_status: number | null;
  r2_key: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrawlLog {
  id: string;
  source_id: string | null;
  started_at: string;
  completed_at: string | null;
  status: CrawlLogStatus;
  urls_discovered: number;
  urls_processed: number;
  new_items: number;
  updated_items: number;
  unchanged_items: number;
  errors: number;
  documents_downloaded: number;
  error_message: string | null;
  execution_id: string;

  // Joined fields
  source_name?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: 'active' | 'inactive';
  sort_order: number;
  created_at: string;
  updated_at: string;
  content_count?: number;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  logo_r2_key: string | null;
  description: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
  content_count?: number;
}

export interface ContentItem {
  id: string;
  type: ContentType;
  title: string;
  slug: string;
  organization_id: string | null;
  category_id: string | null;
  status: ContentStatus;
  source_url: string | null;
  source_id: string | null;
  source_hash: string | null;
  published_at: string | null;
  
  // Phase 3 AI Pipeline Fields
  ai_status?: AIPipelineStatus;
  classification_confidence?: number;
  extraction_confidence?: number;
  verification_status?: VerificationStatus;
  quality_score?: number;
  auto_publish_eligible?: number; // 1 or 0
  evidence_json?: string | null;
  extracted_data_json?: string | null;
  faq_json?: string | null;
  article_content?: string | null;
  update_summary?: string | null;
  conflict_details_json?: string | null;
  last_ai_processed_at?: string | null;

  created_at: string;
  updated_at: string;

  // Joined fields
  organization_name?: string;
  category_name?: string;
  job_details?: JobDetails | null;
  seo?: SeoMetadata | null;
}

export interface JobDetails {
  id: string;
  content_item_id: string;
  post_name: string;
  vacancy: string | null;
  qualification: string | null;
  age_limit: string | null;
  application_start: string | null;
  application_last_date: string | null;
  exam_date: string | null;
  application_fee: string | null;
  salary: string | null;
  selection_process: string | null;
  official_notification_url: string | null;
  official_apply_url: string | null;
  official_website_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SourceDocument {
  id: string;
  content_item_id: string | null;
  source_page_id?: string | null;
  source_url: string;
  url?: string;
  r2_key: string;
  file_type: string;
  file_size: number;
  mime_type?: string;
  checksum: string | null;
  created_at: string;
}

export interface SeoMetadata {
  id: string;
  content_item_id: string;
  meta_title: string | null;
  meta_description: string | null;
  canonical_url: string | null;
  og_title: string | null;
  og_description: string | null;
  created_at: string;
  updated_at: string;
}

export interface SettingItem {
  id: string;
  key: string;
  value: string;
  type: 'string' | 'json' | 'boolean' | 'number';
  updated_at: string;
}

// Phase 3 Tables & Entities
export interface AIGeneration {
  id: string;
  content_item_id: string | null;
  source_page_id: string | null;
  operation: AIOperation;
  model: string;
  request_id: string | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  duration_ms: number;
  status: 'success' | 'failed' | 'rate_limited' | 'conflict_detected';
  error_message: string | null;
  created_at: string;
}

export interface ContentVersion {
  id: string;
  content_item_id: string;
  version_number: number;
  title: string;
  body: string | null;
  structured_data_json: string | null;
  seo_data_json: string | null;
  generated_by: string;
  created_at: string;
}

export interface AIPrompt {
  id: string;
  prompt_name: string;
  version: number;
  prompt_text: string;
  system_prompt: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  totalJobs: number;
  totalResults: number;
  totalAdmitCards: number;
  totalAnswerKeys: number;
  totalDrafts: number;
  totalPublished: number;
  activeSources: number;
  crawlErrors: number;
}

export interface AutomationStats {
  cronStatus: 'active' | 'idle' | 'warning' | 'error';
  lastCronExecution: string | null;
  sourcesDue: number;
  sourcesCheckedToday: number;
  newPagesToday: number;
  updatedPagesToday: number;
  crawlErrorsToday: number;
  documentsDownloadedToday: number;
}

export interface AIStats {
  requestsToday: number;
  requestsMonth: number;
  tokensToday: number;
  tokensMonth: number;
  successCount: number;
  failedCount: number;
  conflictCount: number;
  avgDurationMs: number;
  pendingReviewCount: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}
