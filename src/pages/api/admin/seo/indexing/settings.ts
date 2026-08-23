// src/pages/api/admin/seo/indexing/settings.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../../../lib/db.ts';
import { getGoogleIndexingSettings, saveGoogleIndexingSettings } from '../../../../../lib/seo/google-indexing.ts';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const session = (locals as any).adminSession;
  if (!session) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const d1 = (locals as any)?.runtime?.env?.DB;
  const db = getDb(d1);

  const settings = await getGoogleIndexingSettings(db);
  const maskedSettings = {
    ...settings,
    has_private_key: Boolean(settings.private_key),
    private_key: settings.private_key ? '•••••••• [CONFIGURED]' : ''
  };

  return new Response(JSON.stringify({ success: true, data: maskedSettings }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

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
    let { enabled, auto_index_on_publish, auto_index_on_update, only_index_job_postings, service_account_json, client_email, private_key, project_id } = body || {};

    if (service_account_json && typeof service_account_json === 'string') {
      try {
        const parsed = JSON.parse(service_account_json);
        if (parsed.client_email) client_email = parsed.client_email;
        if (parsed.private_key) private_key = parsed.private_key;
        if (parsed.project_id) project_id = parsed.project_id;
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid JSON format in Service Account JSON.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    const current = await getGoogleIndexingSettings(db);

    await saveGoogleIndexingSettings(db, {
      enabled: enabled !== undefined ? Boolean(enabled) : current.enabled,
      auto_index_on_publish: auto_index_on_publish !== undefined ? Boolean(auto_index_on_publish) : current.auto_index_on_publish,
      auto_index_on_update: auto_index_on_update !== undefined ? Boolean(auto_index_on_update) : current.auto_index_on_update,
      only_index_job_postings: only_index_job_postings !== undefined ? Boolean(only_index_job_postings) : current.only_index_job_postings,
      client_email: client_email || current.client_email,
      private_key: (private_key && !private_key.startsWith('••••••••')) ? private_key : current.private_key,
      project_id: project_id || current.project_id
    });

    return new Response(JSON.stringify({ success: true, message: 'Google Indexing settings saved successfully.' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
