// src/lib/seo/types.ts
// Data Models & Interfaces for SEO, Audits, Sitemaps & Programmatic Pages

import type { ContentType } from '../types.ts';

export type RobotsDirective = 'index, follow' | 'noindex, follow' | 'noindex, nofollow' | 'index, nofollow';

export type SeoStatus = 'auto_generated' | 'manual_override' | 'needs_review';

export interface SeoMetadataRecord {
  id: string;
  content_item_id: string;
  meta_title: string | null;
  meta_description: string | null;
  canonical_url: string | null;
  robots: RobotsDirective;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  twitter_title: string | null;
  twitter_description: string | null;
  twitter_image: string | null;
  focus_topic: string | null;
  seo_status: SeoStatus;
  is_manual_override: number; // 0 or 1
  created_at: string;
  updated_at: string;
}

export interface RedirectRecord {
  id: string;
  source_path: string;
  destination_path: string;
  status_code: number;
  active: number;
  hit_count: number;
  last_accessed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProgrammaticPageRecord {
  id: string;
  page_type: 'qualification' | 'category' | 'state' | 'exam_hub';
  slug: string;
  title: string;
  heading: string;
  meta_description: string | null;
  intro_content: string | null;
  target_filter_json: string;
  min_content_threshold: number;
  is_indexable: number;
  created_at: string;
  updated_at: string;
}

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

export interface SeoHealthAuditResult {
  totalContentItems: number;
  totalIndexable: number;
  totalNoindex: number;
  orphanPages: { id: string; title: string; slug: string; type: ContentType }[];
  brokenInternalLinks: { sourceSlug: string; brokenUrl: string; reason: string }[];
  missingTitles: { id: string; slug: string }[];
  missingDescriptions: { id: string; slug: string }[];
  duplicateTitles: { title: string; count: number; slugs: string[] }[];
  thinProgrammaticPages: { slug: string; title: string; count: number; threshold: number }[];
  missingCanonicals: { id: string; slug: string }[];
  auditScore: number; // 0 - 100
  generatedAt: string;
}
