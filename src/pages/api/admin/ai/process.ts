// src/pages/api/admin/ai/process.ts
// API route to trigger DeepSeek AI processing pipeline on a source page or content item

import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { getStorage } from '../../../../lib/r2';
import { DeepSeekClient } from '../../../../lib/ai/deepseek';
import { runAIPipeline } from '../../../../lib/ai/pipeline';
import type { SourcePage, Source, ContentItem } from '../../../../lib/types';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const r2 = (locals as any)?.runtime?.env?.R2;
    const apiKey = (locals as any)?.runtime?.env?.DEEPSEEK_API_KEY || (typeof process !== 'undefined' ? process.env?.DEEPSEEK_API_KEY : '');
    
    const db = getDb(d1);
    const storage = getStorage(r2);
    const body = (await request.json()) as any;

    const { source_page_id, content_item_id, force_mock } = body;

    if (!source_page_id && !content_item_id) {
      return new Response(JSON.stringify({ success: false, error: 'Either source_page_id or content_item_id must be provided.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let page: (SourcePage & { source_name?: string; raw_text_content?: string }) | null = null;
    let source: Source | null = null;

    if (source_page_id) {
      page = await db.first<SourcePage & { source_name?: string }>(`
        SELECT sp.*, s.name as source_name, s.base_url as source_base_url, s.trust_level
        FROM source_pages sp
        LEFT JOIN sources s ON s.id = sp.source_id
        WHERE sp.id = ?
      `, [source_page_id]);

      if (page && page.source_id) {
        source = await db.first<Source>('SELECT * FROM sources WHERE id = ?', [page.source_id]);
      }
    } else if (content_item_id) {
      const item = await db.first<ContentItem>('SELECT * FROM content_items WHERE id = ?', [content_item_id]);
      if (item) {
        if (item.source_url) {
          page = await db.first<SourcePage>('SELECT * FROM source_pages WHERE url = ?', [item.source_url]);
        }
        if (!page) {
          // Synthetic page from item
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
        if (item.source_id) {
          source = await db.first<Source>('SELECT * FROM sources WHERE id = ?', [item.source_id]);
        }
      }
    }

    if (!page) {
      return new Response(JSON.stringify({ success: false, error: 'Source page or content record not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const aiClient = new DeepSeekClient(
      {
        apiKey,
        mockMode: force_mock !== undefined ? !!force_mock : (!apiKey || apiKey === 'mock_key'),
      },
      db
    );

    const result = await runAIPipeline(db, storage, aiClient, page, source);

    return new Response(
      JSON.stringify({
        success: result.success,
        data: result,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'AI pipeline processing failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
