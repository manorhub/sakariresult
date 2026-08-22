-- migrations/0006_phase7_monetization_analytics_and_logs.sql
-- Cloudflare D1 Migration for Phase 7: Monetization, Subscriptions, Ads, Analytics, Audit Logs & System Health

-- 1. Subscription Plans Table
CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    price REAL NOT NULL DEFAULT 0.0,
    currency TEXT NOT NULL DEFAULT 'INR',
    billing_interval TEXT NOT NULL DEFAULT 'monthly', -- 'monthly', 'yearly', 'lifetime'
    features_json TEXT NOT NULL DEFAULT '[]',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_plans_slug ON plans(slug);
CREATE INDEX IF NOT EXISTS idx_plans_active ON plans(active);

-- Seed Default Plans (Free & Optional Premium)
INSERT OR IGNORE INTO plans (id, name, slug, description, price, currency, billing_interval, features_json, active) VALUES
('plan_free', 'Free Plan', 'free', 'Standard free access to all government jobs, results, admit cards, and basic alerts.', 0.0, 'INR', 'lifetime', '["basic_alerts","save_jobs","view_all_content"]', 1),
('plan_premium', 'Candidate Pro Alerts', 'premium', 'Instant priority SMS/Email alerts, customized exam tracker, and advanced deadline reminders.', 99.0, 'INR', 'monthly', '["instant_priority_alerts","advanced_deadline_reminders","daily_custom_digest","ad_free_experience"]', 1);

-- 2. User Subscriptions Table
CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
    provider TEXT NOT NULL DEFAULT 'none', -- 'stripe', 'razorpay', 'cashfree', 'manual', 'none'
    provider_customer_id TEXT,
    provider_subscription_id TEXT,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'trialing', 'past_due', 'cancelled', 'expired', 'incomplete'
    current_period_start TEXT,
    current_period_end TEXT,
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sub_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_sub_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_sub_provider_sub ON subscriptions(provider_subscription_id);

-- 3. Payment Webhook Events Table (Idempotency & Auditing)
CREATE TABLE IF NOT EXISTS payment_webhook_events (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    processed INTEGER NOT NULL DEFAULT 0,
    processed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pwe_event_id ON payment_webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_pwe_provider ON payment_webhook_events(provider);

-- 4. Revenue Records Table
CREATE TABLE IF NOT EXISTS revenue_records (
    id TEXT PRIMARY KEY,
    revenue_type TEXT NOT NULL, -- 'advertising', 'subscription', 'sponsored'
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    source TEXT NOT NULL, -- 'google_adsense', 'direct_sponsor', 'subscriptions', 'other'
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rev_type ON revenue_records(revenue_type);
CREATE INDEX IF NOT EXISTS idx_rev_period ON revenue_records(period_start, period_end);

-- 5. Search Analytics Table (Aggregate, Anonymous)
CREATE TABLE IF NOT EXISTS search_queries (
    id TEXT PRIMARY KEY,
    query_normalized TEXT NOT NULL UNIQUE,
    results_count INTEGER NOT NULL DEFAULT 0,
    hit_count INTEGER NOT NULL DEFAULT 1,
    last_searched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_search_query ON search_queries(query_normalized);
CREATE INDEX IF NOT EXISTS idx_search_hits ON search_queries(hit_count DESC);

-- 6. Feature Flags Table
CREATE TABLE IF NOT EXISTS feature_flags (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    description TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed Core Feature Flags
INSERT OR IGNORE INTO feature_flags (key, name, enabled, description) VALUES
('user_accounts', 'Candidate Accounts', 1, 'Enables user registration, login, profile management, and account dashboard.'),
('saved_jobs', 'Saved Jobs & Content', 1, 'Enables saving/bookmarking jobs, exams, and results.'),
('email_alerts', 'Email Notification Alerts', 1, 'Enables automated email alerts when new notices/results are published.'),
('premium_alerts', 'Optional Premium Subscriptions', 0, 'Enables optional paid tier for advanced alert features.'),
('advertisements', 'Display Advertisements', 1, 'Enables ad placements across public pages.'),
('sponsored_content', 'Sponsored Job Listings', 1, 'Enables highlighted sponsored job listings with explicit labeling.'),
('daily_digest', 'Daily Email Digest', 1, 'Enables daily digest summaries for candidates.'),
('weekly_digest', 'Weekly Email Digest', 1, 'Enables weekly roundup newsletters.');

-- 7. Global Settings Table (Key-Value Store)
CREATE TABLE IF NOT EXISTS global_settings (
    key TEXT PRIMARY KEY,
    category TEXT NOT NULL, -- 'general', 'ai', 'storage', 'email', 'ads', 'premium', 'sponsored', 'site'
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_global_settings_category ON global_settings(category);

-- Seed Initial Global Settings
INSERT OR IGNORE INTO global_settings (key, category, value_json) VALUES
('general_settings', 'general', '{"siteName":"Sarkari Info","logo":"/logo.svg","description":"India Premier Official Government Jobs, Admit Cards & Results Portal","contactEmail":"contact@sarkariinfo.in","primaryDomain":"https://sarkariinfo.in"}'),
('ads_settings', 'ads', '{"enabled":true,"provider":"google_adsense","publisherId":"ca-pub-0000000000000000","headerAds":true,"inContentAds":true,"sidebarAds":true,"footerAds":true,"mobileAds":true,"desktopAds":true}'),
('site_settings', 'site', '{"maintenanceMode":false,"announcementBar":{"enabled":true,"text":"Official UPSC & SSC 2026 Examination Calendars Announced. Check updates now!","link":"/important-updates","startDate":null,"endDate":null},"defaultLanguage":"en","defaultCurrency":"INR"}');

-- 8. Structured Error Logs Table
CREATE TABLE IF NOT EXISTS error_logs (
    id TEXT PRIMARY KEY,
    service TEXT NOT NULL, -- 'crawler', 'ai_engine', 'd1_database', 'r2_storage', 'email_service', 'auth', 'payment', 'system'
    operation TEXT NOT NULL,
    severity TEXT NOT NULL, -- 'info', 'warning', 'error', 'critical'
    error_code TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata_json TEXT,
    resolved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_err_service ON error_logs(service);
CREATE INDEX IF NOT EXISTS idx_err_severity ON error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_err_created_at ON error_logs(created_at DESC);

-- 9. Admin Audit Logs Table
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL,
    action TEXT NOT NULL, -- 'publish', 'unpublish', 'delete', 'source_update', 'ai_settings', 'content_edit', 'user_suspend', 'ads_settings', 'flag_toggle', 'maintenance_toggle'
    resource_type TEXT NOT NULL, -- 'content_item', 'source', 'user', 'setting', 'flag', 'revenue'
    resource_id TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_admin ON admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_logs(created_at DESC);

-- 10. Add Sponsored Content Fields to Content Items (if not already present)
ALTER TABLE content_items ADD COLUMN sponsored INTEGER NOT NULL DEFAULT 0;
ALTER TABLE content_items ADD COLUMN sponsor_name TEXT;
ALTER TABLE content_items ADD COLUMN sponsor_url TEXT;
ALTER TABLE content_items ADD COLUMN sponsored_start TEXT;
ALTER TABLE content_items ADD COLUMN sponsored_end TEXT;
ALTER TABLE content_items ADD COLUMN sponsored_status TEXT DEFAULT 'inactive';
