-- 0000_initial_schema.sql
-- Cloudflare D1 Migration for Indian Government Jobs & Results Information Platform

-- 1. Admins Table
CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin', -- 'superadmin', 'admin', 'editor'
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'inactive'
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TEXT
);

-- 2. Sources Table
CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    source_type TEXT NOT NULL, -- 'API', 'RSS', 'XML', 'HTML', 'PDF', 'JSON', 'Sitemap', 'Manual URL'
    category TEXT,
    priority INTEGER NOT NULL DEFAULT 3, -- 1 (highest) to 5 (lowest)
    trust_level INTEGER NOT NULL DEFAULT 3, -- 1 to 5
    crawl_frequency TEXT NOT NULL DEFAULT 'daily', -- 'hourly', 'daily', 'weekly', 'manual'
    parser_type TEXT NOT NULL DEFAULT 'standard',
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'paused', 'disabled'
    robots_allowed INTEGER NOT NULL DEFAULT 1, -- 1: true, 0: false
    last_checked_at TEXT,
    last_success_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Categories Table
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'inactive'
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Organizations Table
CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    website TEXT,
    logo_r2_key TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'inactive'
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Content Items Table
CREATE TABLE IF NOT EXISTS content_items (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL, -- 'job', 'result', 'admit_card', 'answer_key', 'exam', 'scholarship', 'syllabus', 'scheme', 'update'
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'review', 'published', 'archived'
    source_url TEXT,
    source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
    source_hash TEXT,
    published_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. Jobs Table
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

-- 7. Source Documents Table
CREATE TABLE IF NOT EXISTS source_documents (
    id TEXT PRIMARY KEY,
    content_item_id TEXT REFERENCES content_items(id) ON DELETE SET NULL,
    source_url TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    checksum TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. SEO Metadata Table
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

-- 9. Settings Table
CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'string', -- 'string', 'json', 'boolean', 'number'
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance & query optimization
CREATE INDEX IF NOT EXISTS idx_content_items_slug ON content_items(slug);
CREATE INDEX IF NOT EXISTS idx_content_items_status ON content_items(status);
CREATE INDEX IF NOT EXISTS idx_content_items_category_id ON content_items(category_id);
CREATE INDEX IF NOT EXISTS idx_content_items_org_id ON content_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_content_items_type ON content_items(type);
CREATE INDEX IF NOT EXISTS idx_content_items_published_at ON content_items(published_at);
CREATE INDEX IF NOT EXISTS idx_content_items_source_id ON content_items(source_id);

CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_status ON categories(status);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);

CREATE INDEX IF NOT EXISTS idx_jobs_app_last_date ON jobs(application_last_date);
CREATE INDEX IF NOT EXISTS idx_jobs_content_item_id ON jobs(content_item_id);

CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(status);
CREATE INDEX IF NOT EXISTS idx_sources_priority ON sources(priority);
