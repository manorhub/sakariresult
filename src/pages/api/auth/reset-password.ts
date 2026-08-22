// src/pages/api/auth/reset-password.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db.ts';
import { resetUserPassword } from '../../../lib/user_auth.ts';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const body = (await request.json()) as any;
    const { token, password, confirmPassword } = body;

    if (!token || !password) {
      return new Response(JSON.stringify({ success: false, error: 'Token and new password are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (password !== confirmPassword) {
      return new Response(JSON.stringify({ success: false, error: 'Passwords do not match.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await resetUserPassword(db, token, password);

    if (!result.success) {
      return new Response(JSON.stringify({ success: false, error: result.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Password has been reset successfully. Please log in with your new password.',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Password reset failed.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
