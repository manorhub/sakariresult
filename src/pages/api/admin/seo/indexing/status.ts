// src/pages/api/admin/seo/indexing/status.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../../../lib/db.ts';
import { getUrlIndexingStatus } from '../../../../../lib/seo/google-indexing.ts';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const session = (locals as any).adminSession;
  if (!session) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const urlParam = new URL(request.url).searchParams.get('url');
  if (!urlParam) {
    return new Response(JSON.stringify({ success: false, error: 'Query parameter "url" is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const d1 = (locals as any)?.runtime?.env?.DB;
  const db = getDb(d1);

  const res = await getUrlIndexingStatus(db, urlParam);
  return new Response(JSON.stringify(res), {
    status: res.success ? 200 : 400,
    headers: { 'Content-Type': 'application/json' }
  });
};
