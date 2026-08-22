// src/pages/api/admin/organizations/index.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { slugify, generateId } from '../../../../lib/utils';
import type { Organization } from '../../../../lib/types';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const query = `
      SELECT o.*, COUNT(ci.id) as content_count
      FROM organizations o
      LEFT JOIN content_items ci ON ci.organization_id = o.id
      GROUP BY o.id
      ORDER BY o.name ASC
    `;
    const res = await db.query<Organization>(query);
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
    const name = body.name?.trim();
    if (!name) {
      return new Response(JSON.stringify({ success: false, error: 'Organization name is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const slug = body.slug ? slugify(body.slug) : slugify(name);
    const website = body.website?.trim() || null;
    const logo_r2_key = body.logo_r2_key?.trim() || null;
    const description = body.description?.trim() || null;
    const status = body.status === 'inactive' ? 'inactive' : 'active';
    const id = generateId('org');

    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    // Check slug uniqueness
    const existing = await db.first('SELECT id FROM organizations WHERE slug = ?', [slug]);
    if (existing) {
      return new Response(JSON.stringify({ success: false, error: 'Organization slug already exists.' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await db.run(
      `INSERT INTO organizations (id, name, slug, website, logo_r2_key, description, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [id, name, slug, website, logo_r2_key, description, status]
    );

    return new Response(JSON.stringify({ success: true, data: { id, name, slug } }), {
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
