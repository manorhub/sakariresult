-- 0002_phase2_crawler_tables.sql
-- Cloudflare D1 Migration for Phase 2: Crawler, Source Pages & Change Detection

-- 1. Source Pages Table
CREATE TABLE IF NOT EXISTS source_pages (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    normalized_url TEXT NOT NULL,
    canonical_url TEXT,
    title TEXT,
    content_type TEXT DEFAULT 'html', -- 'html', 'pdf', 'json', 'xml', 'rss'
    fingerprint TEXT NOT NULL,
    last_content_hash TEXT NOT NULL,
    first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_status TEXT NOT NULL DEFAULT 'NEW', -- 'NEW', 'UPDATED', 'UNCHANGED', 'REMOVED', 'ERROR'
    http_status INTEGER,
    r2_key TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Crawl Logs Table
CREATE TABLE IF NOT EXISTS crawl_logs (
    id TEXT PRIMARY KEY,
    source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    status TEXT NOT NULL DEFAULT 'running', -- 'running', 'completed', 'partial', 'failed'
    urls_discovered INTEGER NOT NULL DEFAULT 0,
    urls_processed INTEGER NOT NULL DEFAULT 0,
    new_items INTEGER NOT NULL DEFAULT 0,
    updated_items INTEGER NOT NULL DEFAULT 0,
    unchanged_items INTEGER NOT NULL DEFAULT 0,
    errors INTEGER NOT NULL DEFAULT 0,
    documents_downloaded INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    execution_id TEXT NOT NULL
);

-- 3. Update Sources table columns if not present
-- Add health tracking columns (safely ignored if already exists or added via schema)
CREATE INDEX IF NOT EXISTS idx_source_pages_source_id ON source_pages(source_id);
CREATE INDEX IF NOT EXISTS idx_source_pages_normalized_url ON source_pages(normalized_url);
CREATE INDEX IF NOT EXISTS idx_source_pages_fingerprint ON source_pages(fingerprint);
CREATE INDEX IF NOT EXISTS idx_source_pages_last_status ON source_pages(last_status);

CREATE INDEX IF NOT EXISTS idx_crawl_logs_source_id ON crawl_logs(source_id);
CREATE INDEX IF NOT EXISTS idx_crawl_logs_status ON crawl_logs(status);
CREATE INDEX IF NOT EXISTS idx_crawl_logs_started_at ON crawl_logs(started_at);
CREATE INDEX IF NOT EXISTS idx_crawl_logs_exec_id ON crawl_logs(execution_id);
