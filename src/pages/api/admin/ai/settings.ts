// src/pages/api/admin/ai/settings.ts
// Admin API to read and update AI Engine settings

import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const apiKey = (locals as any)?.runtime?.env?.DEEPSEEK_API_KEY || (typeof process !== 'undefined' ? process.env?.DEEPSEEK_API_KEY : '');
    const db = getDb(d1);

    const settingsRows = (await db.query<{ key: string; value: string }>('SELECT key, value FROM settings WHERE key LIKE "ai_%"')).results;
    const settingsMap: Record<string, string> = {};
    for (const r of settingsRows) {
      settingsMap[r.key] = r.value;
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ai_enabled: settingsMap.ai_enabled !== 'false',
          ai_model: settingsMap.ai_model || 'deepseek-chat',
          ai_temperature: parseFloat(settingsMap.ai_temperature || '0.2'),
          ai_max_tokens: parseInt(settingsMap.ai_max_tokens || '4096', 10),
          ai_timeout_ms: parseInt(settingsMap.ai_timeout_ms || '30000', 10),
          ai_retry_count: parseInt(settingsMap.ai_retry_count || '2', 10),
          ai_daily_limit: parseInt(settingsMap.ai_daily_limit || '500', 10),
          ai_monthly_limit: parseInt(settingsMap.ai_monthly_limit || '15000', 10),
          ai_auto_publish_threshold: parseInt(settingsMap.ai_auto_publish_threshold || '90', 10),
          ai_min_review_threshold: parseInt(settingsMap.ai_min_review_threshold || '75', 10),
          apiKeyConfigured: !!apiKey && apiKey.length > 5,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Failed to load AI settings' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);
    const body = (await request.json()) as any;

    const allowedKeys = [
      'ai_enabled',
      'ai_model',
      'ai_temperature',
      'ai_max_tokens',
      'ai_timeout_ms',
      'ai_retry_count',
      'ai_daily_limit',
      'ai_monthly_limit',
      'ai_auto_publish_threshold',
      'ai_min_review_threshold',
    ];

    for (const key of allowedKeys) {
      if (body[key] !== undefined) {
        const val = String(body[key]);
        const type = typeof body[key] === 'boolean' ? 'boolean' : typeof body[key] === 'number' ? 'number' : 'string';
        await db.run(
          `INSERT INTO settings (id, key, value, type, updated_at) 
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, type = excluded.type, updated_at = CURRENT_TIMESTAMP`,
          [`set_${key}`, key, val, type]
        );
      }
    }

    return new Response(JSON.stringify({ success: true, message: 'AI configuration updated successfully.' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Failed to update AI settings' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
