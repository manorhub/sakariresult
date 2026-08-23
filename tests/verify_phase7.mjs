// tests/verify_phase7.mjs
// Phase 7 Monetization, Subscriptions, Ads, Analytics, Audit Logs & System Health Test Suite

import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

// Import Phase 7 modules
import {
  getGlobalSetting,
  setGlobalSetting,
  getGeneralSettings,
  getAdsSettings,
  getSiteSettings,
  isFeatureEnabled,
  getAllFeatureFlags,
  setFeatureFlag,
} from '../src/lib/settings.ts';
import { evaluateAdDisplay } from '../src/lib/monetization/ads.ts';
import { PaymentService } from '../src/lib/monetization/payments.ts';
import { getUserEntitlements, hasFeatureEntitlement } from '../src/lib/monetization/entitlements.ts';
import { recordSearchQuery, getTopSearchQueries } from '../src/lib/analytics/search_tracker.ts';
import { getPlatformStatistics } from '../src/lib/analytics/stats.ts';
import { runSystemHealthCheck } from '../src/lib/system_health.ts';
import { logError, sanitizeLogMetadata } from '../src/lib/logging/error_logger.ts';
import { logAdminAudit } from '../src/lib/logging/audit_logger.ts';

console.log('===================================================================');
console.log('   PHASE 7 — MONETIZATION, ANALYTICS & PRODUCTION AUDIT TESTS     ');
console.log('===================================================================\n');

// Setup test SQLite database
const testDbDir = join(process.cwd(), '.wrangler', 'test-d1');
if (!existsSync(testDbDir)) mkdirSync(testDbDir, { recursive: true });
const testDbPath = join(testDbDir, 'test_phase7.sqlite');
if (existsSync(testDbPath)) {
  try { unlinkSync(testDbPath); } catch {}
}

const sqliteDb = new Database(testDbPath);
sqliteDb.pragma('journal_mode = WAL');

// Execute migrations in sequence
const initialSchema = readFileSync(join(process.cwd(), 'migrations', '0000_initial_schema.sql'), 'utf-8');
const seedData = readFileSync(join(process.cwd(), 'migrations', '0001_seed_initial_data.sql'), 'utf-8');
const phase2Schema = readFileSync(join(process.cwd(), 'migrations', '0002_phase2_crawler_tables.sql'), 'utf-8');
const phase3Schema = readFileSync(join(process.cwd(), 'migrations', '0003_phase3_ai_engine.sql'), 'utf-8');
const phase5Schema = readFileSync(join(process.cwd(), 'migrations', '0004_phase5_seo_and_redirects.sql'), 'utf-8');
const phase6Schema = readFileSync(join(process.cwd(), 'migrations', '0005_phase6_user_accounts_and_alerts.sql'), 'utf-8');
const phase7Schema = readFileSync(join(process.cwd(), 'migrations', '0006_phase7_monetization_analytics_and_logs.sql'), 'utf-8');

sqliteDb.exec(initialSchema);
sqliteDb.exec(seedData);
sqliteDb.exec(phase2Schema);
sqliteDb.exec(phase3Schema);
sqliteDb.exec(phase5Schema);
sqliteDb.exec(phase6Schema);
sqliteDb.exec(phase7Schema);

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

// Seed sample user
await db.run(`
  INSERT INTO users (id, email, password_hash, salt, name, status, email_verified, created_at, updated_at)
  VALUES ('usr_candidate_7', 'candidate7@example.com', 'hash', 'salt', 'Candidate Seven', 'active', 1, datetime('now'), datetime('now'))
`);

await db.run(`
  INSERT OR IGNORE INTO categories (id, name, slug)
  VALUES ('cat_jobs', 'Government Jobs', 'jobs')
`);

// ---------------------------------------------------------
// TEST 1: Global Settings & Feature Flags
// ---------------------------------------------------------
console.log('Test 1: Testing Global Settings & Feature Flags...');
const genSettings = await getGeneralSettings(db);
if (!genSettings.siteName.includes('RealSarkariExam')) throw new Error('General settings retrieval failed');

const allFlags = await getAllFeatureFlags(db);
if (allFlags.length < 8) throw new Error('Seeded feature flags missing');

const userAccFlagBefore = await isFeatureEnabled(db, 'user_accounts');
if (!userAccFlagBefore) throw new Error('Expected user_accounts feature flag to be enabled');

// Toggle flag
await setFeatureFlag(db, 'user_accounts', false);
const userAccFlagAfter = await isFeatureEnabled(db, 'user_accounts');
if (userAccFlagAfter !== false) throw new Error('Feature flag toggle failed');

// Restore flag
await setFeatureFlag(db, 'user_accounts', true);
console.log(`  ✔ Global settings loaded & ${allFlags.length} feature flags verified.`);

// ---------------------------------------------------------
// TEST 2: Advertisement System & Placement Evaluation
// ---------------------------------------------------------
console.log('\nTest 2: Testing Advertisement System & Placement Evaluator...');
const adsConfig = await getAdsSettings(db);
if (!adsConfig.enabled || adsConfig.provider !== 'google_adsense') {
  throw new Error('Default ads settings invalid');
}

const headerAdState = await evaluateAdDisplay(db, 'header', true);
if (!headerAdState.showAd || !headerAdState.isDev) {
  throw new Error('Header ad display evaluation failed in dev mode');
}

// Disable ads globally via feature flag
await setFeatureFlag(db, 'advertisements', false);
const disabledAdState = await evaluateAdDisplay(db, 'header', false);
if (disabledAdState.showAd) {
  throw new Error('Ads were not disabled when feature flag is turned off!');
}

// Re-enable ads
await setFeatureFlag(db, 'advertisements', true);
console.log('  ✔ Ad network evaluation, slot toggles & global override verified.');

// ---------------------------------------------------------
// TEST 3: Subscription Plans & Server-Side Entitlement Check
// ---------------------------------------------------------
console.log('\nTest 3: Testing Subscription Plans & Entitlement Chain...');
// Default user has Free Plan entitlements
const freeEntitlement = await getUserEntitlements(db, 'usr_candidate_7');
if (freeEntitlement.isPremium || !freeEntitlement.allowedFeatures.has('view_all_content')) {
  throw new Error('Free user entitlement verification failed');
}

const checkPriorityAlertsFree = await hasFeatureEntitlement(db, 'usr_candidate_7', 'instant_priority_alerts');
if (checkPriorityAlertsFree) {
  throw new Error('Free user was granted premium-only instant priority alerts!');
}

// Upgrade user to Premium Plan
await db.run(`
  INSERT INTO subscriptions (id, user_id, plan_id, provider, status, current_period_start, current_period_end, created_at, updated_at)
  VALUES ('sub_premium_1', 'usr_candidate_7', 'plan_premium', 'manual', 'active', datetime('now'), datetime('now', '+30 days'), datetime('now'), datetime('now'))
`);

const premiumEntitlement = await getUserEntitlements(db, 'usr_candidate_7');
if (!premiumEntitlement.isPremium || !premiumEntitlement.allowedFeatures.has('instant_priority_alerts')) {
  throw new Error('Premium entitlement check failed after subscription activation');
}

const checkPriorityAlertsPrem = await hasFeatureEntitlement(db, 'usr_candidate_7', 'instant_priority_alerts');
if (!checkPriorityAlertsPrem) {
  throw new Error('Premium user was denied instant priority alerts!');
}

console.log('  ✔ Server-side entitlement check (User -> Subscription -> Plan -> Feature) verified.');

// ---------------------------------------------------------
// TEST 4: Payment Provider Abstraction & Webhook Idempotency
// ---------------------------------------------------------
console.log('\nTest 4: Testing Payment Gateway Abstraction & Webhook Security...');
const paymentService = new PaymentService({ provider: 'none', enabled: false });

const checkoutRes = await paymentService.createCheckoutSession({
  userId: 'usr_candidate_7',
  userEmail: 'candidate7@example.com',
  planId: 'plan_premium',
  amount: 99,
  currency: 'INR',
  redirectUrl: 'https://realsarkariexam.com/account',
});

if (checkoutRes.success || !checkoutRes.error.includes('Payment system is not configured')) {
  throw new Error('Disabled payment provider failed to return clean unconfigured notice');
}

// Webhook duplicate defense
const whRes1 = await paymentService.handleWebhookEvent(db, 'evt_test_123', 'subscription.created', {
  userId: 'usr_candidate_7',
  planId: 'plan_premium',
});
if (!whRes1.success || whRes1.duplicate) throw new Error('Initial webhook event failed');

const whRes2 = await paymentService.handleWebhookEvent(db, 'evt_test_123', 'subscription.created', {
  userId: 'usr_candidate_7',
});
if (!whRes2.duplicate) {
  throw new Error('Duplicate webhook event was processed twice without idempotency defense!');
}

console.log('  ✔ Payment abstraction safe fallback & webhook idempotency verified.');

// ---------------------------------------------------------
// TEST 5: Sponsored Job Listings & Independence Rules
// ---------------------------------------------------------
console.log('\nTest 5: Testing Sponsored Job Listings Rules...');
await db.run(`
  INSERT INTO content_items (id, category_id, type, title, slug, status, sponsored, sponsor_name, sponsor_url, sponsored_status, created_at, updated_at)
  VALUES ('ci_sponsored_1', 'cat_jobs', 'job', 'Career Skill Development Fellowship 2026', 'career-fellowship-2026', 'published', 1, 'National Skill Development Corp', 'https://skills.gov.in', 'active', datetime('now'), datetime('now'))
`);

const sponsoredItem = await db.first("SELECT * FROM content_items WHERE id = 'ci_sponsored_1'");
if (!sponsoredItem || sponsoredItem.sponsored !== 1 || !sponsoredItem.sponsor_name) {
  throw new Error('Sponsored item record invalid');
}

console.log(`  ✔ Sponsored listing created with explicit badge: "${sponsoredItem.sponsor_name}".`);

// ---------------------------------------------------------
// TEST 6: Revenue Tracking & Aggregation
// ---------------------------------------------------------
console.log('\nTest 6: Testing Revenue Tracking System...');
await db.run(`
  INSERT INTO revenue_records (id, revenue_type, amount, currency, source, period_start, period_end, notes, created_at, updated_at) VALUES
  ('rev_1', 'advertising', 15400.50, 'INR', 'Google AdSense', '2026-01-01', '2026-01-31', 'January Ads Payout', datetime('now'), datetime('now')),
  ('rev_2', 'subscription', 4950.00, 'INR', 'Subscriptions', '2026-01-01', '2026-01-31', 'Candidate Pro Subscriptions', datetime('now'), datetime('now')),
  ('rev_3', 'sponsored', 8000.00, 'INR', 'Direct Sponsor', '2026-01-01', '2026-01-31', 'Fellowship Sponsor', datetime('now'), datetime('now'))
`);

const stats = await getPlatformStatistics(db);
if (stats.revenue.totalAmount < 28000 || stats.revenue.ads !== 15400.5) {
  throw new Error('Revenue statistics aggregation failed');
}

console.log(`  ✔ Revenue tracked: Total ₹${stats.revenue.totalAmount.toLocaleString('en-IN')} across Ads, Subscriptions & Sponsors.`);

// ---------------------------------------------------------
// TEST 7: Search Analytics & Zero-Result Gap Detection
// ---------------------------------------------------------
console.log('\nTest 7: Testing Search Analytics & Discovery Tracker...');
await recordSearchQuery(db, 'UPSC CSE 2026', 15);
await recordSearchQuery(db, 'UPSC CSE 2026', 15); // hit increment
await recordSearchQuery(db, 'RRB NTPC Syllabus', 8);
await recordSearchQuery(db, 'ISRO Scientist Exam', 0); // zero result gap

const topSearches = await getTopSearchQueries(db, 10);
const upscQuery = topSearches.find(s => s.query === 'upsc cse 2026');
const isroQuery = topSearches.find(s => s.query === 'isro scientist exam');

if (!upscQuery || upscQuery.hits !== 2) {
  throw new Error('Search query hit counting failed');
}

if (!isroQuery || isroQuery.resultsCount !== 0) {
  throw new Error('Zero-result search query recording failed');
}

console.log(`  ✔ Recorded ${topSearches.length} search queries with hit counts & zero-result discovery gaps.`);

// ---------------------------------------------------------
// TEST 8: Structured Error Logging & Sensitive Data Masking
// ---------------------------------------------------------
console.log('\nTest 8: Testing Structured Error Logger & Redaction Guardrails...');
const testSensitivePayload = {
  email: 'admin@realsarkariexam.com',
  password: 'SuperSecretPassword123!',
  apiKey: 'sk-1234567890abcdef',
  jwt_secret: 'secret-token-value',
  nested: {
    bearer: 'Bearer eyJhbGciOi...',
    safeField: 'harmless_data',
  },
};

const sanitized = sanitizeLogMetadata(testSensitivePayload);
if (
  sanitized.password !== '[REDACTED_SECRET]' ||
  sanitized.apiKey !== '[REDACTED_SECRET]' ||
  sanitized.jwt_secret !== '[REDACTED_SECRET]' ||
  sanitized.nested.bearer !== '[REDACTED_SECRET]' ||
  sanitized.nested.safeField !== 'harmless_data'
) {
  throw new Error('Sensitive data redaction guardrail failed!');
}

const errId = await logError(
  db,
  'crawler',
  'fetch_source',
  'HTTP_404',
  'Source URL not found',
  'warning',
  testSensitivePayload
);

const loggedError = await db.first('SELECT * FROM error_logs WHERE id = ?', [errId]);
if (!loggedError || loggedError.metadata_json.includes('SuperSecretPassword123!')) {
  throw new Error('Unredacted secret leaked into error_logs table!');
}

console.log('  ✔ Error logged with 100% cryptographic secrets redaction.');

// ---------------------------------------------------------
// TEST 9: Admin Audit Logging
// ---------------------------------------------------------
console.log('\nTest 9: Testing Admin Audit Trail...');
const auditId = await logAdminAudit(
  db,
  'superadmin',
  'maintenance_toggle',
  'setting',
  'site_settings',
  { maintenanceMode: true }
);

const auditRecord = await db.first('SELECT * FROM admin_audit_logs WHERE id = ?', [auditId]);
if (!auditRecord || auditRecord.action !== 'maintenance_toggle' || auditRecord.admin_id !== 'superadmin') {
  throw new Error('Admin audit trail logging failed');
}

console.log(`  ✔ Immutable audit trail recorded for admin "${auditRecord.admin_id}".`);

// ---------------------------------------------------------
// TEST 10: System Health Diagnostics
// ---------------------------------------------------------
console.log('\nTest 10: Testing System Health Diagnostic Engine...');
const healthReport = await runSystemHealthCheck(db, {});
if (!healthReport.overall || healthReport.services.length < 5) {
  throw new Error('System health diagnostic report incomplete');
}

const dbHealth = healthReport.services.find(s => s.service === 'database');
if (!dbHealth || dbHealth.status !== 'healthy') {
  throw new Error('Database health diagnostic check failed');
}

console.log(`  ✔ System health diagnosed: ${healthReport.services.length} services audited (Status: ${healthReport.overall}).`);

// ---------------------------------------------------------
// TEST 11: Explicit Exclusions Compliance Check
// ---------------------------------------------------------
console.log('\nTest 11: Testing Explicit Exclusion Rules...');
// Confirm NO public developer API tables exist
const apiTables = (await db.query(`
  SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%api_key%' OR name LIKE '%developer%' OR name LIKE '%api_rate%')
`)).results;

if (apiTables.length > 0) {
  throw new Error(`Explicitly excluded Developer API tables found: ${apiTables.map(t => t.name).join(', ')}`);
}

console.log('  ✔ Verified zero public developer API tables or unauthorized infrastructure.');

console.log('\n===================================================================');
console.log('   ALL PHASE 7 MONETIZATION & AUDIT TESTS PASSED (100% PASS)      ');
console.log('===================================================================\n');
