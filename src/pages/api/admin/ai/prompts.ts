// src/pages/api/admin/ai/prompts.ts
// Admin API to view, update, and reset AI prompts

import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { DEFAULT_PROMPTS } from '../../../../lib/ai/prompts';
import { generateId } from '../../../../lib/utils';
import type { AIPrompt } from '../../../../lib/types';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const dbPrompts = (await db.query<AIPrompt>('SELECT * FROM ai_prompts')).results;
    const dbMap = new Map(dbPrompts.map((p) => [p.prompt_name, p]));

    const result = Object.entries(DEFAULT_PROMPTS).map(([name, fallback]) => {
      const existing = dbMap.get(name);
      return {
        prompt_name: name,
        version: existing?.version || 1,
        system_prompt: existing?.system_prompt || fallback.system,
        prompt_text: existing?.prompt_text || fallback.user,
        is_active: existing ? existing.is_active === 1 : true,
        updated_at: existing?.updated_at || new Date().toISOString(),
        is_customized: !!existing,
      };
    });

    return new Response(JSON.stringify({ success: true, data: result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Failed to load prompts' }), {
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

    const { prompt_name, prompt_text, system_prompt, reset_to_default } = body;

    if (!prompt_name || !(prompt_name in DEFAULT_PROMPTS)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid prompt name provided.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (reset_to_default) {
      await db.run('DELETE FROM ai_prompts WHERE prompt_name = ?', [prompt_name]);
      return new Response(JSON.stringify({ success: true, message: `Prompt "${prompt_name}" reset to default.` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!prompt_text) {
      return new Response(JSON.stringify({ success: false, error: 'Prompt text cannot be empty.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const existing = await db.first<AIPrompt>('SELECT * FROM ai_prompts WHERE prompt_name = ?', [prompt_name]);
    if (existing) {
      await db.run(
        `UPDATE ai_prompts SET
          version = version + 1,
          prompt_text = ?,
          system_prompt = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE prompt_name = ?`,
        [prompt_text, system_prompt || null, prompt_name]
      );
    } else {
      await db.run(
        `INSERT INTO ai_prompts (id, prompt_name, version, prompt_text, system_prompt, is_active, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [generateId('prm'), prompt_name, prompt_text, system_prompt || null]
      );
    }

    return new Response(JSON.stringify({ success: true, message: `Prompt "${prompt_name}" updated successfully.` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Failed to save prompt' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
