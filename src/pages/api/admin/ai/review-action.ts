// src/pages/api/admin/ai/review-action.ts
// Admin Review Action Handler (Approve, Publish, Draft, Reject, Regenerate)

import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { getStorage } from '../../../../lib/r2';
import { DeepSeekClient } from '../../../../lib/ai/deepseek';
import { runAIPipeline } from '../../../../lib/ai/pipeline';
import type { ContentItem, SourcePage, Source } from '../../../../lib/types';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const r2 = (locals as any)?.runtime?.env?.R2;
    const apiKey = (locals as any)?.runtime?.env?.DEEPSEEK_API_KEY || (typeof process !== 'undefined' ? process.env?.DEEPSEEK_API_KEY : '');

    const db = getDb(d1);
    const storage = getStorage(r2);
    const body = (await request.json()) as any;

    const { content_item_id, action } = body;

    if (!content_item_id || !action) {
      return new Response(JSON.stringify({ success: false, error: 'content_item_id and action are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const item = await db.first<ContentItem>('SELECT * FROM content_items WHERE id = ?', [content_item_id]);
    if (!item) {
      return new Response(JSON.stringify({ success: false, error: 'Content item not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    switch (action) {
      case 'approve_publish': {
        await db.run(
          `UPDATE content_items SET
            status = 'published',
            verification_status = 'manual_override',
            published_at = COALESCE(published_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
          [content_item_id]
        );
        return new Response(
          JSON.stringify({ success: true, message: 'Content item approved and published successfully.' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      case 'save_draft': {
        await db.run(
          `UPDATE content_items SET
            status = 'draft',
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
          [content_item_id]
        );
        return new Response(
          JSON.stringify({ success: true, message: 'Content item saved as draft.' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      case 'reject': {
        await db.run(
          `UPDATE content_items SET
            status = 'archived',
            ai_status = 'failed',
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
          [content_item_id]
        );
        return new Response(
          JSON.stringify({ success: true, message: 'Content item rejected and archived.' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      case 'regenerate': {
        const client = new DeepSeekClient(
          {
            apiKey,
            mockMode: !apiKey || apiKey === 'mock_key',
          },
          db
        );

        let page: (SourcePage & { source_name?: string; raw_text_content?: string }) | null = null;
        if (item.source_url) {
          page = await db.first<SourcePage>('SELECT * FROM source_pages WHERE url = ?', [item.source_url]);
        }

        if (!page) {
          page = {
            id: `spage_${content_item_id}`,
            source_id: item.source_id || '',
            url: item.source_url || 'https://official-notice.gov.in',
            normalized_url: item.source_url || 'https://official-notice.gov.in',
            canonical_url: null,
            title: item.title,
            content_type: 'html',
            fingerprint: item.source_hash || 'hash',
            last_content_hash: item.source_hash || 'hash',
            first_seen_at: item.created_at,
            last_seen_at: item.updated_at,
            last_changed_at: item.updated_at,
            last_status: 'NEW',
            http_status: 200,
            r2_key: null,
            metadata_json: null,
            raw_text_content: item.article_content || item.title,
            created_at: item.created_at,
            updated_at: item.updated_at,
          };
        }

        const source = item.source_id ? await db.first<Source>('SELECT * FROM sources WHERE id = ?', [item.source_id]) : null;
        const pipelineRes = await runAIPipeline(db, storage, client, page, source);

        return new Response(
          JSON.stringify({
            success: pipelineRes.success,
            message: 'Content regenerated through AI pipeline.',
            data: pipelineRes,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(JSON.stringify({ success: false, error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Review action failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
