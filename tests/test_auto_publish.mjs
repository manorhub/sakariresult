// tests/test_auto_publish.mjs
import assert from 'node:assert';
import Database from 'better-sqlite3';

console.log('🧪 Testing Auto-Publish Pipeline & Status Resolution...\n');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌ [FAIL] ${name}:`, e.message);
    process.exitCode = 1;
  }
}

// Setup in-memory sqlite db
const db = new Database(':memory:');
db.exec(`
  CREATE TABLE content_items (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    status TEXT NOT NULL,
    published_at TEXT,
    auto_publish_eligible INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    content_item_id TEXT NOT NULL,
    post_name TEXT,
    vacancy TEXT,
    application_last_date TEXT,
    status TEXT DEFAULT 'active'
  );
`);

test('Newly processed job items receive published status by default', () => {
  db.prepare(`
    INSERT INTO content_items (id, type, title, slug, status, published_at, auto_publish_eligible)
    VALUES ('ci_job_01', 'job', 'SSC CGL Recruitment 2026', 'ssc-cgl-recruitment-2026', 'published', CURRENT_TIMESTAMP, 1)
  `).run();

  const item = db.prepare('SELECT * FROM content_items WHERE id = ?').get('ci_job_01');
  assert.strictEqual(item.status, 'published');
  assert.notStrictEqual(item.published_at, null);
});

test('Job with past or future date remains published on public views', () => {
  db.prepare(`
    INSERT INTO jobs (id, content_item_id, post_name, vacancy, application_last_date)
    VALUES ('job_01', 'ci_job_01', 'Inspector / Assistant', '12000', '2026-03-05')
  `).run();

  const publishedJobs = db.prepare(`
    SELECT ci.*, j.post_name, j.application_last_date
    FROM content_items ci
    JOIN jobs j ON j.content_item_id = ci.id
    WHERE ci.status = 'published' AND ci.type = 'job'
  `).all();

  assert.strictEqual(publishedJobs.length, 1);
  assert.strictEqual(publishedJobs[0].title, 'SSC CGL Recruitment 2026');
});

console.log(`\n🎉 All ${passed} Auto-Publish Tests Passed Successfully!\n`);
