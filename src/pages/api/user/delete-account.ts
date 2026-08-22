// src/pages/api/user/delete-account.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db.ts';
import { verifyUserPassword, deleteUserAccount } from '../../../lib/user_auth.ts';
import type { UserSession, User } from '../../../lib/user_auth.ts';

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const session = (locals as any).userSession as UserSession | null;
  if (!session) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const body = (await request.json()) as any;
    const { password } = body;

    if (!password) {
      return new Response(JSON.stringify({ success: false, error: 'Password is required to confirm account deletion.' }), { status: 400 });
    }

    const user = await db.first<User>('SELECT * FROM users WHERE id = ?', [session.userId]);
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'User not found.' }), { status: 404 });
    }

    const isValid = await verifyUserPassword(password, user.salt, user.password_hash);
    if (!isValid) {
      return new Response(JSON.stringify({ success: false, error: 'Incorrect password.' }), { status: 400 });
    }

    // Completely delete user account & cascade records
    await deleteUserAccount(db, session.userId);

    // Clear session cookie
    cookies.delete('user_session', { path: '/' });

    return new Response(JSON.stringify({ success: true, message: 'Your account has been deleted.' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message }), { status: 500 });
  }
};
