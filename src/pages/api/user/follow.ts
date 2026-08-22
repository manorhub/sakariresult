// src/pages/api/user/follow.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db.ts';
import { followOrganization, followCategory } from '../../../lib/user_auth.ts';
import type { UserSession } from '../../../lib/user_auth.ts';

export const POST: APIRoute = async ({ request, locals }) => {
  const session = (locals as any).userSession as UserSession | null;
  if (!session) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized. Please log in to follow organizations or categories.' }), { status: 401 });
  }

  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const body = (await request.json()) as any;
    const { organizationId, categoryId } = body;

    if (organizationId) {
      const res = await followOrganization(db, session.userId, organizationId);
      return new Response(JSON.stringify({ success: true, following: res.following, type: 'organization' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (categoryId) {
      const res = await followCategory(db, session.userId, categoryId);
      return new Response(JSON.stringify({ success: true, following: res.following, type: 'category' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'organizationId or categoryId is required.' }), { status: 400 });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message }), { status: 500 });
  }
};
