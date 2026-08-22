// tests/verify_phase4.mjs
// Phase 4 Public Website, Search, Content Status, and Dynamic Pages Verification Suite

import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

// Import public queries and helpers
import {
  getHomepageData,
  getCategoryContent,
  getContentItemBySlug,
  getRelatedContent,
  searchContent,
  getOrganizationDetails,
  getStateDetails,
  calculateJobStatus,
  INDIAN_STATES,
} from '../src/lib/public_queries.ts';

console.log('===================================================================');
console.log('   PHASE 4 — PUBLIC WEBSITE & SEARCH VERIFICATION SUITE           ');
console.log('===================================================================\n');

// Setup test SQLite database
const testDbDir = join(process.cwd(), '.wrangler', 'test-d1');
if (!existsSync(testDbDir)) mkdirSync(testDbDir, { recursive: true });
const testDbPath = join(testDbDir, 'test_phase4.sqlite');
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

sqliteDb.exec(initialSchema);
sqliteDb.exec(seedData);
sqliteDb.exec(phase2Schema);
sqliteDb.exec(phase3Schema);

// Wrap into DbClient interface
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
  async batch(statements) {
    return statements.map(s => sqliteDb.prepare(s.sql).run(...(s.params || [])));
  }
};

// Seed diverse test items
await db.run(`
  INSERT OR REPLACE INTO organizations (id, name, slug, website) VALUES
  ('org_upsc', 'Union Public Service Commission', 'upsc', 'https://upsc.gov.in'),
  ('org_ssc', 'Staff Selection Commission', 'ssc', 'https://ssc.gov.in'),
  ('org_rrb', 'Railway Recruitment Board', 'rrb', 'https://rrbcdg.gov.in'),
  ('org_uppsc', 'Uttar Pradesh Public Service Commission', 'uppsc', 'https://uppsc.up.nic.in')
`);

await db.run(`
  INSERT OR REPLACE INTO categories (id, name, slug) VALUES
  ('cat_jobs', 'Government Jobs', 'jobs'),
  ('cat_results', 'Results', 'results'),
  ('cat_admit', 'Admit Cards', 'admit-card')
`);

// 1. Published Job (Open)
await db.run(`
  INSERT INTO content_items (id, category_id, organization_id, type, title, slug, status, published_at, created_at, updated_at)
  VALUES ('ci_job_1', 'cat_jobs', 'org_upsc', 'job', 'UPSC Civil Services Examination 2026', 'upsc-cse-2026', 'published', datetime('now', '-2 days'), datetime('now', '-2 days'), datetime('now', '-2 days'))
`);
await db.run(`
  INSERT INTO jobs (id, content_item_id, post_name, vacancy, qualification, application_start, application_last_date, application_fee, salary, official_notification_url, official_apply_url)
  VALUES ('j1', 'ci_job_1', 'IAS / IPS / IFS', '1056', 'Graduate Degree in any discipline', '2026-02-01', '2026-03-15', 'Rs. 100/- for Gen/OBC', 'Level 10 (Rs. 56,100/-)', 'https://upsc.gov.in/notif.pdf', 'https://upsconline.nic.in')
`);

// 2. Published Job (Closing Soon - 2 days from now)
const twoDaysLater = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
await db.run(`
  INSERT INTO content_items (id, category_id, organization_id, type, title, slug, status, published_at, created_at, updated_at)
  VALUES ('ci_job_2', 'cat_jobs', 'org_rrb', 'job', 'RRB Assistant Loco Pilot Recruitment 2026', 'rrb-alp-2026', 'published', datetime('now', '-5 days'), datetime('now', '-5 days'), datetime('now', '-5 days'))
`);
await db.run(`
  INSERT INTO jobs (id, content_item_id, post_name, vacancy, qualification, application_start, application_last_date)
  VALUES ('j2', 'ci_job_2', 'Assistant Loco Pilot', '5696', '10th Pass + ITI', '2026-01-20', '${twoDaysLater}')
`);

// 3. Draft Job (Should NEVER appear on public endpoints)
await db.run(`
  INSERT INTO content_items (id, category_id, organization_id, type, title, slug, status, created_at)
  VALUES ('ci_job_draft', 'cat_jobs', 'org_ssc', 'job', 'Secret Unreleased Draft Job', 'secret-draft-job', 'draft', datetime('now'))
`);

// 4. Published Result
await db.run(`
  INSERT INTO content_items (id, category_id, organization_id, type, title, slug, status, published_at, created_at, updated_at)
  VALUES ('ci_res_1', 'cat_results', 'org_ssc', 'result', 'SSC CGL Tier 1 Result Declared 2026', 'ssc-cgl-result-2026', 'published', datetime('now', '-1 day'), datetime('now', '-1 day'), datetime('now', '-1 day'))
`);

// 5. Published Admit Card
await db.run(`
  INSERT INTO content_items (id, category_id, organization_id, type, title, slug, status, published_at, created_at, updated_at)
  VALUES ('ci_admit_1', 'cat_admit', 'org_upsc', 'admit_card', 'UPSC CSE Prelims Admit Card 2026', 'upsc-cse-admit-card-2026', 'published', datetime('now', '-3 days'), datetime('now', '-3 days'), datetime('now', '-3 days'))
`);

// 6. State Specific Job (Uttar Pradesh)
await db.run(`
  INSERT INTO content_items (id, category_id, organization_id, type, title, slug, status, published_at, created_at, updated_at)
  VALUES ('ci_job_up', 'cat_jobs', 'org_uppsc', 'job', 'Uttar Pradesh Police Constable 60000 Recruitment', 'up-police-constable-2026', 'published', datetime('now', '-1 day'), datetime('now', '-1 day'), datetime('now', '-1 day'))
`);
await db.run(`
  INSERT INTO jobs (id, content_item_id, post_name, vacancy, qualification, application_last_date)
  VALUES ('j_up', 'ci_job_up', 'Constable', '60244', '12th Pass', '2026-08-30')
`);

// 7. Announcement setting
await db.run(`
  INSERT OR REPLACE INTO settings (id, key, value, type)
  VALUES ('s_ann', 'announcement_bar', 'UPSC CSE 2026 Application Portal is now live. Apply before deadline.', 'string')
`);

// ---------------------------------------------------------
// TEST 1: Status Calculation Engine
// ---------------------------------------------------------
console.log('Test 1: Testing Status Calculation Engine...');
const statusOpen = calculateJobStatus({ application_start_date: '2026-01-01', application_last_date: '2026-12-31' });
const statusClosed = calculateJobStatus({ application_start_date: '2025-01-01', application_last_date: '2025-12-31' });
const statusClosingSoon = calculateJobStatus({ application_start_date: '2026-01-01', application_last_date: twoDaysLater });
const statusResult = calculateJobStatus({ type: 'result' });

if (statusOpen !== 'Applications Open') throw new Error(`Expected 'Applications Open', got ${statusOpen}`);
if (statusClosed !== 'Application Closed') throw new Error(`Expected 'Application Closed', got ${statusClosed}`);
if (statusClosingSoon !== 'Closing Soon') throw new Error(`Expected 'Closing Soon', got ${statusClosingSoon}`);
if (statusResult !== 'Result Released') throw new Error(`Expected 'Result Released', got ${statusResult}`);

console.log('  ✔ calculateJobStatus correctly calculated statuses: Open, Closed, Closing Soon, Result Released.');

// ---------------------------------------------------------
// TEST 2: Homepage Data Queries & Published Filtering
// ---------------------------------------------------------
console.log('\nTest 2: Testing Homepage Data Queries & Strict Published Filtering...');
const homeData = await getHomepageData(db);

if (!homeData.announcement || !homeData.announcement.includes('UPSC CSE 2026')) {
  throw new Error('Failed to retrieve dynamic announcement bar text');
}

if (homeData.latestJobs.length === 0) throw new Error('Homepage missing latest published jobs');
if (homeData.latestResults.length === 0) throw new Error('Homepage missing latest published results');
if (homeData.latestAdmitCards.length === 0) throw new Error('Homepage missing latest published admit cards');

// Verify draft content is NEVER in homepage data
const hasDraft = [...homeData.latestJobs, ...homeData.latestResults, ...homeData.latestAdmitCards]
  .some(item => item.id === 'ci_job_draft' || item.status === 'draft');

if (hasDraft) throw new Error('CRITICAL SECURITY VIOLATION: Draft item found in public homepage listings!');

console.log(`  ✔ Homepage data verified: ${homeData.latestJobs.length} jobs, ${homeData.latestResults.length} results, ${homeData.latestAdmitCards.length} admit cards.`);
console.log('  ✔ Draft content strictly excluded from public homepage.');

// ---------------------------------------------------------
// TEST 3: Category Listings & Pagination
// ---------------------------------------------------------
console.log('\nTest 3: Testing Category Content Listings & Pagination...');
const jobsList = await getCategoryContent(db, 'job', { page: 1, limit: 10 });
if (jobsList.total < 2 || jobsList.items.length < 2) {
  throw new Error(`Expected at least 2 published jobs, got ${jobsList.total}`);
}

const filteredByQual = await getCategoryContent(db, 'job', { qualification: '10th' });
if (filteredByQual.items.length === 0 || !filteredByQual.items[0].qualification?.includes('10th')) {
  throw new Error('Qualification filtering for 10th pass failed');
}

console.log(`  ✔ Category listing verified: ${jobsList.total} total items, qualification filter verified.`);

// ---------------------------------------------------------
// TEST 4: Single Item Retrieval & Admin Preview
// ---------------------------------------------------------
console.log('\nTest 4: Testing Single Content Item Slug Resolution & Admin Preview...');
// Public access to published item
const publicItem = await getContentItemBySlug(db, 'job', 'upsc-cse-2026');
if (!publicItem.item || publicItem.isPreview) {
  throw new Error('Failed to fetch published job item');
}

// Public access to draft item should return null
const draftPublic = await getContentItemBySlug(db, 'job', 'secret-draft-job', { allowPreview: false });
if (draftPublic.item !== null) {
  throw new Error('Draft item must NOT be accessible without preview permission!');
}

// Admin preview of draft item
const draftPreview = await getContentItemBySlug(db, 'job', 'secret-draft-job', { allowPreview: true });
if (!draftPreview.item || !draftPreview.isPreview) {
  throw new Error('Admin preview failed to load draft item with isPreview=true');
}

console.log('  ✔ Public slug access and protected Admin Preview Mode verified.');

// ---------------------------------------------------------
// TEST 5: Deterministic Related Content Engine
// ---------------------------------------------------------
console.log('\nTest 5: Testing Deterministic Related Content Engine...');
const related = await getRelatedContent(db, publicItem.item, 4);
if (related.length === 0) throw new Error('Related content query returned 0 items');

// Verify current item is never in related list
if (related.some(r => r.id === publicItem.item?.id)) {
  throw new Error('Current item was included in its own related items list');
}

console.log(`  ✔ Related content returned ${related.length} relevant items.`);

// ---------------------------------------------------------
// TEST 6: Multi-Field Server-Side Search Engine
// ---------------------------------------------------------
console.log('\nTest 6: Testing Server-Side Multi-Field Search Engine...');
const searchUpsc = await searchContent(db, 'UPSC');
if (searchUpsc.total === 0 || !searchUpsc.items.some(i => i.title.includes('UPSC'))) {
  throw new Error('Search failed to find published items matching "UPSC"');
}

const searchWithFilter = await searchContent(db, '', { type: 'result' });
if (searchWithFilter.items.some(i => i.type !== 'result')) {
  throw new Error('Search type filter returned non-result items');
}

const searchDraft = await searchContent(db, 'Secret Unreleased Draft Job');
if (searchDraft.total > 0) {
  throw new Error('Search MUST NOT return draft items to public users!');
}

console.log(`  ✔ Search engine verified: "${searchUpsc.total}" results found; filters and draft exclusion verified.`);

// ---------------------------------------------------------
// TEST 7: Organization & State Hub Queries
// ---------------------------------------------------------
console.log('\nTest 7: Testing Organization & State Hub Queries...');
const upscDetails = await getOrganizationDetails(db, 'upsc');
if (!upscDetails || upscDetails.jobs.length === 0) {
  throw new Error('Organization details query failed for UPSC');
}

const upStateDetails = await getStateDetails(db, 'uttar-pradesh');
if (!upStateDetails || upStateDetails.jobs.length === 0) {
  throw new Error('State details query failed for Uttar Pradesh');
}

console.log(`  ✔ Organization hub: ${upscDetails.org.name} (${upscDetails.totalCount} items)`);
console.log(`  ✔ State hub: ${upStateDetails.state.name} (${upStateDetails.totalCount} items)`);

// ---------------------------------------------------------
// TEST 8: Indian States List Integrity
// ---------------------------------------------------------
console.log('\nTest 8: Testing Indian States List Integrity...');
if (!Array.isArray(INDIAN_STATES) || INDIAN_STATES.length < 20) {
  throw new Error('INDIAN_STATES constant incomplete');
}
console.log(`  ✔ ${INDIAN_STATES.length} Indian states and union territories verified.`);

console.log('\n===================================================================');
console.log('   ALL PHASE 4 PUBLIC WEBSITE & SEARCH TESTS PASSED (100% PASS)   ');
console.log('===================================================================\n');
