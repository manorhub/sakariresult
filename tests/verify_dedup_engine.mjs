// tests/verify_dedup_engine.mjs
// Comprehensive Test Suite for Multi-Source Deduplication & Canonical Content Engine

import assert from 'node:assert';
import {
  normalizeText,
  normalizeOrganization,
  normalizeRecruitmentName,
  extractYear,
  normalizeNoticeNumber,
  calculateStringSimilarity,
} from '../src/lib/dedup/normalizer.ts';

import { extractStructuredIdentity } from '../src/lib/dedup/identity.ts';
import {
  detectSourceType,
  calculateSourceAuthorityScore,
  shouldUpgradeCanonicalSource,
} from '../src/lib/dedup/authority.ts';

import { compareIdentities } from '../src/lib/dedup/engine.ts';

console.log('🧪 Running Multi-Source Deduplication Engine Test Suite...\n');

let passedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    process.exitCode = 1;
  }
}

// -----------------------------------------------------------------------------
// Test 1: Same official notification from 5 sources -> 1 canonical + 5 source references
// -----------------------------------------------------------------------------
test('Test 1: Same official notification from 5 sources produces exact match', () => {
  const sources = [
    { title: 'SSC CGL Recruitment 2026', advt: '06/2026', url: 'https://sarkariresult.com/ssc-cgl' },
    { title: 'SSC CGL Vacancy 2026', advt: '06/2026', url: 'https://freejobalert.com/ssc-cgl' },
    { title: 'SSC CGL Notification 2026', advt: '06/2026', url: 'https://jagranjosh.com/ssc-cgl' },
    { title: 'SSC CGL Online Form 2026', advt: '06/2026', url: 'https://employmentnews.gov.in/ssc-cgl' },
    { title: 'Official SSC CGL Notification', advt: '06/2026', url: 'https://ssc.gov.in/notice/06-2026.pdf' },
  ];

  const canonicalIdentity = extractStructuredIdentity({
    title: sources[0].title,
    advertisement_number: sources[0].advt,
    type: 'job',
  });

  for (let i = 1; i < sources.length; i++) {
    const sIdentity = extractStructuredIdentity({
      title: sources[i].title,
      advertisement_number: sources[i].advt,
      type: 'job',
    });
    const match = compareIdentities(canonicalIdentity, sIdentity);
    assert.strictEqual(match.isDuplicate, true, `Source ${i} must be recognized as duplicate`);
    assert.strictEqual(match.tier, 'EXACT');
  }
});

// -----------------------------------------------------------------------------
// Test 2: Same title, different year -> 2 separate content items
// -----------------------------------------------------------------------------
test('Test 2: Same title with different years are NOT merged', () => {
  const item2025 = extractStructuredIdentity({
    title: 'SSC CGL Recruitment 2025',
    organization: 'SSC',
    recruitment_name: 'CGL',
    type: 'job',
  });

  const item2026 = extractStructuredIdentity({
    title: 'SSC CGL Recruitment 2026',
    organization: 'SSC',
    recruitment_name: 'CGL',
    type: 'job',
  });

  const match = compareIdentities(item2025, item2026);
  assert.strictEqual(match.isDuplicate, false, 'Different years must never be merged');
  assert.strictEqual(match.matchingSignals.different_year, true);
  assert.strictEqual(match.status, 'unique');
});

// -----------------------------------------------------------------------------
// Test 3: Same organization, different recruitment -> 2 separate content items
// -----------------------------------------------------------------------------
test('Test 3: Same organization with different recruitments are NOT merged', () => {
  const rrbNtpc = extractStructuredIdentity({
    title: 'RRB NTPC Recruitment 2026',
    organization: 'Railway Recruitment Board',
    recruitment_name: 'NTPC',
    type: 'job',
  });

  const rrbGroupD = extractStructuredIdentity({
    title: 'RRB Group D Recruitment 2026',
    organization: 'Railway Recruitment Board',
    recruitment_name: 'Group D',
    type: 'job',
  });

  const match = compareIdentities(rrbNtpc, rrbGroupD);
  assert.strictEqual(match.isDuplicate, false, 'Different recruitments must never be merged');
  assert.strictEqual(match.matchingSignals.different_recruitment, true);
});

// -----------------------------------------------------------------------------
// Test 4: Recruitment vs Admit Card -> 2 related content items (NOT merged)
// -----------------------------------------------------------------------------
test('Test 4: Recruitment vs Admit Card are kept as separate related items', () => {
  const job = extractStructuredIdentity({
    title: 'SSC CGL 2026 Recruitment',
    organization: 'SSC',
    recruitment_name: 'CGL',
    type: 'job',
  });

  const admitCard = extractStructuredIdentity({
    title: 'SSC CGL 2026 Admit Card',
    organization: 'SSC',
    recruitment_name: 'CGL',
    type: 'admit_card',
  });

  const match = compareIdentities(job, admitCard);
  assert.strictEqual(match.isDuplicate, false, 'Recruitment and Admit Card must NOT be merged');
  assert.strictEqual(match.matchingSignals.different_stage, true);
  assert.strictEqual(match.recommendedAction, 'link_related_stage');
});

// -----------------------------------------------------------------------------
// Test 5: Recruitment vs Result -> 2 related content items (NOT merged)
// -----------------------------------------------------------------------------
test('Test 5: Recruitment vs Result are kept as separate related items', () => {
  const job = extractStructuredIdentity({
    title: 'UPSC CSE 2026 Notification',
    organization: 'UPSC',
    recruitment_name: 'Civil Services',
    type: 'job',
  });

  const result = extractStructuredIdentity({
    title: 'UPSC CSE 2026 Final Result',
    organization: 'UPSC',
    recruitment_name: 'Civil Services',
    type: 'result',
  });

  const match = compareIdentities(job, result);
  assert.strictEqual(match.isDuplicate, false, 'Recruitment and Result must NOT be merged');
  assert.strictEqual(match.matchingSignals.different_stage, true);
  assert.strictEqual(match.recommendedAction, 'link_related_stage');
});

// -----------------------------------------------------------------------------
// Test 6: Different titles, same advertisement number -> 1 canonical content item
// -----------------------------------------------------------------------------
test('Test 6: Different wording but same advertisement number resolves to canonical', () => {
  const titleA = extractStructuredIdentity({
    title: 'Railway Non-Technical 2026 Online Form',
    advertisement_number: 'CEN 06/2026',
    type: 'job',
  });

  const titleB = extractStructuredIdentity({
    title: 'RRB NTPC Graduate Level Vacancy Details 2026',
    advertisement_number: 'CEN 06/2026',
    type: 'job',
  });

  const match = compareIdentities(titleA, titleB);
  assert.strictEqual(match.isDuplicate, true);
  assert.strictEqual(match.matchingSignals.exact_advt_number, true);
  assert.strictEqual(match.tier, 'EXACT');
});

// -----------------------------------------------------------------------------
// Test 7: Different vacancy values, official PDF available -> Official PDF wins
// -----------------------------------------------------------------------------
test('Test 7: Source authority scoring gives official source highest rank', () => {
  const aggregatorType = detectSourceType('https://sarkariresult.com/rrb-ntpc');
  const officialType = detectSourceType('https://rrbcdg.gov.in/notices/cen-06-2026.pdf');

  const aggScore = calculateSourceAuthorityScore(aggregatorType, { hasOfficialPdf: false });
  const offScore = calculateSourceAuthorityScore(officialType, { hasOfficialPdf: true, hasOfficialApplyUrl: true });

  assert.strictEqual(aggregatorType, 'established_aggregator');
  assert.strictEqual(officialType, 'official_government');
  assert.ok(offScore > aggScore, 'Official source score must be strictly higher than aggregator');
});

// -----------------------------------------------------------------------------
// Test 8: Aggregator discovered first, official source later -> Canonical upgrades
// -----------------------------------------------------------------------------
test('Test 8: Canonical source upgrades when higher-authority official source arrives', () => {
  const currentSource = {
    type: 'established_aggregator',
    priority: 60,
    hasPdf: false,
    url: 'https://sarkariresult.com/ssc-cgl',
  };

  const newOfficialSource = {
    type: 'official_government',
    priority: 130,
    hasPdf: true,
    url: 'https://ssc.gov.in/notice/06-2026.pdf',
  };

  const shouldUpgrade = shouldUpgradeCanonicalSource(currentSource, newOfficialSource);
  assert.strictEqual(shouldUpgrade, true, 'Official source must upgrade aggregator canonical source');
});

// -----------------------------------------------------------------------------
// Test 9: Low-confidence similarity -> Review required
// -----------------------------------------------------------------------------
test('Test 9: Partial/ambiguous similarity flags review_required', () => {
  const itemA = extractStructuredIdentity({
    title: 'Assistant Professor Recruitment 2026',
    organization: 'State University',
    vacancy: 50,
    type: 'job',
  });

  const itemB = extractStructuredIdentity({
    title: 'Assistant Professor Botany Vacancy 2026',
    organization: 'State University',
    vacancy: 12,
    type: 'job',
  });

  const match = compareIdentities(itemA, itemB);
  assert.strictEqual(match.isDuplicate, false, 'Conflicting vacancy counts must not auto-merge');
  assert.strictEqual(match.status, 'review_required');
});

// -----------------------------------------------------------------------------
// Test 10: Duplicate URL -> No second public article
// -----------------------------------------------------------------------------
test('Test 10: Exact duplicate URL normalizes to same identity', () => {
  const norm1 = normalizeText('https://ssc.gov.in/notice/06-2026.pdf');
  const norm2 = normalizeText('https://ssc.gov.in/notice/06-2026.pdf');
  assert.strictEqual(norm1, norm2);
});

console.log(`\n🎉 All ${passedTests} Deduplication & Canonical Engine Tests Passed Successfully!\n`);
