// tests/test_change_password.mjs
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { hashPassword, verifyPassword, generateRandomHex } from '../src/lib/crypto.ts';

console.log('🧪 Testing Admin Password Change Engine & Cryptography...\n');

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
  CREATE TABLE admins (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    status TEXT DEFAULT 'active'
  );
`);

const initialSalt = generateRandomHex(16);
const initialHash = await hashPassword('Admin@12345', initialSalt);

db.prepare(`
  INSERT INTO admins (id, email, password_hash, salt, name, role, status)
  VALUES ('adm_01', 'admin@realsarkariexam.com', ?, ?, 'Super Administrator', 'superadmin', 'active')
`).run(initialHash, initialSalt);

test('Initial password verification succeeds', async () => {
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get('adm_01');
  const valid = await verifyPassword('Admin@12345', admin.salt, admin.password_hash);
  assert.strictEqual(valid, true);
});

test('Wrong current password rejected', async () => {
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get('adm_01');
  const valid = await verifyPassword('WrongPassword!', admin.salt, admin.password_hash);
  assert.strictEqual(valid, false);
});

test('Password change generates new cryptographic salt and updates hash', async () => {
  const newPassword = 'NewSecretPassword2026!';
  const newSalt = generateRandomHex(16);
  const newHash = await hashPassword(newPassword, newSalt);

  assert.notStrictEqual(newSalt, initialSalt);
  assert.notStrictEqual(newHash, initialHash);

  db.prepare('UPDATE admins SET password_hash = ?, salt = ? WHERE id = ?').run(newHash, newSalt, 'adm_01');

  const updatedAdmin = db.prepare('SELECT * FROM admins WHERE id = ?').get('adm_01');
  const verifyNew = await verifyPassword(newPassword, updatedAdmin.salt, updatedAdmin.password_hash);
  assert.strictEqual(verifyNew, true);

  const verifyOld = await verifyPassword('Admin@12345', updatedAdmin.salt, updatedAdmin.password_hash);
  assert.strictEqual(verifyOld, false);
});

console.log(`\n🎉 All ${passed} Admin Password Security Tests Passed Successfully!\n`);
