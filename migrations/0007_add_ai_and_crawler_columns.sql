-- 0007_add_ai_and_crawler_columns.sql
-- Cloudflare D1 Migration: Add AI pipeline & Crawler health tracking columns

-- 1. Add AI fields to content_items
ALTER TABLE content_items ADD COLUMN ai_status TEXT DEFAULT 'pending';
ALTER TABLE content_items ADD COLUMN classification_confidence REAL DEFAULT 0.0;
ALTER TABLE content_items ADD COLUMN extraction_confidence REAL DEFAULT 0.0;
ALTER TABLE content_items ADD COLUMN verification_status TEXT DEFAULT 'unverified';
ALTER TABLE content_items ADD COLUMN quality_score INTEGER DEFAULT 0;
ALTER TABLE content_items ADD COLUMN auto_publish_eligible INTEGER DEFAULT 0;
ALTER TABLE content_items ADD COLUMN evidence_json TEXT;
ALTER TABLE content_items ADD COLUMN extracted_data_json TEXT;
ALTER TABLE content_items ADD COLUMN faq_json TEXT;
ALTER TABLE content_items ADD COLUMN article_content TEXT;
ALTER TABLE content_items ADD COLUMN update_summary TEXT;
ALTER TABLE content_items ADD COLUMN conflict_details_json TEXT;
ALTER TABLE content_items ADD COLUMN last_ai_processed_at TEXT;

-- 2. Add health tracking fields to sources
ALTER TABLE sources ADD COLUMN health_status TEXT DEFAULT 'healthy';
ALTER TABLE sources ADD COLUMN consecutive_failures INTEGER DEFAULT 0;
ALTER TABLE sources ADD COLUMN avg_response_time_ms INTEGER DEFAULT 0;
