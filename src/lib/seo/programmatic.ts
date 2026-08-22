// src/lib/seo/programmatic.ts
// Programmatic Landing Page Data & Quality Threshold Engine

import type { DbClient } from '../db.ts';
import type { ProgrammaticPageRecord } from './types.ts';
import type { PublicJobItem } from '../public_queries.ts';
import { calculateJobStatus } from '../public_queries.ts';

export interface ProgrammaticPageData {
  page: ProgrammaticPageRecord;
  items: PublicJobItem[];
  totalCount: number;
  isIndexable: boolean;
  robots: 'index, follow' | 'noindex, follow';
}

/**
 * Fetches data and evaluates quality threshold for a programmatic landing page
 */
export async function getProgrammaticPageData(
  db: DbClient,
  slug: string
): Promise<ProgrammaticPageData | null> {
  const page = await db.first<ProgrammaticPageRecord>(
    'SELECT * FROM programmatic_pages WHERE slug = ?',
    [slug]
  );

  if (!page) return null;

  let filterObj: { qualification?: string; search?: string; state?: string } = {};
  try {
    filterObj = JSON.parse(page.target_filter_json);
  } catch {}

  const conditions: string[] = ["ci.status = 'published'"];
  const params: any[] = [];

  if (filterObj.qualification) {
    conditions.push('j.qualification LIKE ?');
    params.push(`%${filterObj.qualification}%`);
  }

  if (filterObj.search) {
    conditions.push('(ci.title LIKE ? OR o.name LIKE ? OR j.post_name LIKE ?)');
    const term = `%${filterObj.search}%`;
    params.push(term, term, term);
  }

  const whereClause = conditions.join(' AND ');

  const items = (await db.query<PublicJobItem>(`
    SELECT ci.*, j.post_name, j.vacancy as total_vacancies, j.qualification, j.application_start as application_start_date, j.application_last_date,
           j.application_fee as fee_details, j.salary,
           c.name as category_name, c.slug as category_slug,
           o.name as organization_name, o.slug as organization_slug
    FROM content_items ci
    LEFT JOIN jobs j ON j.content_item_id = ci.id
    LEFT JOIN categories c ON c.id = ci.category_id
    LEFT JOIN organizations o ON o.id = ci.organization_id
    WHERE ${whereClause}
    ORDER BY ci.published_at DESC, ci.created_at DESC
    LIMIT 30
  `, params)).results.map(item => ({
    ...item,
    calculated_status: calculateJobStatus(item),
  }));

  const totalCount = items.length;
  // Quality Rule: Only index if content meets or exceeds threshold
  const isIndexable = Boolean(page.is_indexable === 1 && totalCount >= page.min_content_threshold);
  const robots = isIndexable ? 'index, follow' : 'noindex, follow';

  return {
    page,
    items,
    totalCount,
    isIndexable,
    robots,
  };
}
