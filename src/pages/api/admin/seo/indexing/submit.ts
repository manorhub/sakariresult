// src/pages/api/admin/seo/indexing/submit.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../../../lib/db.ts';
import { submitUrlToGoogle, batchSubmitUrlsToGoogle } from '../../../../../lib/seo/google-indexing.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const session = (locals as any).adminSession;
  if (!session) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const d1 = (locals as any)?.runtime?.env?.DB;
  const db = getDb(d1);

  try {
    const body = (await request.json()) as any;
    const { url, urls, type = 'URL_UPDATED', content_item_id } = body || {};

    // Single URL submission
    if (url && typeof url === 'string') {
      const res = await submitUrlToGoogle(db, url.trim(), type, { contentItemId: content_item_id });
      return new Response(JSON.stringify(res), {
        status: res.success ? 200 : 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Bulk URL submission
    if (Array.isArray(urls) && urls.length > 0) {
      const res = await batchSubmitUrlsToGoogle(db, urls, type);
      return new Response(JSON.stringify({
        success: res.successCount > 0,
        data: res
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Provide either url or urls array.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
