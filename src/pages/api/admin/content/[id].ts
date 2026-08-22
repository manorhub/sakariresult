// src/pages/api/admin/content/[id].ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { slugify, generateId } from '../../../../lib/utils';
import type { ContentItem, JobDetails, SeoMetadata } from '../../../../lib/types';

export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const id = params.id;
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const item = await db.first<ContentItem>(
      `SELECT ci.*, c.name as category_name, o.name as organization_name
       FROM content_items ci
       LEFT JOIN categories c ON c.id = ci.category_id
       LEFT JOIN organizations o ON o.id = ci.organization_id
       WHERE ci.id = ?`,
      [id]
    );

    if (!item) {
      return new Response(JSON.stringify({ success: false, error: 'Content item not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const job = await db.first<JobDetails>('SELECT * FROM jobs WHERE content_item_id = ?', [id]);
    const seo = await db.first<SeoMetadata>('SELECT * FROM seo_metadata WHERE content_item_id = ?', [id]);

    item.job_details = job;
    item.seo = seo;

    return new Response(JSON.stringify({ success: true, data: item }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
  try {
    const id = params.id;
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

    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    // Check slug uniqueness
    const existing = await db.first('SELECT id FROM content_items WHERE slug = ? AND id != ?', [slug, id]);
    if (existing) {
      return new Response(JSON.stringify({ success: false, error: 'Slug already exists on another item.' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Determine published_at
    const currentItem = await db.first<ContentItem>('SELECT published_at FROM content_items WHERE id = ?', [id]);
    let published_at = currentItem?.published_at;
    if (status === 'published' && !published_at) {
      published_at = new Date().toISOString();
    }

    await db.run(
      `UPDATE content_items
       SET type = ?, title = ?, slug = ?, organization_id = ?, category_id = ?,
           status = ?, source_url = ?, source_id = ?, published_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [type, title, slug, organization_id, category_id, status, source_url, source_id, published_at, id]
    );

    // Upsert job details
    if (body.job) {
      const job = body.job;
      const existingJob = await db.first('SELECT id FROM jobs WHERE content_item_id = ?', [id]);
      if (existingJob) {
        await db.run(
          `UPDATE jobs
           SET post_name = ?, vacancy = ?, qualification = ?, age_limit = ?,
               application_start = ?, application_last_date = ?, exam_date = ?,
               application_fee = ?, salary = ?, selection_process = ?,
               official_notification_url = ?, official_apply_url = ?, official_website_url = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE content_item_id = ?`,
          [
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
            id,
          ]
        );
      } else {
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
            id,
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
    }

    // Upsert SEO metadata
    if (body.seo) {
      const seo = body.seo;
      const existingSeo = await db.first('SELECT id FROM seo_metadata WHERE content_item_id = ?', [id]);
      if (existingSeo) {
        await db.run(
          `UPDATE seo_metadata
           SET meta_title = ?, meta_description = ?, canonical_url = ?, og_title = ?, og_description = ?, updated_at = CURRENT_TIMESTAMP
           WHERE content_item_id = ?`,
          [
            seo.meta_title || title,
            seo.meta_description || null,
            seo.canonical_url || null,
            seo.og_title || title,
            seo.og_description || null,
            id,
          ]
        );
      } else {
        const seoId = generateId('seo');
        await db.run(
          `INSERT INTO seo_metadata (
            id, content_item_id, meta_title, meta_description, canonical_url, og_title, og_description, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [
            seoId,
            id,
            seo.meta_title || title,
            seo.meta_description || null,
            seo.canonical_url || null,
            seo.og_title || title,
            seo.og_description || null,
          ]
        );
      }
    }

    return new Response(JSON.stringify({ success: true, message: 'Content updated successfully' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  try {
    const id = params.id;
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    await db.run('DELETE FROM content_items WHERE id = ?', [id]);
    return new Response(JSON.stringify({ success: true, message: 'Content deleted successfully' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
