-- 0003_phase3_ai_engine.sql
-- Cloudflare D1 Migration for Phase 3: DeepSeek AI Engine, Verification & Content Generation

-- 1. AI Generations Tracking Table
CREATE TABLE IF NOT EXISTS ai_generations (
    id TEXT PRIMARY KEY,
    content_item_id TEXT REFERENCES content_items(id) ON DELETE SET NULL,
    source_page_id TEXT REFERENCES source_pages(id) ON DELETE SET NULL,
    operation TEXT NOT NULL, -- 'classification', 'extraction', 'verification', 'article_generation', 'seo_generation', 'faq_generation', 'update_summary'
    model TEXT NOT NULL,
    request_id TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'success', -- 'success', 'failed', 'rate_limited', 'conflict_detected'
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Content Versions Table
CREATE TABLE IF NOT EXISTS content_versions (
    id TEXT PRIMARY KEY,
    content_item_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    structured_data_json TEXT,
    seo_data_json TEXT,
    generated_by TEXT NOT NULL DEFAULT 'ai', -- 'ai', 'manual_edit', 'system_update'
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. AI Prompts Manager Table
CREATE TABLE IF NOT EXISTS ai_prompts (
    id TEXT PRIMARY KEY,
    prompt_name TEXT NOT NULL UNIQUE, -- 'classification', 'extraction', 'verification', 'article_generation', 'seo_generation', 'faq_generation', 'update_summary'
    version INTEGER NOT NULL DEFAULT 1,
    prompt_text TEXT NOT NULL,
    system_prompt TEXT,
    is_active INTEGER NOT NULL DEFAULT 1, -- 1: active, 0: disabled
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Indexes for Phase 3 queries
CREATE INDEX IF NOT EXISTS idx_ai_gen_content_id ON ai_generations(content_item_id);
CREATE INDEX IF NOT EXISTS idx_ai_gen_operation ON ai_generations(operation);
CREATE INDEX IF NOT EXISTS idx_ai_gen_created_at ON ai_generations(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_gen_status ON ai_generations(status);

CREATE INDEX IF NOT EXISTS idx_content_versions_item_id ON content_versions(content_item_id);
CREATE INDEX IF NOT EXISTS idx_content_versions_ver ON content_versions(content_item_id, version_number);
