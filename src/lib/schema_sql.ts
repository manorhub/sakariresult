// src/lib/schema_sql.ts
// Embedded schema & seed SQL for automatic self-healing database initialization

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    source_type TEXT NOT NULL,
    category TEXT,
    priority INTEGER NOT NULL DEFAULT 3,
    trust_level INTEGER NOT NULL DEFAULT 3,
    crawl_frequency TEXT NOT NULL DEFAULT 'daily',
    parser_type TEXT NOT NULL DEFAULT 'standard',
    status TEXT NOT NULL DEFAULT 'active',
    robots_allowed INTEGER NOT NULL DEFAULT 1,
    last_checked_at TEXT,
    last_success_at TEXT,
    last_error TEXT,
    health_status TEXT NOT NULL DEFAULT 'healthy',
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    avg_response_time_ms INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    website TEXT,
    logo_r2_key TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS content_items (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    source_url TEXT,
    source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
    source_hash TEXT,
    published_at TEXT,
    ai_status TEXT DEFAULT 'pending',
    classification_confidence REAL DEFAULT 0.0,
    extraction_confidence REAL DEFAULT 0.0,
    verification_status TEXT DEFAULT 'unverified',
    quality_score INTEGER DEFAULT 0,
    auto_publish_eligible INTEGER DEFAULT 0,
    evidence_json TEXT,
    extracted_data_json TEXT,
    faq_json TEXT,
    article_content TEXT,
    update_summary TEXT,
    conflict_details_json TEXT,
    last_ai_processed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    content_item_id TEXT NOT NULL UNIQUE REFERENCES content_items(id) ON DELETE CASCADE,
    post_name TEXT NOT NULL,
    vacancy TEXT,
    qualification TEXT,
    age_limit TEXT,
    application_start TEXT,
    application_last_date TEXT,
    exam_date TEXT,
    application_fee TEXT,
    salary TEXT,
    selection_process TEXT,
    official_notification_url TEXT,
    official_apply_url TEXT,
    official_website_url TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS source_documents (
    id TEXT PRIMARY KEY,
    content_item_id TEXT REFERENCES content_items(id) ON DELETE SET NULL,
    source_page_id TEXT,
    source_url TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    checksum TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS seo_metadata (
    id TEXT PRIMARY KEY,
    content_item_id TEXT NOT NULL UNIQUE REFERENCES content_items(id) ON DELETE CASCADE,
    meta_title TEXT,
    meta_description TEXT,
    canonical_url TEXT,
    og_title TEXT,
    og_description TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'string',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Phase 2 Tables
CREATE TABLE IF NOT EXISTS source_pages (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    normalized_url TEXT NOT NULL,
    canonical_url TEXT,
    title TEXT,
    content_type TEXT DEFAULT 'html',
    fingerprint TEXT NOT NULL,
    last_content_hash TEXT NOT NULL,
    first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_status TEXT NOT NULL DEFAULT 'NEW',
    http_status INTEGER,
    r2_key TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crawl_logs (
    id TEXT PRIMARY KEY,
    source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    status TEXT NOT NULL DEFAULT 'running',
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

-- Phase 3 Tables
CREATE TABLE IF NOT EXISTS ai_generations (
    id TEXT PRIMARY KEY,
    content_item_id TEXT REFERENCES content_items(id) ON DELETE SET NULL,
    source_page_id TEXT REFERENCES source_pages(id) ON DELETE SET NULL,
    operation TEXT NOT NULL,
    model TEXT NOT NULL,
    request_id TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'success',
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS content_versions (
    id TEXT PRIMARY KEY,
    content_item_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    structured_data_json TEXT,
    seo_data_json TEXT,
    generated_by TEXT NOT NULL DEFAULT 'ai',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_prompts (
    id TEXT PRIMARY KEY,
    prompt_name TEXT NOT NULL UNIQUE,
    version INTEGER NOT NULL DEFAULT 1,
    prompt_text TEXT NOT NULL,
    system_prompt TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_content_items_slug ON content_items(slug);
CREATE INDEX IF NOT EXISTS idx_content_items_status ON content_items(status);
CREATE INDEX IF NOT EXISTS idx_content_items_category_id ON content_items(category_id);
CREATE INDEX IF NOT EXISTS idx_content_items_org_id ON content_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_content_items_type ON content_items(type);
CREATE INDEX IF NOT EXISTS idx_content_items_published_at ON content_items(published_at);
CREATE INDEX IF NOT EXISTS idx_content_items_source_id ON content_items(source_id);
CREATE INDEX IF NOT EXISTS idx_content_items_ai_status ON content_items(ai_status);
CREATE INDEX IF NOT EXISTS idx_content_items_ver_status ON content_items(verification_status);
CREATE INDEX IF NOT EXISTS idx_content_items_quality_score ON content_items(quality_score);
CREATE INDEX IF NOT EXISTS idx_content_items_auto_pub ON content_items(auto_publish_eligible);

CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_status ON categories(status);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);

CREATE INDEX IF NOT EXISTS idx_jobs_app_last_date ON jobs(application_last_date);
CREATE INDEX IF NOT EXISTS idx_jobs_content_item_id ON jobs(content_item_id);

CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(status);
CREATE INDEX IF NOT EXISTS idx_sources_priority ON sources(priority);
CREATE INDEX IF NOT EXISTS idx_sources_health ON sources(health_status);

CREATE INDEX IF NOT EXISTS idx_source_pages_source_id ON source_pages(source_id);
CREATE INDEX IF NOT EXISTS idx_source_pages_normalized_url ON source_pages(normalized_url);
CREATE INDEX IF NOT EXISTS idx_source_pages_fingerprint ON source_pages(fingerprint);
CREATE INDEX IF NOT EXISTS idx_source_pages_last_status ON source_pages(last_status);

CREATE INDEX IF NOT EXISTS idx_crawl_logs_source_id ON crawl_logs(source_id);
CREATE INDEX IF NOT EXISTS idx_crawl_logs_status ON crawl_logs(status);
CREATE INDEX IF NOT EXISTS idx_crawl_logs_started_at ON crawl_logs(started_at);
CREATE INDEX IF NOT EXISTS idx_crawl_logs_exec_id ON crawl_logs(execution_id);

CREATE INDEX IF NOT EXISTS idx_ai_gen_content_id ON ai_generations(content_item_id);
CREATE INDEX IF NOT EXISTS idx_ai_gen_operation ON ai_generations(operation);
CREATE INDEX IF NOT EXISTS idx_ai_gen_created_at ON ai_generations(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_gen_status ON ai_generations(status);

CREATE INDEX IF NOT EXISTS idx_content_versions_item_id ON content_versions(content_item_id);
CREATE INDEX IF NOT EXISTS idx_content_versions_ver ON content_versions(content_item_id, version_number);
`;

export const SEED_SQL = `
INSERT OR IGNORE INTO categories (id, name, slug, description, status, sort_order, created_at, updated_at) VALUES
('cat_gov_jobs', 'Government Jobs', 'government-jobs', 'Latest central and state government job vacancies, notifications, and recruitment updates across India.', 'active', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_results', 'Results', 'results', 'Check Sarkari exam results, scorecards, merit lists, and cut-off marks for competitive exams.', 'active', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_admit_cards', 'Admit Cards', 'admit-cards', 'Download hall tickets, call letters, and admit cards for upcoming government entrance and recruitment examinations.', 'active', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_answer_keys', 'Answer Keys', 'answer-keys', 'Official and provisional answer keys, question papers, and objection submission links.', 'active', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_exams', 'Exams', 'exams', 'Upcoming exam dates, examination schedules, time tables, and important alerts.', 'active', 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_scholarships', 'Scholarships', 'scholarships', 'National and state scholarship schemes, financial aid, eligibility criteria, and application dates.', 'active', 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_syllabus', 'Syllabus', 'syllabus', 'Detailed syllabus, exam pattern, marking schemes, and preparation guides for all major exams.', 'active', 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_schemes', 'Government Schemes', 'government-schemes', 'Central & State Government welfare initiatives, portals, eligibility, and citizen benefits.', 'active', 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_updates', 'Important Updates', 'important-updates', 'Latest recruitment press releases, circulars, date extensions, and administrative notices.', 'active', 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO settings (id, key, value, type, updated_at) VALUES
('set_site_name', 'site_name', 'Sarkari Info — Indian Govt Jobs & Results Portal', 'string', CURRENT_TIMESTAMP),
('set_site_desc', 'site_description', 'Fast, accurate, and verified updates for Indian Government Jobs, Exam Results, Admit Cards, and Answer Keys.', 'string', CURRENT_TIMESTAMP),
('set_contact_email', 'contact_email', 'support@sarkariinfo.org', 'string', CURRENT_TIMESTAMP),
('set_maintenance', 'maintenance_mode', 'false', 'boolean', CURRENT_TIMESTAMP),
('set_footer_disclaimer', 'footer_disclaimer', 'This website is an informational portal and is not affiliated with any government organization or entity. Always refer to official government notifications for verified details.', 'string', CURRENT_TIMESTAMP),
('set_ai_enabled', 'ai_enabled', 'true', 'boolean', CURRENT_TIMESTAMP),
('set_ai_model', 'ai_model', 'deepseek-chat', 'string', CURRENT_TIMESTAMP),
('set_ai_temperature', 'ai_temperature', '0.2', 'number', CURRENT_TIMESTAMP),
('set_ai_max_tokens', 'ai_max_tokens', '4096', 'number', CURRENT_TIMESTAMP),
('set_ai_timeout_ms', 'ai_timeout_ms', '30000', 'number', CURRENT_TIMESTAMP),
('set_ai_retry_count', 'ai_retry_count', '2', 'number', CURRENT_TIMESTAMP),
('set_ai_daily_limit', 'ai_daily_limit', '500', 'number', CURRENT_TIMESTAMP),
('set_ai_monthly_limit', 'ai_monthly_limit', '15000', 'number', CURRENT_TIMESTAMP),
('set_ai_auto_publish_threshold', 'ai_auto_publish_threshold', '90', 'number', CURRENT_TIMESTAMP),
('set_ai_min_review_threshold', 'ai_min_review_threshold', '75', 'number', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO admins (id, email, password_hash, salt, name, role, status, created_at, updated_at) VALUES
('adm_default_01', 'admin@sarkariinfo.org', 'c774b23879bb772e1fc9fc7a19668f3ee6a266bca13803311ad5d6006324282c', '6f8e7d2a1b9c3e4f', 'Super Administrator', 'superadmin', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
`;
