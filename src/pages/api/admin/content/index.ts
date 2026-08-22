// src/pages/api/admin/content/index.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { slugify, generateId } from '../../../../lib/utils';
import type { ContentItem } from '../../../../lib/types';

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const type = url.searchParams.get('type');
    const status = url.searchParams.get('status');
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100);

    let query = `
      SELECT ci.*, 
             c.name as category_name, 
             o.name as organization_name
      FROM content_items ci
      LEFT JOIN categories c ON c.id = ci.category_id
      LEFT JOIN organizations o ON o.id = ci.organization_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (type) {
      query += ' AND ci.type = ?';
      params.push(type);
    }
    if (status) {
      query += ' AND ci.status = ?';
      params.push(status);
    }

    query += ' ORDER BY ci.created_at DESC LIMIT ?';
    params.push(limit);

    const res = await db.query<ContentItem>(query, params);
    return new Response(JSON.stringify({ success: true, data: res.results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = (await request.json()) as any;
    const title = body.title?.trim();
    const type = body.type || 'job';

    if (!title) {
      return new Response(JSON.stringify({ success: false, error: 'Title is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const slug = body.slug ? slugify(body.slug) : slugify(title);
    const organization_id = body.organization_id || null;
    const category_id = body.category_id || null;
    const status = body.status || 'draft';
    const source_url = body.source_url || null;
    const source_id = body.source_id || null;
    const published_at = status === 'published' ? (body.published_at || new Date().toISOString()) : null;

    const content_id = generateId('cnt');

    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    // Check slug uniqueness
    const existing = await db.first('SELECT id FROM content_items WHERE slug = ?', [slug]);
    if (existing) {
      return new Response(JSON.stringify({ success: false, error: 'Slug already exists. Please choose a unique slug.' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Insert content_items
    await db.run(
      `INSERT INTO content_items (
        id, type, title, slug, organization_id, category_id, status,
        source_url, source_id, published_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [content_id, type, title, slug, organization_id, category_id, status, source_url, source_id, published_at]
    );

    // If job details are provided
    if (type === 'job' || body.job) {
      const job = body.job || {};
      const jobId = generateId('job');
      await db.run(
        `INSERT INTO jobs (
          id, content_item_id, post_name, vacancy, qualification, age_limit,
          application_start, application_last_date, exam_date, application_fee,
          salary, selection_process, official_notification_url, official_apply_url,
          official_website_url, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          jobId,
          content_id,
          job.post_name || title,
          job.vacancy || null,
          job.qualification || null,
          job.age_limit || null,
          job.application_start || null,
          job.application_last_date || null,
          job.exam_date || null,
          job.application_fee || null,
          job.salary || null,
          job.selection_process || null,
          job.official_notification_url || null,
          job.official_apply_url || null,
          job.official_website_url || null,
        ]
      );
    }

    // If SEO metadata is provided
    if (body.seo) {
      const seo = body.seo;
      const seoId = generateId('seo');
      await db.run(
        `INSERT INTO seo_metadata (
          id, content_item_id, meta_title, meta_description, canonical_url, og_title, og_description, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          seoId,
          content_id,
          seo.meta_title || title,
          seo.meta_description || null,
          seo.canonical_url || null,
          seo.og_title || title,
          seo.og_description || null,
        ]
      );
    }

    return new Response(JSON.stringify({ success: true, data: { id: content_id, slug, title } }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
