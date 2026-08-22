// src/pages/api/auth/verify-email.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db.ts';
import { verifyUserEmail } from '../../../lib/user_auth.ts';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const body = (await request.json()) as any;
    const { token } = body;

    if (!token) {
      return new Response(JSON.stringify({ success: false, error: 'Verification token is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await verifyUserEmail(db, token);

    if (!result.success) {
      return new Response(JSON.stringify({ success: false, error: result.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Your email address has been verified successfully! You can now configure job alerts.',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Verification failed.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
