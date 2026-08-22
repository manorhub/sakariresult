// src/pages/api/user/profile.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db.ts';
import { verifyUserPassword, hashUserPassword, generateSalt } from '../../../lib/user_auth.ts';
import type { UserSession, User } from '../../../lib/user_auth.ts';

export const POST: APIRoute = async ({ request, locals }) => {
  const session = (locals as any).userSession as UserSession | null;
  if (!session) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const body = (await request.json()) as any;
    const { name, currentPassword, newPassword, confirmPassword } = body;

    const user = await db.first<User>('SELECT * FROM users WHERE id = ?', [session.userId]);
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'User not found.' }), { status: 404 });
    }

    // Update name
    if (name && name.trim().length >= 2) {
      await db.run('UPDATE users SET name = ?, updated_at = datetime("now") WHERE id = ?', [name.trim(), session.userId]);
    }

    // Update password if requested
    if (newPassword) {
      if (!currentPassword) {
        return new Response(JSON.stringify({ success: false, error: 'Current password is required to set a new password.' }), { status: 400 });
      }

      if (newPassword !== confirmPassword) {
        return new Response(JSON.stringify({ success: false, error: 'New passwords do not match.' }), { status: 400 });
      }

      if (newPassword.length < 8) {
        return new Response(JSON.stringify({ success: false, error: 'New password must be at least 8 characters long.' }), { status: 400 });
      }

      const isValid = await verifyUserPassword(currentPassword, user.salt, user.password_hash);
      if (!isValid) {
        return new Response(JSON.stringify({ success: false, error: 'Current password is incorrect.' }), { status: 400 });
      }

      const newSalt = generateSalt();
      const newHash = await hashUserPassword(newPassword, newSalt);

      await db.run('UPDATE users SET password_hash = ?, salt = ?, updated_at = datetime("now") WHERE id = ?', [newHash, newSalt, session.userId]);
    }

    return new Response(JSON.stringify({ success: true, message: 'Profile updated successfully.' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message }), { status: 500 });
  }
};
