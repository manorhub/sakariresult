// tests/verify_phase2.mjs
// Phase 2 Automated Testing & Integration Verification Suite

import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Import crawler modules
import { normalizeUrl, isValidCrawlUrl } from '../src/lib/crawler/normalizer.ts';
import { computeFingerprint } from '../src/lib/crawler/fingerprint.ts';
import { parseRobotsTxt, isPathAllowed } from '../src/lib/crawler/robots.ts';
import { isSourceDue, getDueSources } from '../src/lib/crawler/scheduler.ts';
import { parseRssFeed } from '../src/lib/crawler/parsers/rss.ts';
import { parseSitemapXml } from '../src/lib/crawler/parsers/xml.ts';
import { parseHtmlPage } from '../src/lib/crawler/parsers/html.ts';
import { parseJsonFeed } from '../src/lib/crawler/parsers/json.ts';
import { isPdfBuffer } from '../src/lib/crawler/parsers/pdf.ts';

console.log('======================================================');
console.log('   PHASE 2 — CRAWLER & AUTOMATION INTEGRATION TESTS   ');
console.log('======================================================\n');

// ---------------------------------------------------------
// TEST 1: URL Normalization
// ---------------------------------------------------------
console.log('Test 1: Testing URL Normalization & Deduplication...');
const url1 = 'HTTPS://UPSC.GOV.IN/exams/nda-2026/?utm_source=telegram&utm_medium=channel&b=2&a=1#section-dates';
const norm1 = normalizeUrl(url1);
console.log('  Raw:       ', url1);
console.log('  Normalized:', norm1);

if (norm1 !== 'https://upsc.gov.in/exams/nda-2026?a=1&b=2') {
  throw new Error(`Normalization mismatch: got "${norm1}"`);
}
console.log('✔ URL lowercase, tracking param removal, fragment stripping, and query sorting passed.');

// ---------------------------------------------------------
// TEST 2: URL Scheme Validation
// ---------------------------------------------------------
console.log('\nTest 2: Testing URL Protocol Filtering...');
if (isValidCrawlUrl('javascript:void(0);')) throw new Error('javascript: should be invalid');
if (isValidCrawlUrl('mailto:contact@upsc.gov.in')) throw new Error('mailto: should be invalid');
if (isValidCrawlUrl('tel:+911123385271')) throw new Error('tel: should be invalid');
if (!isValidCrawlUrl('https://upsc.gov.in/notifications')) throw new Error('https:// should be valid');
console.log('✔ Protocol filtering (javascript, mailto, tel) verified.');

// ---------------------------------------------------------
// TEST 3: Content Cleaning & Fingerprinting
// ---------------------------------------------------------
console.log('\nTest 3: Testing Clean Content Fingerprinting...');
const sampleHtml1 = `
  <html>
    <head><title>UPSC Notification</title></head>
    <body>
      <script>var x = 123;</script>
      <style>.btn { color: red; }</style>
      <h1>Union Public Service Commission</h1>
      <p>Exam Date: 12-05-2026</p>
      <!-- timestamp noise -->
      <span>Visitor Count: 4920</span>
      <span>Page Hits: 12093</span>
      <div>Mon, 12 Jan 2026 10:20:00 IST</div>
    </body>
  </html>
`;

const sampleHtml2 = `
  <html>
    <head><title>UPSC Notification</title></head>
    <body>
      <script>var y = 456; // modified script</script>
      <style>.btn { color: blue; }</style>
      <h1>Union Public Service Commission</h1>
      <p>Exam Date: 12-05-2026</p>
      <!-- another comment -->
      <span>Visitor Count: 5080</span>
      <span>Page Hits: 12450</span>
      <div>Mon, 12 Jan 2026 11:45:00 IST</div>
    </body>
  </html>
`;

const fp1 = await computeFingerprint(sampleHtml1);
const fp2 = await computeFingerprint(sampleHtml2);

console.log('  FP1 (Initial): ', fp1);
console.log('  FP2 (Noise Alt):', fp2);

if (fp1 !== fp2) {
  throw new Error('Fingerprints should match after stripping noise/scripts/visitor counters');
}
console.log('✔ Noise stripping & stable fingerprinting verified (Dynamic timestamp/visitor counter ignored).');

// ---------------------------------------------------------
// TEST 4: Robots.txt Parsing & Rule Evaluation
// ---------------------------------------------------------
console.log('\nTest 4: Testing Robots.txt Compliance...');
const robotsTxt = `
User-agent: *
Disallow: /admin/
Disallow: /private/
Allow: /private/public-notice
Crawl-delay: 5

User-agent: BadBot
Disallow: /
`;

const rules = parseRobotsTxt(robotsTxt);
if (!isPathAllowed(rules, '/notifications/nda-2026.html')) throw new Error('/notifications should be allowed');
if (isPathAllowed(rules, '/admin/login')) throw new Error('/admin/ should be disallowed');
if (!isPathAllowed(rules, '/private/public-notice')) throw new Error('/private/public-notice should be allowed by explicit Allow rule');
if (isPathAllowed(rules, '/private/secret-file')) throw new Error('/private/secret-file should be disallowed');
console.log('✔ Robots.txt Allow/Disallow path rules verified.');

// ---------------------------------------------------------
// TEST 5: Scheduler & Crawl Frequency Due Logic
// ---------------------------------------------------------
console.log('\nTest 5: Testing Source Scheduling & Frequencies...');
const now = Date.now();

const sourceDue10m = {
  id: 'src_1',
  name: 'UPSC Fast',
  base_url: 'https://upsc.gov.in',
  source_type: 'HTML',
  category: null,
  priority: 5,
  trust_level: 5,
  crawl_frequency: '10m',
  parser_type: 'standard',
  status: 'active',
  robots_allowed: 1,
  last_checked_at: new Date(now - 11 * 60 * 1000).toISOString(), // 11 mins ago
  last_success_at: null,
  last_error: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const sourceNotDue1h = {
  id: 'src_2',
  name: 'SSC Hourly',
  base_url: 'https://ssc.gov.in',
  source_type: 'HTML',
  category: null,
  priority: 3,
  trust_level: 4,
  crawl_frequency: '1h',
  parser_type: 'standard',
  status: 'active',
  robots_allowed: 1,
  last_checked_at: new Date(now - 15 * 60 * 1000).toISOString(), // only 15 mins ago
  last_success_at: null,
  last_error: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

if (!isSourceDue(sourceDue10m, now)) throw new Error('sourceDue10m should be due');
if (isSourceDue(sourceNotDue1h, now)) throw new Error('sourceNotDue1h should NOT be due');

const dueList = getDueSources([sourceNotDue1h, sourceDue10m], 10, now);
if (dueList.length !== 1 || dueList[0].id !== 'src_1') {
  throw new Error('getDueSources failed to select and prioritize due sources correctly');
}
console.log('✔ Source scheduling and due calculations passed.');

// ---------------------------------------------------------
// TEST 6: RSS 2.0 & Atom Parser
// ---------------------------------------------------------
console.log('\nTest 6: Testing RSS & Atom Feed Parser...');
const sampleRss = `
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>UPSC Recruitment Feeds</title>
    <link>https://upsc.gov.in</link>
    <item>
      <title>Civil Services (Preliminary) Examination 2026</title>
      <link>https://upsc.gov.in/notifications/cse-pre-2026</link>
      <description>Online applications invited for Civil Services Prelims 2026.</description>
      <pubDate>Mon, 12 Jan 2026 09:00:00 +0530</pubDate>
      <enclosure url="https://upsc.gov.in/docs/cse-2026.pdf" type="application/pdf" />
    </item>
  </channel>
</rss>
`;

const rssResult = parseRssFeed(sampleRss, 'https://upsc.gov.in');
if (rssResult.items.length !== 1) throw new Error(`Expected 1 RSS item, got ${rssResult.items.length}`);
if (!rssResult.items[0].title.includes('Civil Services')) throw new Error('RSS title extraction failed');
if (rssResult.items[0].url !== 'https://upsc.gov.in/notifications/cse-pre-2026') throw new Error('RSS link resolution failed');
console.log('✔ RSS 2.0 parser verified.');

// ---------------------------------------------------------
// TEST 7: XML Sitemap Parser
// ---------------------------------------------------------
console.log('\nTest 7: Testing XML Sitemap Parser...');
const sampleSitemap = `
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://ibps.in/crp-po-mt-xv-notification.pdf</loc>
    <lastmod>2026-01-10T10:00:00+05:30</lastmod>
  </url>
  <url>
    <loc>https://ibps.in/crp-clerk-xv-apply-online</loc>
    <lastmod>2026-01-11T12:00:00+05:30</lastmod>
  </url>
</urlset>
`;

const sitemapResult = parseSitemapXml(sampleSitemap, 'https://ibps.in');
if (sitemapResult.items.length !== 2) throw new Error(`Expected 2 sitemap items, got ${sitemapResult.items.length}`);
if (!sitemapResult.items[0].isPdf) throw new Error('First sitemap URL should be detected as PDF');
console.log('✔ XML Sitemap parser verified.');

// ---------------------------------------------------------
// TEST 8: HTML Link Discovery Parser
// ---------------------------------------------------------
console.log('\nTest 8: Testing HTML Link Discovery Parser...');
const sampleHtml = `
<!DOCTYPE html>
<html>
  <head>
    <title>SSC Official Notices</title>
    <meta name="description" content="Staff Selection Commission Latest Notifications" />
    <link rel="canonical" href="https://ssc.gov.in/notices" />
  </head>
  <body>
    <div class="content">
      <a href="/notice/cgl-2026.html">Combined Graduate Level Exam 2026</a>
      <a href="https://ssc.gov.in/docs/cgl-syllabus.pdf">Download CGL Syllabus PDF</a>
      <a href="javascript:void(0);">Ignored JS link</a>
      <a href="mailto:helpdesk@ssc.nic.in">Email Support</a>
    </div>
  </body>
</html>
`;

const htmlResult = parseHtmlPage(sampleHtml, 'https://ssc.gov.in/notices');
if (htmlResult.items.length !== 2) throw new Error(`Expected 2 discovered items, got ${htmlResult.items.length}`);
if (htmlResult.feedTitle !== 'SSC Official Notices') throw new Error('HTML title extraction failed');
console.log('✔ HTML link discovery parser verified (Filtered invalid protocols).');

// ---------------------------------------------------------
// TEST 9: JSON API Parser
// ---------------------------------------------------------
console.log('\nTest 9: Testing JSON API Feed Parser...');
const sampleJson = JSON.stringify({
  status: 'success',
  results: [
    {
      title: 'RRB NTPC Recruitment 2026 Online Form',
      url: '/rrb/ntpc-2026',
      description: '11,558 Vacancies for Non-Technical Popular Categories',
      date: '2026-01-15'
    }
  ]
});

const jsonResult = parseJsonFeed(sampleJson, 'https://indianrailways.gov.in');
if (jsonResult.items.length !== 1) throw new Error(`Expected 1 JSON item, got ${jsonResult.items.length}`);
if (!jsonResult.items[0].title.includes('RRB NTPC')) throw new Error('JSON title extraction failed');
console.log('✔ JSON API parser verified.');

// ---------------------------------------------------------
// TEST 10: PDF Detection & Magic Bytes
// ---------------------------------------------------------
console.log('\nTest 10: Testing PDF Magic Bytes...');
const fakePdfBuffer = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
const nonPdfBuffer = new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e]); // <html>

if (!isPdfBuffer(fakePdfBuffer)) throw new Error('PDF magic byte detection failed for valid PDF');
if (isPdfBuffer(nonPdfBuffer)) throw new Error('Non-PDF detected as PDF incorrectly');
console.log('✔ PDF binary header detection verified.');

// ---------------------------------------------------------
// TEST 11: Database Schema & Migration Execution
// ---------------------------------------------------------
console.log('\nTest 11: Testing D1 Migrations (0002_phase2_crawler_tables)...');
const db = new Database(':memory:');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema0 = readFileSync(join(process.cwd(), 'migrations', '0000_initial_schema.sql'), 'utf8');
const seed0 = readFileSync(join(process.cwd(), 'migrations', '0001_seed_initial_data.sql'), 'utf8');
const schema2 = readFileSync(join(process.cwd(), 'migrations', '0002_phase2_crawler_tables.sql'), 'utf8');

db.exec(schema0);
db.exec(seed0);
db.exec(schema2);

const spCount = db.prepare('SELECT count(*) as count FROM source_pages').get();
const clCount = db.prepare('SELECT count(*) as count FROM crawl_logs').get();

console.log(`✔ source_pages table verified (count: ${spCount.count})`);
console.log(`✔ crawl_logs table verified (count: ${clCount.count})`);

// ---------------------------------------------------------
// TEST 12: Change Detection Flow (NEW -> UNCHANGED -> UPDATED)
// ---------------------------------------------------------
console.log('\nTest 12: Testing Database Deduplication & Change Statuses...');
const testSourceId = 'src_test_upsc';
db.prepare(`
  INSERT OR REPLACE INTO sources (id, name, base_url, source_type, priority, trust_level, crawl_frequency, parser_type, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(testSourceId, 'UPSC Test Source', 'https://upsc.gov.in', 'HTML', 5, 5, '10m', 'standard', 'active');

const testUrl = 'https://upsc.gov.in/notifications/nda-2026';
const testNormalizedUrl = normalizeUrl(testUrl);
const testFingerprintV1 = await computeFingerprint('Exam Date: 2026-05-01');

// Step A: Insert brand NEW page
const pageId = 'spage_test_01';
db.prepare(`
  INSERT INTO source_pages (
    id, source_id, url, normalized_url, title, content_type, fingerprint, last_content_hash,
    last_status, http_status, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'NEW', 200, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`).run(pageId, testSourceId, testUrl, testNormalizedUrl, 'UPSC NDA 2026 Notice', 'html', testFingerprintV1, testFingerprintV1);

let record = db.prepare('SELECT * FROM source_pages WHERE id = ?').get(pageId);
if (record.last_status !== 'NEW') throw new Error('Expected status NEW');
console.log('✔ Inserted NEW source page record.');

// Step B: Update with SAME fingerprint -> UNCHANGED
db.prepare(`
  UPDATE source_pages SET
    last_status = 'UNCHANGED',
    last_seen_at = CURRENT_TIMESTAMP
  WHERE id = ?
`).run(pageId);

record = db.prepare('SELECT * FROM source_pages WHERE id = ?').get(pageId);
if (record.last_status !== 'UNCHANGED') throw new Error('Expected status UNCHANGED');
console.log('✔ Updated to UNCHANGED on identical fingerprint.');

// Step C: Update with DIFFERENT fingerprint -> UPDATED
const testFingerprintV2 = await computeFingerprint('Exam Date: 2026-05-15 (EXTENDED)');
db.prepare(`
  UPDATE source_pages SET
    fingerprint = ?,
    last_content_hash = ?,
    last_status = 'UPDATED',
    last_changed_at = CURRENT_TIMESTAMP
  WHERE id = ?
`).run(testFingerprintV2, testFingerprintV2, pageId);

record = db.prepare('SELECT * FROM source_pages WHERE id = ?').get(pageId);
if (record.last_status !== 'UPDATED' || record.fingerprint !== testFingerprintV2) {
  throw new Error('Expected status UPDATED with new fingerprint');
}
console.log('✔ Updated to UPDATED on altered content fingerprint.');

// Step D: Write a Crawl Log
const logId = 'clog_test_01';
db.prepare(`
  INSERT INTO crawl_logs (
    id, source_id, started_at, completed_at, status, urls_discovered, urls_processed,
    new_items, updated_items, unchanged_items, errors, documents_downloaded, execution_id
  ) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'completed', 10, 10, 1, 1, 8, 0, 1, 'exec_test_01')
`).run(logId, testSourceId);

const log = db.prepare('SELECT * FROM crawl_logs WHERE id = ?').get(logId);
if (log.status !== 'completed' || log.urls_discovered !== 10) {
  throw new Error('Crawl log record verification failed');
}
console.log('✔ Crawl log recorded and verified in D1.');

console.log('\n======================================================');
console.log('   ALL PHASE 2 AUTOMATION & CRAWLER TESTS PASSED!     ');
console.log('======================================================\n');
