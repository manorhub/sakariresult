// src/lib/user_auth.ts
// User Authentication, PBKDF2 Password Cryptography & Session Management Layer

import type { DbClient } from './db.ts';

export type UserStatus = 'active' | 'suspended' | 'deleted';
export type NotificationType = 'job_alert' | 'result_alert' | 'admit_card_alert' | 'answer_key_alert' | 'deadline_reminder' | 'digest' | 'system';
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'read';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  salt: string;
  name: string;
  status: UserStatus;
  email_verified: number; // 0 or 1
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface UserSession {
  userId: string;
  email: string;
  name: string;
  emailVerified: boolean;
  expiresAt: number;
}

export interface NotificationPreferences {
  id: string;
  user_id: string;
  email_enabled: number;
  job_alerts: number;
  result_alerts: number;
  admit_card_alerts: number;
  answer_key_alerts: number;
  daily_digest: number;
  weekly_digest: number;
  deadline_reminders: number;
  created_at: string;
  updated_at: string;
}

export interface UserNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  content_item_id: string | null;
  status: NotificationStatus;
  retry_count: number;
  error_message?: string | null;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
  // joined fields
  content_slug?: string;
  content_type?: string;
}

// ----------------------------------------------------
// Cryptography Utilities
// ----------------------------------------------------

export function generateSalt(length = 16): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashUserPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    true,
    ['sign']
  );

  const exported = await crypto.subtle.exportKey('raw', key);
  return Array.from(new Uint8Array(exported), b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyUserPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const computedHash = await hashUserPassword(password, salt);
  return computedHash === expectedHash;
}

export function generateSecureToken(byteLength = 32): string {
  const array = new Uint8Array(byteLength);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashToken(token: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(token));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

// ----------------------------------------------------
// User Registration & Authentication
// ----------------------------------------------------

export async function registerUser(
  db: DbClient,
  input: { email: string; password: string; name: string }
): Promise<{ user: User; verificationToken: string }> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const password = input.password;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Please provide a valid email address.');
  }

  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }

  if (!name || name.length < 2) {
    throw new Error('Name must be at least 2 characters long.');
  }

  // Check duplicate email
  const existing = await db.first<User>('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) {
    throw new Error('An account with this email address already exists.');
  }

  const userId = `usr_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const salt = generateSalt();
  const passwordHash = await hashUserPassword(password, salt);

  await db.run(`
    INSERT INTO users (id, email, password_hash, salt, name, status, email_verified, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'active', 0, datetime('now'), datetime('now'))
  `, [userId, email, passwordHash, salt, name]);

  // Create default notification preferences
  const prefId = `pref_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  await db.run(`
    INSERT INTO notification_preferences (id, user_id, email_enabled, job_alerts, result_alerts, admit_card_alerts, answer_key_alerts, daily_digest, weekly_digest, deadline_reminders)
    VALUES (?, ?, 1, 1, 1, 1, 1, 0, 0, 1)
  `, [prefId, userId]);

  // Create Email Verification Token (valid for 24 hours)
  const rawToken = generateSecureToken(32);
  const tokenHash = await hashToken(rawToken);
  const tokenId = `evt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

  await db.run(`
    INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `, [tokenId, userId, tokenHash, expiresAt]);

  const user = (await db.first<User>('SELECT * FROM users WHERE id = ?', [userId]))!;
  return { user, verificationToken: rawToken };
}

export async function verifyUserEmail(
  db: DbClient,
  rawToken: string
): Promise<{ success: boolean; user?: User; error?: string }> {
  if (!rawToken || rawToken.trim().length === 0) {
    return { success: false, error: 'Invalid verification token.' };
  }

  const tokenHash = await hashToken(rawToken.trim());
  const tokenRecord = await db.first<{ id: string; user_id: string; expires_at: number; used_at: string | null }>(
    'SELECT * FROM email_verification_tokens WHERE token_hash = ?',
    [tokenHash]
  );

  if (!tokenRecord) {
    return { success: false, error: 'Verification token not found or already used.' };
  }

  if (tokenRecord.used_at) {
    return { success: false, error: 'This verification token has already been redeemed.' };
  }

  if (tokenRecord.expires_at < Date.now()) {
    return { success: false, error: 'Verification token has expired. Please request a new one.' };
  }

  // Mark token used and activate email_verified
  await db.run("UPDATE email_verification_tokens SET used_at = datetime('now') WHERE id = ?", [tokenRecord.id]);
  await db.run("UPDATE users SET email_verified = 1, updated_at = datetime('now') WHERE id = ?", [tokenRecord.user_id]);

  const user = await db.first<User>('SELECT * FROM users WHERE id = ?', [tokenRecord.user_id]);
  return { success: true, user: user || undefined };
}

// ----------------------------------------------------
// Password Reset Operations
// ----------------------------------------------------

export async function createPasswordResetToken(
  db: DbClient,
  email: string
): Promise<{ rawToken: string | null; user: User | null }> {
  const cleanEmail = email.trim().toLowerCase();
  const user = await db.first<User>("SELECT * FROM users WHERE email = ? AND status = 'active'", [cleanEmail]);

  if (!user) {
    return { rawToken: null, user: null };
  }

  const rawToken = generateSecureToken(32);
  const tokenHash = await hashToken(rawToken);
  const tokenId = `prt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour validity

  await db.run(`
    INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `, [tokenId, user.id, tokenHash, expiresAt]);

  return { rawToken, user };
}

export async function resetUserPassword(
  db: DbClient,
  rawToken: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  if (!rawToken) return { success: false, error: 'Missing reset token.' };
  if (!newPassword || newPassword.length < 8) return { success: false, error: 'New password must be at least 8 characters long.' };

  const tokenHash = await hashToken(rawToken.trim());
  const record = await db.first<{ id: string; user_id: string; expires_at: number; used_at: string | null }>(
    'SELECT * FROM password_reset_tokens WHERE token_hash = ?',
    [tokenHash]
  );

  if (!record || record.used_at) {
    return { success: false, error: 'Invalid or expired password reset link.' };
  }

  if (record.expires_at < Date.now()) {
    return { success: false, error: 'Password reset link has expired. Please request a new one.' };
  }

  const newSalt = generateSalt();
  const newHash = await hashUserPassword(newPassword, newSalt);

  await db.run("UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?", [record.id]);
  await db.run(`
    UPDATE users SET password_hash = ?, salt = ?, updated_at = datetime('now')
    WHERE id = ?
  `, [newHash, newSalt, record.user_id]);

  // Invalidate all active user sessions on password change
  await invalidateAllUserSessions(db, record.user_id);

  return { success: true };
}

// ----------------------------------------------------
// Session Management (Stored in D1, token hash validated)
// ----------------------------------------------------

export async function createUserSession(
  db: DbClient,
  userId: string,
  options: { ip?: string; userAgent?: string; maxAgeMs?: number } = {}
): Promise<{ rawToken: string; expiresAt: number }> {
  const rawToken = generateSecureToken(32);
  const tokenHash = await hashToken(rawToken);
  const sessionId = `ses_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const maxAgeMs = options.maxAgeMs || 30 * 24 * 60 * 60 * 1000; // 30 days default
  const expiresAt = Date.now() + maxAgeMs;

  let ipHash: string | null = null;
  let uaHash: string | null = null;
  if (options.ip) ipHash = (await hashToken(options.ip)).slice(0, 16);
  if (options.userAgent) uaHash = (await hashToken(options.userAgent)).slice(0, 16);

  await db.run(`
    INSERT INTO user_sessions (id, user_id, session_token_hash, expires_at, created_at, last_used_at, ip_hash, user_agent_hash)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?)
  `, [sessionId, userId, tokenHash, expiresAt, ipHash, uaHash]);

  // Update last_login_at
  await db.run("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", [userId]);

  return { rawToken, expiresAt };
}

export async function getUserSession(
  db: DbClient,
  rawToken: string
): Promise<UserSession | null> {
  if (!rawToken || rawToken.trim().length === 0) return null;

  const tokenHash = await hashToken(rawToken.trim());
  const session = await db.first<{
    id: string;
    user_id: string;
    expires_at: number;
    email: string;
    name: string;
    status: UserStatus;
    email_verified: number;
  }>(`
    SELECT s.id, s.user_id, s.expires_at, u.email, u.name, u.status, u.email_verified
    FROM user_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.session_token_hash = ?
  `, [tokenHash]);

  if (!session) return null;

  if (session.status !== 'active') return null;

  if (session.expires_at < Date.now()) {
    // Delete expired session
    await db.run('DELETE FROM user_sessions WHERE id = ?', [session.id]);
    return null;
  }

  // Update last_used_at asynchronously
  db.run("UPDATE user_sessions SET last_used_at = datetime('now') WHERE id = ?", [session.id]).catch(() => {});

  return {
    userId: session.user_id,
    email: session.email,
    name: session.name,
    emailVerified: session.email_verified === 1,
    expiresAt: session.expires_at,
  };
}

export async function deleteUserSession(db: DbClient, rawToken: string): Promise<void> {
  if (!rawToken) return;
  const tokenHash = await hashToken(rawToken.trim());
  await db.run('DELETE FROM user_sessions WHERE session_token_hash = ?', [tokenHash]);
}

export async function invalidateAllUserSessions(db: DbClient, userId: string): Promise<void> {
  await db.run('DELETE FROM user_sessions WHERE user_id = ?', [userId]);
}

// ----------------------------------------------------
// Saved Content & Following Helpers
// ----------------------------------------------------

export async function saveContentItem(
  db: DbClient,
  userId: string,
  contentItemId: string
): Promise<{ success: boolean; saved: boolean }> {
  // Check if already saved
  const existing = await db.first<{ id: string }>(
    'SELECT id FROM saved_items WHERE user_id = ? AND content_item_id = ?',
    [userId, contentItemId]
  );

  if (existing) {
    // Unsave (toggle behavior)
    await db.run('DELETE FROM saved_items WHERE id = ?', [existing.id]);
    return { success: true, saved: false };
  }

  const id = `sav_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  await db.run(
    "INSERT INTO saved_items (id, user_id, content_item_id, created_at) VALUES (?, ?, ?, datetime('now'))",
    [id, userId, contentItemId]
  );

  return { success: true, saved: true };
}

export async function followOrganization(
  db: DbClient,
  userId: string,
  organizationId: string
): Promise<{ success: boolean; following: boolean }> {
  const existing = await db.first<{ id: string }>(
    'SELECT id FROM followed_organizations WHERE user_id = ? AND organization_id = ?',
    [userId, organizationId]
  );

  if (existing) {
    await db.run('DELETE FROM followed_organizations WHERE id = ?', [existing.id]);
    return { success: true, following: false };
  }

  const id = `forg_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  await db.run(
    "INSERT INTO followed_organizations (id, user_id, organization_id, created_at) VALUES (?, ?, ?, datetime('now'))",
    [id, userId, organizationId]
  );

  return { success: true, following: true };
}

export async function followCategory(
  db: DbClient,
  userId: string,
  categoryId: string
): Promise<{ success: boolean; following: boolean }> {
  const existing = await db.first<{ id: string }>(
    'SELECT id FROM followed_categories WHERE user_id = ? AND category_id = ?',
    [userId, categoryId]
  );

  if (existing) {
    await db.run('DELETE FROM followed_categories WHERE id = ?', [existing.id]);
    return { success: true, following: false };
  }

  const id = `fcat_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  await db.run(
    "INSERT INTO followed_categories (id, user_id, category_id, created_at) VALUES (?, ?, ?, datetime('now'))",
    [id, userId, categoryId]
  );

  return { success: true, following: true };
}

export async function deleteUserAccount(db: DbClient, userId: string): Promise<void> {
  // Cascades to user_sessions, saved_items, followed_*, notification_preferences, tokens
  await db.run('DELETE FROM users WHERE id = ?', [userId]);
}
