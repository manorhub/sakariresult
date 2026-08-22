// src/pages/api/auth/logout.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db.ts';
import { deleteUserSession } from '../../../lib/user_auth.ts';

export const POST: APIRoute = async ({ cookies, locals }) => {
  try {
    const sessionToken = cookies.get('user_session')?.value;
    if (sessionToken) {
      const d1 = (locals as any)?.runtime?.env?.DB;
      if (d1) {
        const db = getDb(d1);
        await deleteUserSession(db, sessionToken);
      }
    }

    cookies.delete('user_session', { path: '/' });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    cookies.delete('user_session', { path: '/' });
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
