-- migrations/0004_phase5_seo_and_redirects.sql
-- Cloudflare D1 Migration for Phase 5: SEO, Internal Linking, Programmatic SEO & Redirects

-- 1. Redirects Management Table
CREATE TABLE IF NOT EXISTS redirects (
    id TEXT PRIMARY KEY,
    source_path TEXT NOT NULL UNIQUE,
    destination_path TEXT NOT NULL,
    status_code INTEGER NOT NULL DEFAULT 301, -- 301 Permanent, 302 Temporary
    active INTEGER NOT NULL DEFAULT 1, -- 1: active, 0: disabled
    hit_count INTEGER NOT NULL DEFAULT 0,
    last_accessed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_redirects_source_path ON redirects(source_path);
CREATE INDEX IF NOT EXISTS idx_redirects_active ON redirects(active);

-- 2. Extended SEO Metadata table (if not existing with extra fields)
CREATE TABLE IF NOT EXISTS seo_metadata_extended (
    id TEXT PRIMARY KEY,
    content_item_id TEXT NOT NULL UNIQUE REFERENCES content_items(id) ON DELETE CASCADE,
    meta_title TEXT,
    meta_description TEXT,
    canonical_url TEXT,
    robots TEXT NOT NULL DEFAULT 'index, follow', -- 'index, follow', 'noindex, follow', 'noindex, nofollow'
    og_title TEXT,
    og_description TEXT,
    og_image TEXT,
    twitter_title TEXT,
    twitter_description TEXT,
    twitter_image TEXT,
    focus_topic TEXT,
    seo_status TEXT NOT NULL DEFAULT 'auto_generated', -- 'auto_generated', 'manual_override', 'needs_review'
    is_manual_override INTEGER NOT NULL DEFAULT 0, -- 1: manually edited by admin, 0: auto
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_seo_ext_item_id ON seo_metadata_extended(content_item_id);
CREATE INDEX IF NOT EXISTS idx_seo_ext_status ON seo_metadata_extended(seo_status);
CREATE INDEX IF NOT EXISTS idx_seo_ext_robots ON seo_metadata_extended(robots);

-- 3. Programmatic Landing Pages Registry & Threshold Settings
CREATE TABLE IF NOT EXISTS programmatic_pages (
    id TEXT PRIMARY KEY,
    page_type TEXT NOT NULL, -- 'qualification', 'category', 'state', 'exam_hub'
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    heading TEXT NOT NULL,
    meta_description TEXT,
    intro_content TEXT,
    target_filter_json TEXT NOT NULL, -- e.g. {"qualification":"10th"} or {"category":"railway"}
    min_content_threshold INTEGER NOT NULL DEFAULT 1,
    is_indexable INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prog_pages_slug ON programmatic_pages(slug);
CREATE INDEX IF NOT EXISTS idx_prog_pages_type ON programmatic_pages(page_type);

-- 4. Seed default Programmatic Landing Pages
INSERT OR IGNORE INTO programmatic_pages (id, page_type, slug, title, heading, meta_description, intro_content, target_filter_json, min_content_threshold, is_indexable)
VALUES
('prog_qual_10th', 'qualification', '10th-pass', '10th Pass Govt Jobs 2026 — Matriculation Vacancies & Apply Online', '10th Pass Government Jobs 2026', 'Explore active 10th pass government jobs in Railways, Defence, SSC MTS, and Police departments with verified notifications and online forms.', 'Find the latest government recruitment notices requiring 10th pass / Matriculation qualification. Apply online with direct official links.', '{"qualification":"10th"}', 1, 1),
('prog_qual_12th', 'qualification', '12th-pass', '12th Pass Govt Jobs 2026 — Intermediate Vacancies & Recruitment', '12th Pass Government Jobs 2026', 'Find active 12th pass government jobs in SSC CHSL, Railway Group D, Police Constable, and State Clerk cadres with eligibility and last dates.', 'Explore all central and state government recruitment opportunities for candidates who have completed 10+2 / Intermediate education.', '{"qualification":"12th"}', 1, 1),
('prog_qual_grad', 'qualification', 'graduate', 'Graduate Govt Jobs 2026 — Degree Level Recruitment & Apply Online', 'Graduate Government Jobs 2026', 'Find degree-level government vacancies for UPSC, SSC CGL, IBPS Bank PO/Clerk, State PSC, and PSU jobs with application deadlines.', 'Comprehensive directory of central and state government employment notices requiring a Bachelor degree in any discipline.', '{"qualification":"Graduate"}', 1, 1),
('prog_qual_pg', 'qualification', 'post-graduate', 'Post Graduate Govt Jobs 2026 — Master Degree & Specialist Careers', 'Post Graduate Government Jobs 2026', 'Explore recruitment openings for Master degree holders, Assistant Professors, Specialist Officers, and Scientists in govt departments.', 'Specialized government jobs for candidates with Master / Post Graduate qualifications across premier public institutions.', '{"qualification":"Post Graduate"}', 1, 1),
('prog_cat_rrb', 'category', 'railway', 'Railway Jobs 2026 — RRB Recruitment, ALP, NTPC, Group D Alerts', 'Railway Recruitment 2026 (RRB / RRC)', 'Latest Indian Railway jobs for RRB NTPC, ALP, Technician, JE, and Group D posts with verified exam schedules and application portals.', 'Official notifications, syllabus, and admit cards for Indian Railways recruitment conducted by various RRB and RRC divisions.', '{"search":"Railway"}', 1, 1),
('prog_cat_bank', 'category', 'banking', 'Banking Jobs 2026 — IBPS, SBI, RBI PO & Clerk Recruitment', 'Banking & Financial Sector Recruitment 2026', 'Latest bank recruitment notices for SBI PO, IBPS Clerk, SO, RRB Office Assistant, and RBI Grade B with exam dates.', 'Direct notifications, application links, and result announcements for public sector and scheduled commercial banks in India.', '{"search":"Banking"}', 1, 1),
('prog_cat_def', 'category', 'defence', 'Defence Jobs 2026 — Army, Navy, Air Force, NDA & CDS Openings', 'Defence Forces Recruitment 2026', 'Active Indian Army, Navy, Air Force, Coast Guard, NDA, and CDS recruitment notifications with physical standards and apply online links.', 'Join the Indian Armed Forces. Verified application forms, eligibility criteria, and examination schedules for defence careers.', '{"search":"Defence"}', 1, 1),
('prog_cat_teach', 'category', 'teaching', 'Teaching Jobs 2026 — CTET, KVS, NVS, State TET & PRT/TGT/PGT Vacancies', 'Teaching & School Education Recruitment 2026', 'Government teacher vacancies in KVS, NVS, DSSSB, CTET, and State TET exams with syllabus, eligibility, and direct apply links.', 'Central and state school teaching jobs, faculty recruitment, and teacher eligibility test alerts across India.', '{"search":"Teaching"}', 1, 1),
('prog_cat_police', 'category', 'police', 'Police Jobs 2026 — Constable, Sub Inspector (SI) Vacancies & Physical Dates', 'Police Recruitment 2026 (Constable & SI)', 'State police recruitment notifications for Constable, Sub-Inspector (SI), Head Constable, and Jail Warder posts with physical eligibility details.', 'Explore state and central police force recruitment notices, PST/PET requirements, and admit card download links.', '{"search":"Police"}', 1, 1),
('prog_cat_upsc', 'category', 'upsc', 'UPSC Recruitment 2026 — Civil Services, NDA, CDS, CMS & IES Alerts', 'UPSC Examination Calendar & Notifications 2026', 'Union Public Service Commission (UPSC) CSE, NDA, CDS, CMS, and engineering recruitment notices with exam calendar and results.', 'Official civil services, defence entrance, and engineering recruitment portals conducted by UPSC.', '{"search":"UPSC"}', 1, 1),
('prog_cat_ssc', 'category', 'ssc', 'SSC Recruitment 2026 — CGL, CHSL, MTS, CPO, GD Constable Notices', 'Staff Selection Commission (SSC) Recruitment 2026', 'Staff Selection Commission (SSC) recruitment notifications for CGL, CHSL, MTS, Stenographer, and GD Constable with answer keys.', 'Central government staff selection notices, Tier-I/II scorecards, and online application windows.', '{"search":"SSC"}', 1, 1);
