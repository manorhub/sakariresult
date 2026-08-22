// src/pages/api/admin/categories/index.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { slugify, generateId } from '../../../../lib/utils';
import type { Category } from '../../../../lib/types';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const query = `
      SELECT c.*, COUNT(ci.id) as content_count
      FROM categories c
      LEFT JOIN content_items ci ON ci.category_id = c.id
      GROUP BY c.id
      ORDER BY c.sort_order ASC, c.name ASC
    `;
    const res = await db.query<Category>(query);
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
      return new Response(JSON.stringify({ success: false, error: 'Category name is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const slug = body.slug ? slugify(body.slug) : slugify(name);
    const description = body.description?.trim() || null;
    const status = body.status === 'inactive' ? 'inactive' : 'active';
    const sort_order = Number(body.sort_order) || 0;
    const id = generateId('cat');

    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    // Check slug uniqueness
    const existing = await db.first('SELECT id FROM categories WHERE slug = ?', [slug]);
    if (existing) {
      return new Response(JSON.stringify({ success: false, error: 'Category slug already exists. Please choose another.' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await db.run(
      `INSERT INTO categories (id, name, slug, description, status, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [id, name, slug, description, status, sort_order]
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
