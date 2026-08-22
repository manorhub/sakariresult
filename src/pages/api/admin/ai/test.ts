// src/pages/api/admin/ai/test.ts
// Test DeepSeek API connectivity, classification, and token responses

import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { DeepSeekClient } from '../../../../lib/ai/deepseek';
import { classifyContent } from '../../../../lib/ai/classifier';
import { extractStructuredData } from '../../../../lib/ai/extractor';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const apiKey = (locals as any)?.runtime?.env?.DEEPSEEK_API_KEY || (typeof process !== 'undefined' ? process.env?.DEEPSEEK_API_KEY : '');
    const db = getDb(d1);
    const body = (await request.json()) as any;

    const sampleText = body.sample_text || 'Union Public Service Commission (UPSC) invites online applications for 1056 vacancies for Civil Services Examination 2026. Last date to apply is 05 March 2026.';

    const client = new DeepSeekClient(
      {
        apiKey,
        model: body.model || 'deepseek-chat',
        temperature: body.temperature !== undefined ? parseFloat(body.temperature) : 0.2,
        mockMode: !apiKey || apiKey === 'mock_key',
      },
      db
    );

    const classification = await classifyContent(client, sampleText, db);
    const extraction = await extractStructuredData(client, sampleText, classification.type, db);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'DeepSeek AI connection and test run successful.',
        data: {
          isMockMode: client.isMockMode(),
          isApiKeyConfigured: client.isConfigured(),
          classification,
          extraction,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'AI test execution failed.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
