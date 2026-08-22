// src/pages/api/admin/categories/[id].ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { slugify } from '../../../../lib/utils';
import type { Category } from '../../../../lib/types';

export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const id = params.id;
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const category = await db.first<Category>('SELECT * FROM categories WHERE id = ?', [id]);
    if (!category) {
      return new Response(JSON.stringify({ success: false, error: 'Category not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, data: category }), {
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
      return new Response(JSON.stringify({ success: false, error: 'Category name is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const slug = body.slug ? slugify(body.slug) : slugify(name);
    const description = body.description?.trim() || null;
    const status = body.status === 'inactive' ? 'inactive' : 'active';
    const sort_order = Number(body.sort_order) || 0;

    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    // Check slug uniqueness excluding this id
    const existing = await db.first('SELECT id FROM categories WHERE slug = ? AND id != ?', [slug, id]);
    if (existing) {
      return new Response(JSON.stringify({ success: false, error: 'Slug is already used by another category.' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await db.run(
      `UPDATE categories
       SET name = ?, slug = ?, description = ?, status = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, slug, description, status, sort_order, id]
    );

    return new Response(JSON.stringify({ success: true, message: 'Category updated successfully' }), {
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

    await db.run('DELETE FROM categories WHERE id = ?', [id]);
    return new Response(JSON.stringify({ success: true, message: 'Category deleted successfully' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
