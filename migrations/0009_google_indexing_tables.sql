-- 0009_google_indexing_tables.sql
-- Cloudflare D1 Migration for Google Instant Indexing Logs & Status

CREATE TABLE IF NOT EXISTS google_indexing_logs (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    content_item_id TEXT REFERENCES content_items(id) ON DELETE SET NULL,
    notification_type TEXT NOT NULL DEFAULT 'URL_UPDATED', -- 'URL_UPDATED', 'URL_DELETED'
    status TEXT NOT NULL DEFAULT 'success', -- 'success', 'failed', 'queued'
    http_status INTEGER,
    response_json TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_indexing_url ON google_indexing_logs(url);
CREATE INDEX IF NOT EXISTS idx_indexing_created ON google_indexing_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_indexing_status ON google_indexing_logs(status);
