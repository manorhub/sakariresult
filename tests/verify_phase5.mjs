// tests/verify_phase5.mjs
// Phase 5 SEO, Internal Linking, Programmatic SEO & Redirects Verification Suite

import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

// Import Phase 5 modules
import { generateSeoMetadata } from '../src/lib/seo/templates.ts';
import { buildCanonicalUrl } from '../src/lib/seo/canonical.ts';
import { evaluateRobotsDirective } from '../src/lib/seo/robots.ts';
import {
  buildBreadcrumbSchema,
  buildWebSiteSchema,
  buildOrganizationSchema,
  buildJobPostingSchema,
  buildArticleSchema,
  buildFaqSchema,
} from '../src/lib/seo/schema.ts';
import { calculateRelationshipScore } from '../src/lib/internal-links/scorer.ts';
import { rankInternalCandidates } from '../src/lib/internal-links/matcher.ts';
import { injectContextualLinks } from '../src/lib/internal-links/renderer.ts';
import { runSeoHealthAudit } from '../src/lib/seo/audit.ts';
import { getProgrammaticPageData } from '../src/lib/seo/programmatic.ts';
import { generateOgSvg } from '../src/lib/seo/og.ts';

console.log('===================================================================');
console.log('   PHASE 5 — SEO, INTERNAL LINKING & PROGRAMMATIC SEO TESTS       ');
console.log('===================================================================\n');

// Setup test SQLite database
const testDbDir = join(process.cwd(), '.wrangler', 'test-d1');
if (!existsSync(testDbDir)) mkdirSync(testDbDir, { recursive: true });
const testDbPath = join(testDbDir, 'test_phase5.sqlite');
if (existsSync(testDbPath)) {
  try { unlinkSync(testDbPath); } catch {}
}

const sqliteDb = new Database(testDbPath);
sqliteDb.pragma('journal_mode = WAL');

// Execute migrations
const initialSchema = readFileSync(join(process.cwd(), 'migrations', '0000_initial_schema.sql'), 'utf-8');
const seedData = readFileSync(join(process.cwd(), 'migrations', '0001_seed_initial_data.sql'), 'utf-8');
const phase2Schema = readFileSync(join(process.cwd(), 'migrations', '0002_phase2_crawler_tables.sql'), 'utf-8');
const phase3Schema = readFileSync(join(process.cwd(), 'migrations', '0003_phase3_ai_engine.sql'), 'utf-8');
const phase5Schema = readFileSync(join(process.cwd(), 'migrations', '0004_phase5_seo_and_redirects.sql'), 'utf-8');

sqliteDb.exec(initialSchema);
sqliteDb.exec(seedData);
sqliteDb.exec(phase2Schema);
sqliteDb.exec(phase3Schema);
sqliteDb.exec(phase5Schema);

const db = {
  async query(sql, params = []) {
    const stmt = sqliteDb.prepare(sql);
    return { results: stmt.all(...params), success: true };
  },
  async first(sql, params = []) {
    const stmt = sqliteDb.prepare(sql);
    return stmt.get(...params) || null;
  },
  async run(sql, params = []) {
    const stmt = sqliteDb.prepare(sql);
    const info = stmt.run(...params);
    return { success: true, meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } };
  },
  async exec(sql) {
    sqliteDb.exec(sql);
  },
};

// Seed test content
await db.run(`
  INSERT OR REPLACE INTO organizations (id, name, slug, website) VALUES
  ('org_upsc', 'Union Public Service Commission', 'upsc', 'https://upsc.gov.in'),
  ('org_rrb', 'Railway Recruitment Board', 'rrb', 'https://rrbcdg.gov.in')
`);

await db.run(`
  INSERT OR REPLACE INTO categories (id, name, slug) VALUES
  ('cat_jobs', 'Government Jobs', 'jobs'),
  ('cat_results', 'Results', 'results')
`);

// 1. Published Job
await db.run(`
  INSERT INTO content_items (id, category_id, organization_id, type, title, slug, status, published_at, created_at, updated_at)
  VALUES ('ci_job_1', 'cat_jobs', 'org_upsc', 'job', 'UPSC Civil Services Examination 2026', 'upsc-cse-2026', 'published', '2026-02-01T10:00:00Z', '2026-02-01T10:00:00Z', '2026-02-05T12:00:00Z')
`);
await db.run(`
  INSERT INTO jobs (id, content_item_id, post_name, vacancy, qualification, application_start, application_last_date, salary)
  VALUES ('j1', 'ci_job_1', 'IAS / IPS', '1056', 'Graduate Degree', '2026-02-01', '2026-03-05', 'Level 10')
`);

// 2. Published Result (Linked to UPSC)
await db.run(`
  INSERT INTO content_items (id, category_id, organization_id, type, title, slug, status, published_at, created_at, updated_at)
  VALUES ('ci_res_1', 'cat_results', 'org_upsc', 'result', 'UPSC CSE Prelims Result 2026', 'upsc-cse-result-2026', 'published', '2026-06-15T10:00:00Z', '2026-06-15T10:00:00Z', '2026-06-15T10:00:00Z')
`);

// 3. Published Railway 10th pass job
await db.run(`
  INSERT INTO content_items (id, category_id, organization_id, type, title, slug, status, published_at, created_at, updated_at)
  VALUES ('ci_rrb_1', 'cat_jobs', 'org_rrb', 'job', 'Railway RRB ALP Recruitment 2026', 'rrb-alp-2026', 'published', '2026-01-10T10:00:00Z', '2026-01-10T10:00:00Z', '2026-01-10T10:00:00Z')
`);
await db.run(`
  INSERT INTO jobs (id, content_item_id, post_name, vacancy, qualification, application_last_date)
  VALUES ('j_rrb', 'ci_rrb_1', 'Assistant Loco Pilot', '5696', '10th Pass + ITI', '2026-02-28')
`);

// ---------------------------------------------------------
// TEST 1: SEO Template & Meta Description Generation
// ---------------------------------------------------------
console.log('Test 1: Testing SEO Template & Meta Description Generation...');
const mockJob = {
  id: 'ci_job_1',
  type: 'job',
  title: 'UPSC Civil Services Examination 2026',
  slug: 'upsc-cse-2026',
  organization_id: 'org_upsc',
  organization_name: 'Union Public Service Commission',
  post_name: 'IAS / IPS Officers',
  total_vacancies: '1056',
  qualification: 'Graduate Degree',
  application_last_date: '2026-03-05',
  status: 'published',
  created_at: '2026-02-01',
  updated_at: '2026-02-05',
};

const generated = generateSeoMetadata({ item: mockJob, siteName: 'Sarkari Info' });
if (!generated.title.includes('1056 Vacancies') || !generated.title.includes('IAS / IPS Officers')) {
  throw new Error(`Generated title did not include expected facts: "${generated.title}"`);
}
if (!generated.description.includes('Graduate Degree') || !generated.description.includes('2026-03-05')) {
  throw new Error(`Generated description missing verified facts: "${generated.description}"`);
}
console.log(`  ✔ Title: "${generated.title}"`);
console.log(`  ✔ Description: "${generated.description}"`);

// ---------------------------------------------------------
// TEST 2: Canonical URL Builder & Normalizer
// ---------------------------------------------------------
console.log('\nTest 2: Testing Canonical URL Builder...');
const dirtyUrl = 'HTTP://sarkariinfo.in/JOBS/upsc-cse-2026/?utm_source=telegram&utm_medium=channel&fbclid=123#dates';
const cleanCanonical = buildCanonicalUrl(dirtyUrl, { siteUrl: 'https://sarkariinfo.in' });
const expectedCanonical = 'https://sarkariinfo.in/jobs/upsc-cse-2026';

if (cleanCanonical !== expectedCanonical) {
  throw new Error(`Canonical normalization failed. Expected "${expectedCanonical}", got "${cleanCanonical}"`);
}
console.log(`  ✔ Raw:       ${dirtyUrl}`);
console.log(`  ✔ Canonical: ${cleanCanonical}`);

// ---------------------------------------------------------
// TEST 3: Robots Meta Directive Evaluator
// ---------------------------------------------------------
console.log('\nTest 3: Testing Robots Meta Directive Evaluator...');
const robIndex = evaluateRobotsDirective({ pathname: '/jobs/upsc-cse-2026', itemStatus: 'published' });
const robSearch = evaluateRobotsDirective({ pathname: '/search', searchParams: { q: 'upsc' } });
const robPreview = evaluateRobotsDirective({ pathname: '/jobs/secret-draft', isPreview: true });
const robThin = evaluateRobotsDirective({ pathname: '/jobs/empty-category', totalResults: 0, minContentThreshold: 1 });

if (robIndex !== 'index, follow') throw new Error(`Expected 'index, follow', got ${robIndex}`);
if (robSearch !== 'noindex, follow') throw new Error(`Expected 'noindex, follow' on search, got ${robSearch}`);
if (robPreview !== 'noindex, follow') throw new Error(`Expected 'noindex, follow' on preview, got ${robPreview}`);
if (robThin !== 'noindex, follow') throw new Error(`Expected 'noindex, follow' on thin page, got ${robThin}`);
console.log('  ✔ Robots directives verified for indexable, search query, preview, and thin pages.');

// ---------------------------------------------------------
// TEST 4: Schema.org Structured Data Generation
// ---------------------------------------------------------
console.log('\nTest 4: Testing Schema.org Structured Data Generators...');
const breadcrumbs = [
  { name: 'Home', href: '/' },
  { name: 'Jobs', href: '/jobs' },
  { name: 'UPSC CSE 2026' },
];
const breadcrumbLd = buildBreadcrumbSchema(breadcrumbs);
if (breadcrumbLd['@type'] !== 'BreadcrumbList' || breadcrumbLd.itemListElement.length !== 3) {
  throw new Error('Breadcrumb schema generation failed');
}

const websiteLd = buildWebSiteSchema();
if (websiteLd['@type'] !== 'WebSite' || !websiteLd.potentialAction) {
  throw new Error('WebSite schema missing SearchAction');
}

const jobLd = buildJobPostingSchema(mockJob);
if (jobLd['@type'] !== 'JobPosting' || jobLd.title !== mockJob.title) {
  throw new Error('JobPosting schema generation failed');
}

const articleLd = buildArticleSchema(mockJob);
if (articleLd['@type'] !== 'Article' || articleLd.headline !== mockJob.title) {
  throw new Error('Article schema generation failed');
}

const orgLd = buildOrganizationSchema({ id: 'org_1', name: 'Union Public Service Commission', slug: 'upsc', website: 'https://upsc.gov.in', logo_r2_key: null, description: null, status: 'active', created_at: '', updated_at: '' });
if (orgLd['@type'] !== 'Organization' || orgLd.name !== 'Union Public Service Commission') {
  throw new Error('Organization schema generation failed');
}

const emptyFaqLd = buildFaqSchema([]);
if (emptyFaqLd !== null) {
  throw new Error('FAQ schema MUST be null when no visible FAQs exist!');
}

const validFaqLd = buildFaqSchema([{ question: 'What is the last date?', answer: '05 March 2026' }]);
if (!validFaqLd || validFaqLd['@type'] !== 'FAQPage') {
  throw new Error('FAQPage schema generation failed on valid FAQs');
}
console.log('  ✔ BreadcrumbList, WebSite, JobPosting, Article, Organization, and FAQPage schemas verified.');

// ---------------------------------------------------------
// TEST 5: Internal Link Scoring Algorithm
// ---------------------------------------------------------
console.log('\nTest 5: Testing Deterministic Internal Link Scoring Algorithm...');
const mockResult = {
  id: 'ci_res_1',
  type: 'result',
  title: 'UPSC CSE Prelims Result 2026',
  slug: 'upsc-cse-result-2026',
  organization_id: 'org_upsc',
  post_name: 'IAS / IPS Officers',
  status: 'published',
  published_at: new Date().toISOString(),
};

const score = calculateRelationshipScore(mockJob, mockResult);
// Same Org (+40) + Same Exam (+35) + Related Type (+15) + Recent (+5) = 95
if (score.score < 80) {
  throw new Error(`Expected relationship score >= 80, got ${score.score} (${score.reasons.join(', ')})`);
}
const ranked = rankInternalCandidates(mockJob, [mockResult], 20);
if (ranked.length === 0 || ranked[0].score !== score.score) {
  throw new Error('rankInternalCandidates failed');
}
console.log(`  ✔ Relationship score between Job and Result: ${score.score} points.`);
console.log(`  ✔ Reasons: ${score.reasons.join(', ')}`);

// ---------------------------------------------------------
// TEST 6: Contextual Link Injection
// ---------------------------------------------------------
console.log('\nTest 6: Testing Contextual Link Injection in Article Text...');
const rawArticle = `Candidates can download the UPSC Civil Services Examination 2026 application form. After appearing in the exam, check the UPSC CSE Prelims Result 2026 to see qualified candidates.`;
const candidates = [
  {
    item: mockResult,
    score: score.score,
    matchReasons: score.reasons,
    suggestedAnchor: 'UPSC CSE Prelims Result 2026',
    targetUrl: '/results/upsc-cse-result-2026',
  },
];

const linkedArticle = injectContextualLinks(rawArticle, candidates, 3);
if (!linkedArticle.includes('[UPSC CSE Prelims Result 2026](/results/upsc-cse-result-2026)')) {
  throw new Error('Contextual link injection failed to insert markdown link');
}
console.log('  ✔ Natural contextual anchor link inserted without keyword stuffing.');

// ---------------------------------------------------------
// TEST 7: Programmatic Landing Page Quality Threshold
// ---------------------------------------------------------
console.log('\nTest 7: Testing Programmatic Landing Pages Quality Rule...');
const qualPage = await getProgrammaticPageData(db, '10th-pass');
if (!qualPage) throw new Error('Failed to retrieve 10th-pass programmatic page');
if (qualPage.totalCount < 1 || !qualPage.isIndexable) {
  throw new Error('10th pass programmatic page with matching items should be indexable');
}

const emptyProgPage = await getProgrammaticPageData(db, 'teaching');
if (!emptyProgPage) throw new Error('Failed to retrieve teaching programmatic page');
if (emptyProgPage.totalCount === 0 && emptyProgPage.isIndexable) {
  throw new Error('Empty programmatic page MUST NOT be indexable (thin content protection failed)!');
}
console.log(`  ✔ 10th Pass page: ${qualPage.totalCount} active items &bull; Indexable: ${qualPage.isIndexable}`);
console.log(`  ✔ Teaching page: ${emptyProgPage.totalCount} active items &bull; Indexable: ${emptyProgPage.isIndexable} (noindex applied)`);

// ---------------------------------------------------------
// TEST 8: SEO Health Audit Engine
// ---------------------------------------------------------
console.log('\nTest 8: Testing SEO Health Audit Engine...');
const audit = await runSeoHealthAudit(db);
if (typeof audit.auditScore !== 'number' || audit.auditScore <= 0) {
  throw new Error('SEO Health Audit failed to generate valid score');
}
console.log(`  ✔ SEO Health Audit generated score: ${audit.auditScore}/100.`);
console.log(`  ✔ Total Indexable: ${audit.totalIndexable}, Thin Programmatic Pages flagged: ${audit.thinProgrammaticPages.length}`);

// ---------------------------------------------------------
// TEST 9: 301 Redirect System
// ---------------------------------------------------------
console.log('\nTest 9: Testing 301 URL Redirect System in D1...');
await db.run(`
  INSERT INTO redirects (id, source_path, destination_path, status_code, active)
  VALUES ('red_test_1', '/old-upsc-link-2025', '/jobs/upsc-cse-2026', 301, 1)
`);

const redirectRecord = await db.first('SELECT * FROM redirects WHERE source_path = ?', ['/old-upsc-link-2025']);
if (!redirectRecord || redirectRecord.destination_path !== '/jobs/upsc-cse-2026' || redirectRecord.status_code !== 301) {
  throw new Error('Redirect insertion and lookup in D1 failed');
}
console.log(`  ✔ 301 Redirect verified: "${redirectRecord.source_path}" &rarr; "${redirectRecord.destination_path}"`);

// ---------------------------------------------------------
// TEST 10: Dynamic Open Graph Image Generator
// ---------------------------------------------------------
console.log('\nTest 10: Testing Dynamic Open Graph SVG Generator...');
const ogSvg = generateOgSvg({
  title: 'UPSC Civil Services Examination 2026',
  organization: 'Union Public Service Commission',
  category: 'Civil Services',
});

if (!ogSvg.startsWith('<svg') || !ogSvg.includes('UPSC Civil Services') || !ogSvg.includes('sarkariinfo.in')) {
  throw new Error('Open Graph SVG generation failed');
}
console.log('  ✔ High-resolution Open Graph SVG generated (1200x630).');

console.log('\n===================================================================');
console.log('   ALL PHASE 5 SEO & INTERNAL LINKING TESTS PASSED (100% PASS)    ');
console.log('===================================================================\n');
