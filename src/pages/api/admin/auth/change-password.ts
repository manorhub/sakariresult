// src/pages/api/admin/auth/change-password.ts
// Secure Admin Password Change API Endpoint

import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db.ts';
import { hashPassword, verifyPassword, generateRandomHex } from '../../../../lib/crypto.ts';
import type { AdminUser, AdminSession } from '../../../../lib/types.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const session = (locals as any).adminSession as AdminSession | null;
  if (!session || !session.adminId) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized. Please login again.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const d1 = (locals as any)?.runtime?.env?.DB;
  const db = getDb(d1);

  try {
    const body = (await request.json()) as any;
    const { current_password, new_password, confirm_password } = body || {};

    if (!current_password || !new_password || !confirm_password) {
      return new Response(
        JSON.stringify({ success: false, error: 'All fields (current password, new password, confirm password) are required.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (new_password.length < 8) {
      return new Response(
        JSON.stringify({ success: false, error: 'New password must be at least 8 characters long.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (new_password !== confirm_password) {
      return new Response(
        JSON.stringify({ success: false, error: 'New password and confirm password do not match.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Fetch current admin record from database
    const admin = await db.first<AdminUser>(
      'SELECT * FROM admins WHERE id = ?',
      [session.adminId]
    );

    if (!admin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin account not found.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verify current password
    const isCurrentValid = await verifyPassword(current_password, admin.salt, admin.password_hash);
    if (!isCurrentValid) {
      return new Response(
        JSON.stringify({ success: false, error: 'Incorrect current password. Please try again.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Generate new salt and hash for the new password
    const newSalt = generateRandomHex(16);
    const newHash = await hashPassword(new_password, newSalt);

    // Update database
    await db.run(
      'UPDATE admins SET password_hash = ?, salt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newHash, newSalt, admin.id]
    );

    // Record in audit log
    try {
      await db.run(
        `INSERT INTO audit_logs (id, admin_user_id, action, entity_type, entity_id, old_values_json, new_values_json, created_at)
         VALUES (?, ?, 'CHANGE_ADMIN_PASSWORD', 'admins', ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          `audit_${Date.now()}`,
          admin.id,
          admin.id,
          JSON.stringify({ email: admin.email, message: 'Password changed' }),
          JSON.stringify({ email: admin.email, changed_at: new Date().toISOString() }),
        ]
      );
    } catch {}

    return new Response(
      JSON.stringify({ success: true, message: 'Password has been changed successfully! Please use your new password next time you login.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Server error occurred.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
