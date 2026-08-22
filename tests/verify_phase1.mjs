// tests/verify_phase1.mjs
import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

console.log('=== PHASE 1 INTEGRATION & VERIFICATION TEST ===\n');

// 1. Test D1 / SQLite Schema & Migrations
console.log('Step 1: Testing D1 Migrations and Schema...');
const testDbDir = join(process.cwd(), '.wrangler', 'local-d1');
if (!existsSync(testDbDir)) {
  mkdirSync(testDbDir, { recursive: true });
}
const dbPath = join(testDbDir, 'test.sqlite');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schemaSql = readFileSync(join(process.cwd(), 'migrations', '0000_initial_schema.sql'), 'utf8');
const seedSql = readFileSync(join(process.cwd(), 'migrations', '0001_seed_initial_data.sql'), 'utf8');

db.exec(schemaSql);
db.exec(seedSql);
console.log('✔ Migrations executed successfully.');

// 2. Validate Tables
const tables = [
  'admins',
  'sources',
  'categories',
  'organizations',
  'content_items',
  'jobs',
  'source_documents',
  'seo_metadata',
  'settings'
];

for (const t of tables) {
  const info = db.prepare(`SELECT count(*) as count FROM ${t}`).get();
  console.log(`✔ Table "${t}" verified. Rows count: ${info.count}`);
}

// 3. Verify Seed Data
const initialCategories = db.prepare('SELECT count(*) as count FROM categories').get();
if (initialCategories.count >= 9) {
  console.log(`✔ Initial 9 categories verified in DB: count = ${initialCategories.count}`);
} else {
  throw new Error(`Expected at least 9 categories, got ${initialCategories.count}`);
}

// 4. Test Crypto & Password Verification
console.log('\nStep 2: Testing Web Crypto PBKDF2 Password Hashing...');
const PBKDF2_ITERATIONS = 100_000;
const HASH_ALGORITHM = 'SHA-256';

async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const derivedKey = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: HASH_ALGORITHM
    },
    keyMaterial,
    256
  );

  const hashArray = Array.from(new Uint8Array(derivedKey));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const testSalt = '6f8e7d2a1b9c3e4f';
const testPassword = 'Admin@12345';
const hash = await hashPassword(testPassword, testSalt);

const adminRow = db.prepare('SELECT * FROM admins WHERE email = ?').get('admin@sarkariinfo.org');
if (adminRow && adminRow.password_hash === hash) {
  console.log('✔ Default Admin credentials verified with PBKDF2 matching seed hash.');
} else {
  console.log('Seed hash:', adminRow?.password_hash);
  console.log('Computed hash:', hash);
  throw new Error('Admin password hash mismatch.');
}

// 5. Test CRUD Flow
console.log('\nStep 3: Testing Admin CRUD Operations in D1...');

// Create Organization
const orgId = 'org_test_upsc';
db.prepare(`
  INSERT OR REPLACE INTO organizations (id, name, slug, website, description, status)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(orgId, 'Union Public Service Commission', 'upsc', 'https://upsc.gov.in', 'Premier civil services exam board', 'active');

// Create Source
const srcId = 'src_test_upsc';
db.prepare(`
  INSERT OR REPLACE INTO sources (id, name, base_url, source_type, priority, trust_level, crawl_frequency, parser_type, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(srcId, 'UPSC Official RSS', 'https://upsc.gov.in/feed', 'RSS', 1, 5, 'hourly', 'rss_atom', 'active');

// Create Content Item & Job Details
const contentId = 'cnt_test_nda';
db.prepare(`
  INSERT OR REPLACE INTO content_items (id, type, title, slug, organization_id, category_id, status, source_id, published_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
`).run(contentId, 'job', 'UPSC NDA & NA (I) Examination 2026 Online Form', 'upsc-nda-na-1-2026', orgId, 'cat_gov_jobs', 'published', srcId);

db.prepare(`
  INSERT OR REPLACE INTO jobs (id, content_item_id, post_name, vacancy, qualification, application_last_date, official_apply_url, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run('job_test_nda', contentId, 'National Defence Academy Officers', '400 Posts', '12th Pass with PCM', '2026-09-30', 'https://upsconline.nic.in', 'active');

db.prepare(`
  INSERT OR REPLACE INTO seo_metadata (id, content_item_id, meta_title, meta_description)
  VALUES (?, ?, ?, ?)
`).run('seo_test_nda', contentId, 'UPSC NDA 1 2026 Notification - Apply for 400 Posts', 'Check UPSC NDA 1 eligibility, vacancy, exam date, and apply online.');

// Read back Joined Record
const item = db.prepare(`
  SELECT ci.*, c.name as category_name, o.name as organization_name, j.vacancy, j.qualification, sm.meta_title
  FROM content_items ci
  LEFT JOIN categories c ON c.id = ci.category_id
  LEFT JOIN organizations o ON o.id = ci.organization_id
  LEFT JOIN jobs j ON j.content_item_id = ci.id
  LEFT JOIN seo_metadata sm ON sm.content_item_id = ci.id
  WHERE ci.id = ?
`).get(contentId);

console.log('✔ Created and read joined Content Item:');
console.log(`  - Title: ${item.title}`);
console.log(`  - Category: ${item.category_name}`);
console.log(`  - Organization: ${item.organization_name}`);
console.log(`  - Vacancy: ${item.vacancy}`);
console.log(`  - SEO Title: ${item.meta_title}`);

console.log('\n========================================');
console.log(' ALL PHASE 1 CORE TESTS PASSED SUCCESSFULLY! ');
console.log('========================================\n');
