// src/lib/auth.ts
// Secure Admin Authentication & Session Management

import type { AstroCookies } from 'astro';
import { signSessionToken, verifySessionToken } from './crypto';
import type { AdminSession, AdminUser } from './types';
import type { DbClient } from './db';

const SESSION_COOKIE_NAME = 'sarkari_admin_session';
const SESSION_DURATION_HOURS = 24 * 7; // 7 days

export async function createAdminSession(
  admin: AdminUser,
  cookies: AstroCookies,
  secret: string
): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_HOURS * 3600;
  const payload: AdminSession & { exp: number } = {
    adminId: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    expiresAt,
    exp: expiresAt,
  };

  const token = await signSessionToken(payload, secret);

  cookies.set(SESSION_COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION_HOURS * 3600,
  });

  return token;
}

export async function getAdminSession(
  cookies: AstroCookies,
  secret: string
): Promise<AdminSession | null> {
  const token = cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  return await verifySessionToken<AdminSession>(token, secret);
}

export function clearAdminSession(cookies: AstroCookies): void {
  cookies.delete(SESSION_COOKIE_NAME, {
    path: '/',
  });
}

/**
 * Validate admin session against the database to ensure account is still active
 */
export async function validateAdminSession(
  cookies: AstroCookies,
  db: DbClient,
  secret: string
): Promise<AdminUser | null> {
  const session = await getAdminSession(cookies, secret);
  if (!session) return null;

  const admin = await db.first<AdminUser>(
    'SELECT * FROM admins WHERE id = ? AND status = ?',
    [session.adminId, 'active']
  );

  return admin;
}
