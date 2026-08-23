-- migrations/0010_multi_source_deduplication.sql
-- Multi-Source Deduplication, Canonical Content Engine & Source Authority Tracking

-- 1. Extend content_items with canonical and deduplication tracking columns
ALTER TABLE content_items ADD COLUMN canonical_source_id TEXT;
ALTER TABLE content_items ADD COLUMN canonical_source_url TEXT;
ALTER TABLE content_items ADD COLUMN duplicate_group_id TEXT;
ALTER TABLE content_items ADD COLUMN duplicate_status TEXT DEFAULT 'unique';
ALTER TABLE content_items ADD COLUMN canonical_confidence REAL DEFAULT 1.0;
ALTER TABLE content_items ADD COLUMN merged_at DATETIME;
ALTER TABLE content_items ADD COLUMN advertisement_number TEXT;
ALTER TABLE content_items ADD COLUMN notification_number TEXT;
ALTER TABLE content_items ADD COLUMN normalized_title TEXT;
ALTER TABLE content_items ADD COLUMN document_checksum TEXT;

-- 2. Multi-Source Reference Table
CREATE TABLE IF NOT EXISTS content_sources (
    id TEXT PRIMARY KEY,
    content_item_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
    source_url TEXT NOT NULL,
    source_title TEXT,
    source_type TEXT DEFAULT 'established_aggregator', -- 'official_government', 'government_publication', 'established_aggregator', 'discovery_source'
    source_priority INTEGER DEFAULT 50,               -- 100 for Official, 80 for Gazette, 60 for Aggregators, 30 for others
    source_published_at DATETIME,
    discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_checked_at DATETIME,
    content_hash TEXT,
    normalized_hash TEXT,
    official_source BOOLEAN DEFAULT 0,
    canonical_source BOOLEAN DEFAULT 0,
    active BOOLEAN DEFAULT 1,
    archived BOOLEAN DEFAULT 0,
    archive_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_content_sources_item_id ON content_sources(content_item_id);
CREATE INDEX IF NOT EXISTS idx_content_sources_url ON content_sources(source_url);
CREATE INDEX IF NOT EXISTS idx_content_sources_source_id ON content_sources(source_id);
CREATE INDEX IF NOT EXISTS idx_content_sources_hash ON content_sources(content_hash);
CREATE INDEX IF NOT EXISTS idx_content_sources_active ON content_sources(active);

-- 3. Duplicate Match & Review History Table
CREATE TABLE IF NOT EXISTS duplicate_matches (
    id TEXT PRIMARY KEY,
    canonical_item_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    duplicate_item_id TEXT REFERENCES content_items(id) ON DELETE SET NULL,
    source_page_id TEXT REFERENCES source_pages(id) ON DELETE SET NULL,
    confidence_score REAL NOT NULL,
    match_tier TEXT NOT NULL, -- 'EXACT', 'HIGH_CONFIDENCE', 'POSSIBLE', 'WEAK'
    matching_signals_json TEXT,
    conflicting_signals_json TEXT,
    status TEXT DEFAULT 'pending', -- 'auto_merged', 'pending', 'resolved_merged', 'resolved_separate', 'rejected'
    reviewed_by TEXT,
    reviewed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_duplicate_matches_canonical ON duplicate_matches(canonical_item_id);
CREATE INDEX IF NOT EXISTS idx_duplicate_matches_duplicate ON duplicate_matches(duplicate_item_id);
CREATE INDEX IF NOT EXISTS idx_duplicate_matches_status ON duplicate_matches(status);
CREATE INDEX IF NOT EXISTS idx_content_items_dup_group ON content_items(duplicate_group_id);
CREATE INDEX IF NOT EXISTS idx_content_items_dup_status ON content_items(duplicate_status);
CREATE INDEX IF NOT EXISTS idx_content_items_advt ON content_items(advertisement_number);
CREATE INDEX IF NOT EXISTS idx_content_items_notif ON content_items(notification_number);
