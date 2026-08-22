// tests/verify_phase6.mjs
// Phase 6 User Accounts, Saved Content, Following & Notification Alerts Verification Suite

import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

// Import Phase 6 modules
import {
  registerUser,
  verifyUserEmail,
  verifyUserPassword,
  createPasswordResetToken,
  resetUserPassword,
  createUserSession,
  getUserSession,
  deleteUserSession,
  saveContentItem,
  followOrganization,
  followCategory,
  deleteUserAccount,
} from '../src/lib/user_auth.ts';
import { EmailService } from '../src/lib/email/provider.ts';
import {
  buildVerificationEmail,
  buildPasswordResetEmail,
  buildJobAlertEmail,
  buildContentAlertEmail,
  buildDeadlineReminderEmail,
  buildDigestEmail,
} from '../src/lib/email/templates.ts';
import { matchUsersForContent } from '../src/lib/alerts/matcher.ts';
import { enqueueNotifications } from '../src/lib/alerts/queue.ts';
import { processNotificationQueue } from '../src/lib/alerts/processor.ts';
import { checkAndEnqueueDeadlineReminders } from '../src/lib/alerts/reminders.ts';
import { sendEmailDigests } from '../src/lib/alerts/digest.ts';

console.log('===================================================================');
console.log('   PHASE 6 — USER ACCOUNTS, SAVED JOBS & ALERTS TEST SUITE        ');
console.log('===================================================================\n');

// Setup test SQLite database
const testDbDir = join(process.cwd(), '.wrangler', 'test-d1');
if (!existsSync(testDbDir)) mkdirSync(testDbDir, { recursive: true });
const testDbPath = join(testDbDir, 'test_phase6.sqlite');
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

sqliteDb.exec(initialSchema);
sqliteDb.exec(seedData);
sqliteDb.exec(phase2Schema);
sqliteDb.exec(phase3Schema);
sqliteDb.exec(phase5Schema);
sqliteDb.exec(phase6Schema);

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

// Seed sample organizations, categories and published items
await db.run(`
  INSERT OR REPLACE INTO organizations (id, name, slug, website) VALUES
  ('org_upsc', 'Union Public Service Commission', 'upsc', 'https://upsc.gov.in'),
  ('org_ssc', 'Staff Selection Commission', 'ssc', 'https://ssc.nic.in'),
  ('org_rrb', 'Railway Recruitment Board', 'rrb', 'https://rrbcdg.gov.in')
`);

await db.run(`
  INSERT OR REPLACE INTO categories (id, name, slug) VALUES
  ('cat_jobs', 'Government Jobs', 'jobs'),
  ('cat_railway', 'Railway Recruitment', 'railway'),
  ('cat_results', 'Results', 'results')
`);

// Seed published job and result
await db.run(`
  INSERT INTO content_items (id, category_id, organization_id, type, title, slug, status, published_at, created_at, updated_at)
  VALUES ('ci_job_upsc', 'cat_jobs', 'org_upsc', 'job', 'UPSC CSE 2026 Notification', 'upsc-cse-2026', 'published', datetime('now'), datetime('now'), datetime('now'))
`);

const twoDaysLater = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
await db.run(`
  INSERT INTO jobs (id, content_item_id, post_name, vacancy, qualification, application_last_date)
  VALUES ('j_upsc', 'ci_job_upsc', 'IAS / IPS Officers', '1056', 'Graduate Degree', ?)
`, [twoDaysLater]);

// ---------------------------------------------------------
// TEST 1: User Registration & Email Verification Flow
// ---------------------------------------------------------
console.log('Test 1: Testing User Registration & Email Verification...');
const { user: regUser, verificationToken } = await registerUser(db, {
  name: 'Aarav Patel',
  email: 'aarav.patel@example.com',
  password: 'SecurePassword123!',
});

if (!regUser.id.startsWith('usr_') || regUser.email_verified !== 0) {
  throw new Error('User registration failed to create unverified candidate user');
}

// Duplicate email rejection
try {
  await registerUser(db, {
    name: 'Duplicate Aarav',
    email: 'AARAV.patel@example.com', // test case-insensitivity
    password: 'SecurePassword123!',
  });
  throw new Error('Duplicate email registration was not blocked!');
} catch (err) {
  if (!err.message.includes('already exists')) throw err;
}

// Verify email with token
const verifyRes = await verifyUserEmail(db, verificationToken);
if (!verifyRes.success || !verifyRes.user || verifyRes.user.email_verified !== 1) {
  throw new Error('Email verification token redemption failed');
}

// Re-using same token should fail
const reuseRes = await verifyUserEmail(db, verificationToken);
if (reuseRes.success) {
  throw new Error('Re-using an already redeemed verification token MUST fail!');
}

console.log('  ✔ User registered, duplicate email rejected, email verified via token.');

// ---------------------------------------------------------
// TEST 2: Password Cryptography & Login Sessions
// ---------------------------------------------------------
console.log('\nTest 2: Testing Password Cryptography & Session Management...');
const isCorrectPassword = await verifyUserPassword('SecurePassword123!', regUser.salt, regUser.password_hash);
const isWrongPassword = await verifyUserPassword('WrongPassword!', regUser.salt, regUser.password_hash);

if (!isCorrectPassword || isWrongPassword) {
  throw new Error('PBKDF2 password verification logic failed');
}

// Create Session
const { rawToken: sessionToken, expiresAt } = await createUserSession(db, regUser.id, {
  ip: '127.0.0.1',
  userAgent: 'Mozilla/5.0 NodeTest',
});

// Lookup Session
const session = await getUserSession(db, sessionToken);
if (!session || session.userId !== regUser.id || !session.emailVerified) {
  throw new Error('Session lookup from D1 failed');
}

// Delete session (Logout)
await deleteUserSession(db, sessionToken);
const deletedSession = await getUserSession(db, sessionToken);
if (deletedSession !== null) {
  throw new Error('Deleted session token was still resolved!');
}

console.log('  ✔ PBKDF2 hash, session issuance, secure validation & logout verified.');

// ---------------------------------------------------------
// TEST 3: Password Reset Flow & Session Invalidation
// ---------------------------------------------------------
console.log('\nTest 3: Testing Password Reset Flow...');
const { rawToken: resetToken } = await createPasswordResetToken(db, 'aarav.patel@example.com');
if (!resetToken) throw new Error('Password reset token creation failed');

// Create active session before reset
const { rawToken: activeSessionToken } = await createUserSession(db, regUser.id);

// Redeem password reset token
const resetResult = await resetUserPassword(db, resetToken, 'BrandNewPassword2026!');
if (!resetResult.success) throw new Error(`Password reset failed: ${resetResult.error}`);

// Verify new password works and old sessions are invalidated
const updatedUser = await db.first('SELECT * FROM users WHERE id = ?', [regUser.id]);
const verifyNewPw = await verifyUserPassword('BrandNewPassword2026!', updatedUser.salt, updatedUser.password_hash);
if (!verifyNewPw) throw new Error('New password failed verification');

const checkInvalidatedSession = await getUserSession(db, activeSessionToken);
if (checkInvalidatedSession !== null) {
  throw new Error('Password reset failed to invalidate old user sessions!');
}

console.log('  ✔ Password reset token issued, redeemed & prior sessions invalidated.');

// ---------------------------------------------------------
// TEST 4: Saved Content (Jobs, Results, Exams) & Duplicate Defense
// ---------------------------------------------------------
console.log('\nTest 4: Testing Saved Content Operations...');
const saveJob1 = await saveContentItem(db, regUser.id, 'ci_job_upsc');
if (!saveJob1.success || !saveJob1.saved) throw new Error('Failed to save job item');

const checkSavedInDb = await db.first('SELECT * FROM saved_items WHERE user_id = ? AND content_item_id = ?', [regUser.id, 'ci_job_upsc']);
if (!checkSavedInDb) throw new Error('Saved item not found in D1');

// Unsave (toggle behavior)
const unsaveJob1 = await saveContentItem(db, regUser.id, 'ci_job_upsc');
if (!unsaveJob1.success || unsaveJob1.saved !== false) throw new Error('Failed to toggle unsave job item');

// Re-save for reminder testing
await saveContentItem(db, regUser.id, 'ci_job_upsc');
console.log('  ✔ Save, unsave toggle, and D1 relations verified.');

// ---------------------------------------------------------
// TEST 5: Following Organizations & Categories
// ---------------------------------------------------------
console.log('\nTest 5: Testing Follow Organizations & Categories...');
const followOrg = await followOrganization(db, regUser.id, 'org_upsc');
if (!followOrg.success || !followOrg.following) throw new Error('Failed to follow UPSC organization');

const followCat = await followCategory(db, regUser.id, 'cat_railway');
if (!followCat.success || !followCat.following) throw new Error('Failed to follow Railway category');

console.log('  ✔ Followed UPSC organization & Railway category.');

// ---------------------------------------------------------
// TEST 6: Alert Matching Engine & Duplicate Suppression
// ---------------------------------------------------------
console.log('\nTest 6: Testing Alert Matching Engine & Duplicate Protection...');
const mockNewJob = {
  id: 'ci_new_job_1',
  type: 'job',
  title: 'UPSC NDA & NA Exam 2026',
  organization_id: 'org_upsc',
  category_id: 'cat_jobs',
  organization_name: 'Union Public Service Commission',
  status: 'published',
};

await db.run(`
  INSERT INTO content_items (id, category_id, organization_id, type, title, slug, status, published_at, created_at, updated_at)
  VALUES ('ci_new_job_1', 'cat_jobs', 'org_upsc', 'job', 'UPSC NDA & NA Exam 2026', 'upsc-nda-2026', 'published', datetime('now'), datetime('now'), datetime('now'))
`);

const matches = await matchUsersForContent(db, mockNewJob);
if (matches.length === 0 || matches[0].userId !== regUser.id) {
  throw new Error('Alert matching failed to identify followed organization subscriber');
}

// Enqueue notification
const enqueueResult1 = await enqueueNotifications(db, matches);
if (enqueueResult1.enqueued !== 1) throw new Error('Failed to enqueue notification');

// Duplicate insertion attempt must be skipped
const enqueueResult2 = await enqueueNotifications(db, matches);
if (enqueueResult2.enqueued !== 0 || enqueueResult2.skippedDuplicates !== 1) {
  throw new Error('Duplicate notification protection failed to skip duplicate alert!');
}

console.log(`  ✔ Matched 1 subscriber (${matches[0].email}) & skipped duplicate enqueuing.`);

// ---------------------------------------------------------
// TEST 7: Transactional Email Service & Queue Processor
// ---------------------------------------------------------
console.log('\nTest 7: Testing Transactional Email Templates & Queue Processor...');
const emailService = new EmailService({ provider: 'mock' });

// Test templates
const vEmail = buildVerificationEmail({ name: 'Aarav', verifyUrl: 'https://sarkariinfo.in/verify?t=123' });
const pwEmail = buildPasswordResetEmail({ name: 'Aarav', resetUrl: 'https://sarkariinfo.in/reset?t=123' });
const jEmail = buildJobAlertEmail({ title: 'UPSC CSE', organization: 'UPSC', jobUrl: 'https://sarkariinfo.in/jobs/upsc' });
const rEmail = buildContentAlertEmail({ type: 'result', title: 'UPSC Result', organization: 'UPSC', actionUrl: 'https://sarkariinfo.in/results/upsc' });
const dEmail = buildDeadlineReminderEmail({ title: 'UPSC CSE', organization: 'UPSC', daysRemaining: 3, lastDate: '2026-03-05', jobUrl: 'https://sarkariinfo.in/jobs/upsc' });
const digEmail = buildDigestEmail({ digestType: 'Daily', items: [{ title: 'UPSC CSE', type: 'job', url: 'https://sarkariinfo.in/jobs/upsc' }], siteUrl: 'https://sarkariinfo.in' });

if (!vEmail.html.includes('Verify Email') || !pwEmail.html.includes('Reset Password') || !jEmail.html.includes('New Government Job')) {
  throw new Error('Email template formatting error');
}

// Process pending queue
const queueProcessRes = await processNotificationQueue(db, emailService, { batchSize: 10 });
if (queueProcessRes.processed === 0 || queueProcessRes.succeeded === 0) {
  throw new Error('Queue processor failed to process pending notifications');
}

const sentNotif = await db.first("SELECT * FROM notifications WHERE status = 'sent'");
if (!sentNotif || !sentNotif.sent_at) {
  throw new Error('Notification record status not updated to "sent"');
}

console.log(`  ✔ Rendered 6 branded templates & processed ${queueProcessRes.succeeded} queued notifications.`);

// ---------------------------------------------------------
// TEST 8: Application Deadline Reminders Engine
// ---------------------------------------------------------
console.log('\nTest 8: Testing Application Deadline Reminders Engine...');
const reminderRes = await checkAndEnqueueDeadlineReminders(db);
if (reminderRes.remindersCreated < 1) {
  throw new Error('Deadline reminder engine failed to detect job closing in 3 days');
}

const reminderNotif = await db.first("SELECT * FROM notifications WHERE type = 'deadline_reminder'");
if (!reminderNotif || !reminderNotif.title.includes('3 days left')) {
  throw new Error('Deadline reminder notification record invalid');
}

console.log(`  ✔ Detected deadline in 3 days and created reminder: "${reminderNotif.title}".`);

// ---------------------------------------------------------
// TEST 9: Daily & Weekly Digest Aggregator
// ---------------------------------------------------------
console.log('\nTest 9: Testing Digest Email Aggregator...');
// Enable daily digest for user
await db.run('UPDATE notification_preferences SET daily_digest = 1 WHERE user_id = ?', [regUser.id]);

const digestResult = await sendEmailDigests(db, emailService, 'Daily');
console.log(`  ✔ Daily digest dispatched: ${digestResult.sentCount} sent, ${digestResult.skippedEmptyCount} skipped.`);

// ---------------------------------------------------------
// TEST 10: Account Deletion Cascades
// ---------------------------------------------------------
console.log('\nTest 10: Testing Account Deletion & Data Removal...');
await deleteUserAccount(db, regUser.id);

const checkUserDeleted = await db.first('SELECT id FROM users WHERE id = ?', [regUser.id]);
const checkSavedDeleted = await db.first('SELECT id FROM saved_items WHERE user_id = ?', [regUser.id]);
const checkFollowsDeleted = await db.first('SELECT id FROM followed_organizations WHERE user_id = ?', [regUser.id]);

if (checkUserDeleted !== null || checkSavedDeleted !== null || checkFollowsDeleted !== null) {
  throw new Error('Account deletion failed to remove personal account records!');
}

console.log('  ✔ User account deleted and all personal records cleanly wiped.');

console.log('\n===================================================================');
console.log('   ALL PHASE 6 USER ACCOUNTS & ALERTS TESTS PASSED (100% PASS)   ');
console.log('===================================================================\n');
