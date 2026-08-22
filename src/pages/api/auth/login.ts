// src/pages/api/auth/login.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db.ts';
import { verifyUserPassword, createUserSession } from '../../../lib/user_auth.ts';
import type { User } from '../../../lib/user_auth.ts';

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const body = (await request.json()) as any;
    const { email, password, rememberMe } = body;

    if (!email || !password) {
      return new Response(JSON.stringify({ success: false, error: 'Email and password are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await db.first<User>('SELECT * FROM users WHERE email = ?', [cleanEmail]);

    if (!user || user.status === 'deleted') {
      return new Response(JSON.stringify({ success: false, error: 'Invalid email or password.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (user.status === 'suspended') {
      return new Response(JSON.stringify({ success: false, error: 'Your account has been suspended. Please contact support.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const isValid = await verifyUserPassword(password, user.salt, user.password_hash);
    if (!isValid) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid email or password.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create session (30 days if rememberMe, else 7 days)
    const maxAgeMs = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    const { rawToken, expiresAt } = await createUserSession(db, user.id, { maxAgeMs });

    // Set secure HTTP-only cookie
    cookies.set('user_session', rawToken, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      expires: new Date(expiresAt),
    });

    return new Response(JSON.stringify({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.email_verified === 1,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Login failed.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
