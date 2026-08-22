// src/pages/api/admin/seo/indexing/test.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../../../lib/db.ts';
import { getGoogleAccessToken, getGoogleIndexingSettings } from '../../../../../lib/seo/google-indexing.ts';

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
    let body: any = {};
    try {
      body = (await request.json()) as any;
    } catch {}

    let { client_email, private_key, service_account_json } = body || {};

    if (service_account_json && typeof service_account_json === 'string') {
      try {
        const parsed = JSON.parse(service_account_json);
        if (parsed.client_email) client_email = parsed.client_email;
        if (parsed.private_key) private_key = parsed.private_key;
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid JSON format in Service Account credentials.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    if (!client_email || !private_key || private_key.startsWith('••••••••')) {
      const saved = await getGoogleIndexingSettings(db);
      client_email = saved.client_email;
      private_key = saved.private_key;
    }

    if (!client_email || !private_key) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Please provide both Client Email and Private Key or paste the full Service Account JSON.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const token = await getGoogleAccessToken({ client_email, private_key });

    return new Response(JSON.stringify({
      success: true,
      message: 'Google Cloud Authentication SUCCESS! Connected to Google Indexing API.',
      data: {
        client_email,
        token_preview: `${token.slice(0, 10)}...${token.slice(-10)}`
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({
      success: false,
      error: `Authentication failed: ${err.message}`
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
