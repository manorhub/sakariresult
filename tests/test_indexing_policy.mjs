// tests/test_indexing_policy.mjs
import assert from 'node:assert';
import { isJobPostingUrlOrType } from '../src/lib/seo/google-indexing.ts';

console.log('🧪 Testing Google Instant Indexing API Policy Filtering...\n');

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

test('Job URLs are eligible for Google Indexing API', () => {
  assert.strictEqual(isJobPostingUrlOrType('https://realsarkariexam.com/jobs/upsc-cse-2026'), true);
  assert.strictEqual(isJobPostingUrlOrType('https://realsarkariexam.com/jobs/ssc-cgl-recruitment-2026'), true);
});

test('Content type "job" and "government_job" are eligible', () => {
  assert.strictEqual(isJobPostingUrlOrType('', 'job'), true);
  assert.strictEqual(isJobPostingUrlOrType('', 'government_job'), true);
});

test('Result URLs (/results/*) are strictly excluded from Indexing API', () => {
  assert.strictEqual(isJobPostingUrlOrType('https://realsarkariexam.com/results/upsc-cse-final-result'), false);
  assert.strictEqual(isJobPostingUrlOrType('', 'result'), false);
});

test('Admit Card URLs (/admit-card/*) are strictly excluded from Indexing API', () => {
  assert.strictEqual(isJobPostingUrlOrType('https://realsarkariexam.com/admit-card/rrb-ntpc-hall-ticket'), false);
  assert.strictEqual(isJobPostingUrlOrType('', 'admit_card'), false);
});

test('Answer Key URLs (/answer-key/*) are strictly excluded from Indexing API', () => {
  assert.strictEqual(isJobPostingUrlOrType('https://realsarkariexam.com/answer-key/ssc-cgl-tier-1'), false);
  assert.strictEqual(isJobPostingUrlOrType('', 'answer_key'), false);
});

test('Syllabus, Schemes, and Exams are strictly excluded from Indexing API', () => {
  assert.strictEqual(isJobPostingUrlOrType('https://realsarkariexam.com/syllabus/upsc-cse-syllabus'), false);
  assert.strictEqual(isJobPostingUrlOrType('https://realsarkariexam.com/schemes/pm-kisan-yojana'), false);
  assert.strictEqual(isJobPostingUrlOrType('https://realsarkariexam.com/exams/upsc-annual-calendar'), false);
  assert.strictEqual(isJobPostingUrlOrType('', 'syllabus'), false);
  assert.strictEqual(isJobPostingUrlOrType('', 'scheme'), false);
});

console.log(`\n🎉 All ${passed} Google Indexing Policy Tests Passed Successfully!\n`);
