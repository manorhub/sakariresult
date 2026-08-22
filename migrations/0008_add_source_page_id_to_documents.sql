-- 0008_add_source_page_id_to_documents.sql
-- Cloudflare D1 Migration: Add source_page_id and mime_type to source_documents

ALTER TABLE source_documents ADD COLUMN source_page_id TEXT;
ALTER TABLE source_documents ADD COLUMN mime_type TEXT;

CREATE INDEX IF NOT EXISTS idx_source_documents_page_id ON source_documents(source_page_id);
