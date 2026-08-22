// src/pages/api/user/saved.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db.ts';
import { saveContentItem } from '../../../lib/user_auth.ts';
import type { UserSession } from '../../../lib/user_auth.ts';
import type { PublicJobItem } from '../../../lib/public_queries.ts';
import { calculateJobStatus } from '../../../lib/public_queries.ts';

export const GET: APIRoute = async ({ locals }) => {
  const session = (locals as any).userSession as UserSession | null;
  if (!session) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const items = (await db.query<PublicJobItem>(`
      SELECT ci.*, j.post_name, j.vacancy as total_vacancies, j.qualification, j.application_last_date,
             o.name as organization_name, o.slug as organization_slug,
             c.name as category_name, c.slug as category_slug,
             si.created_at as saved_at
      FROM saved_items si
      JOIN content_items ci ON ci.id = si.content_item_id
      LEFT JOIN jobs j ON j.content_item_id = ci.id
      LEFT JOIN organizations o ON o.id = ci.organization_id
      LEFT JOIN categories c ON c.id = ci.category_id
      WHERE si.user_id = ? AND ci.status = 'published'
      ORDER BY si.created_at DESC
    `, [session.userId])).results.map(i => ({
      ...i,
      calculated_status: calculateJobStatus(i),
    }));

    return new Response(JSON.stringify({ success: true, items }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const session = (locals as any).userSession as UserSession | null;
  if (!session) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized. Please log in to save jobs.' }), { status: 401 });
  }

  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const body = (await request.json()) as any;
    const { contentItemId } = body;

    if (!contentItemId) {
      return new Response(JSON.stringify({ success: false, error: 'contentItemId is required.' }), { status: 400 });
    }

    const result = await saveContentItem(db, session.userId, contentItemId);

    return new Response(JSON.stringify({ success: true, saved: result.saved }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message }), { status: 500 });
  }
};
