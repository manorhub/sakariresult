// src/pages/api/admin/organizations/[id].ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { slugify } from '../../../../lib/utils';
import type { Organization } from '../../../../lib/types';

export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const id = params.id;
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const org = await db.first<Organization>('SELECT * FROM organizations WHERE id = ?', [id]);
    if (!org) {
      return new Response(JSON.stringify({ success: false, error: 'Organization not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, data: org }), {
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

    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const existing = await db.first('SELECT id FROM organizations WHERE slug = ? AND id != ?', [slug, id]);
    if (existing) {
      return new Response(JSON.stringify({ success: false, error: 'Slug is already used by another organization.' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await db.run(
      `UPDATE organizations
       SET name = ?, slug = ?, website = ?, logo_r2_key = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, slug, website, logo_r2_key, description, status, id]
    );

    return new Response(JSON.stringify({ success: true, message: 'Organization updated successfully' }), {
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

    await db.run('DELETE FROM organizations WHERE id = ?', [id]);
    return new Response(JSON.stringify({ success: true, message: 'Organization deleted successfully' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
