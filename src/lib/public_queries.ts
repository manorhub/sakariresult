// src/lib/public_queries.ts
// Reusable database query helper functions for the public website
// Strictly enforces published status on all public views unless admin preview is active.

import type { DbClient } from './db.ts';
import type { ContentItem, ContentType, Organization } from './types.ts';

export interface PublicJobItem extends ContentItem {
  category_name?: string;
  category_slug?: string;
  organization_name?: string;
  organization_slug?: string;
  organization_logo?: string;
  organization_website?: string;
  source_name?: string;
  source_base_url?: string;
  post_name?: string;
  total_vacancies?: number | string;
  qualification?: string;
  application_start_date?: string;
  application_last_date?: string;
  fee_details?: string;
  age_limit?: string;
  salary?: string;
  selection_process?: string;
  how_to_apply?: string;
  official_notification_url?: string;
  apply_online_url?: string;
  admit_card_url?: string;
  result_url?: string;
  answer_key_url?: string;
  calculated_status?: string;
  excerpt?: string;
  seo_title?: string;
  meta_description?: string;
  canonical_url?: string;
  update_summary?: string;
  article_content?: string;
  extracted_data_json?: string;
  faq_json?: string;
}

export interface PaginationResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Calculates a dynamic status for a job/content item based on verified dates and explicit fields
 */
export function calculateJobStatus(item: Partial<PublicJobItem>): string {
  // If item has an explicit verified status or custom status
  if (item.calculated_status) return item.calculated_status;

  const now = new Date();
  const lastDateStr = item.application_last_date;
  const startDateStr = item.application_start_date;

  if (item.type === 'result') return 'Result Released';
  if (item.type === 'admit_card') return 'Admit Card Released';
  if (item.type === 'answer_key') return 'Answer Key Released';

  if (!lastDateStr && !startDateStr) {
    return 'Notification Released';
  }

  if (startDateStr) {
    const startDate = new Date(startDateStr);
    if (!isNaN(startDate.getTime()) && startDate > now) {
      return 'Upcoming';
    }
  }

  if (lastDateStr) {
    const lastDate = new Date(lastDateStr);
    if (!isNaN(lastDate.getTime())) {
      // Set to end of the day in IST/UTC
      lastDate.setHours(23, 59, 59, 999);
      if (lastDate < now) {
        return 'Application Closed';
      }

      // Check if closing soon (within next 3 days)
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      if (lastDate <= threeDaysFromNow) {
        return 'Closing Soon';
      }

      return 'Applications Open';
    }
  }

  return 'Active';
}

/**
 * Fetches dynamic announcement banner text from settings
 */
export async function getAnnouncement(db: DbClient): Promise<string | null> {
  const row = await db.first<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['announcement_bar']);
  if (row && row.value && row.value.trim().length > 0 && row.value !== 'false') {
    return row.value.trim();
  }
  return null;
}

/**
 * Fetches homepage data in efficient batched queries
 */
export async function getHomepageData(db: DbClient) {
  const announcement = await getAnnouncement(db);

  // 1. Latest Published Jobs (8 items)
  const latestJobs = (await db.query<PublicJobItem>(`
    SELECT ci.*, j.post_name, j.vacancy as total_vacancies, j.qualification, j.application_start as application_start_date, j.application_last_date,
           c.name as category_name, c.slug as category_slug,
           o.name as organization_name, o.slug as organization_slug, o.logo_r2_key as organization_logo
    FROM content_items ci
    LEFT JOIN jobs j ON j.content_item_id = ci.id
    LEFT JOIN categories c ON c.id = ci.category_id
    LEFT JOIN organizations o ON o.id = ci.organization_id
    WHERE ci.status = 'published' AND ci.type = 'job'
    ORDER BY ci.published_at DESC, ci.created_at DESC
    LIMIT 8
  `)).results.map(item => ({ ...item, calculated_status: calculateJobStatus(item) }));

  // 2. Latest Results (6 items)
  const latestResults = (await db.query<PublicJobItem>(`
    SELECT ci.*, c.name as category_name, o.name as organization_name, o.slug as organization_slug
    FROM content_items ci
    LEFT JOIN categories c ON c.id = ci.category_id
    LEFT JOIN organizations o ON o.id = ci.organization_id
    WHERE ci.status = 'published' AND ci.type = 'result'
    ORDER BY ci.published_at DESC, ci.created_at DESC
    LIMIT 6
  `)).results;

  // 3. Latest Admit Cards (6 items)
  const latestAdmitCards = (await db.query<PublicJobItem>(`
    SELECT ci.*, c.name as category_name, o.name as organization_name, o.slug as organization_slug
    FROM content_items ci
    LEFT JOIN categories c ON c.id = ci.category_id
    LEFT JOIN organizations o ON o.id = ci.organization_id
    WHERE ci.status = 'published' AND ci.type = 'admit_card'
    ORDER BY ci.published_at DESC, ci.created_at DESC
    LIMIT 6
  `)).results;

  // 4. Latest Answer Keys (6 items)
  const latestAnswerKeys = (await db.query<PublicJobItem>(`
    SELECT ci.*, c.name as category_name, o.name as organization_name, o.slug as organization_slug
    FROM content_items ci
    LEFT JOIN categories c ON c.id = ci.category_id
    LEFT JOIN organizations o ON o.id = ci.organization_id
    WHERE ci.status = 'published' AND ci.type = 'answer_key'
    ORDER BY ci.published_at DESC, ci.created_at DESC
    LIMIT 6
  `)).results;

  // 5. Closing Soon Jobs (6 items with deadline in the future)
  const closingSoonJobs = (await db.query<PublicJobItem>(`
    SELECT ci.*, j.post_name, j.vacancy as total_vacancies, j.qualification, j.application_last_date,
           c.name as category_name, o.name as organization_name, o.slug as organization_slug
    FROM content_items ci
    JOIN jobs j ON j.content_item_id = ci.id
    LEFT JOIN categories c ON c.id = ci.category_id
    LEFT JOIN organizations o ON o.id = ci.organization_id
    WHERE ci.status = 'published' AND ci.type = 'job'
      AND j.application_last_date IS NOT NULL
      AND j.application_last_date >= date('now')
    ORDER BY j.application_last_date ASC
    LIMIT 6
  `)).results.map(item => ({ ...item, calculated_status: 'Closing Soon' }));

  // 6. Recently Updated Items (6 items with updates or version history)
  const recentlyUpdated = (await db.query<PublicJobItem>(`
    SELECT ci.*, c.name as category_name, o.name as organization_name, o.slug as organization_slug
    FROM content_items ci
    LEFT JOIN categories c ON c.id = ci.category_id
    LEFT JOIN organizations o ON o.id = ci.organization_id
    WHERE ci.status = 'published' AND ci.updated_at > ci.created_at
    ORDER BY ci.updated_at DESC
    LIMIT 6
  `)).results;

  // 7. Popular Categories with content counts
  const popularCategories = (await db.query<{ id: string; name: string; slug: string; count: number }>(`
    SELECT c.id, c.name, c.slug, COUNT(ci.id) as count
    FROM categories c
    JOIN content_items ci ON ci.category_id = c.id
    WHERE ci.status = 'published'
    GROUP BY c.id
    HAVING count > 0
    ORDER BY count DESC
    LIMIT 8
  `)).results;

  // 8. Popular Organizations with content counts
  const popularOrganizations = (await db.query<{ id: string; name: string; slug: string; count: number }>(`
    SELECT o.id, o.name, o.slug, COUNT(ci.id) as count
    FROM organizations o
    JOIN content_items ci ON ci.organization_id = o.id
    WHERE ci.status = 'published'
    GROUP BY o.id
    HAVING count > 0
    ORDER BY count DESC
    LIMIT 8
  `)).results;

  return {
    announcement,
    latestJobs,
    latestResults,
    latestAdmitCards,
    latestAnswerKeys,
    closingSoonJobs,
    recentlyUpdated,
    popularCategories,
    popularOrganizations,
  };
}

/**
 * Paginated content listing for category/type pages
 */
export async function getCategoryContent(
  db: DbClient,
  type: ContentType,
  options: {
    page?: number;
    limit?: number;
    organizationSlug?: string;
    categorySlug?: string;
    qualification?: string;
    state?: string;
    sort?: 'latest' | 'deadline' | 'vacancies';
  } = {}
): Promise<PaginationResult<PublicJobItem>> {
  const page = Math.max(options.page || 1, 1);
  const limit = Math.min(Math.max(options.limit || 12, 1), 50);
  const offset = (page - 1) * limit;

  const conditions: string[] = ["ci.status = 'published'", "ci.type = ?"];
  const params: any[] = [type];

  if (options.organizationSlug) {
    conditions.push('o.slug = ?');
    params.push(options.organizationSlug);
  }

  if (options.categorySlug) {
    conditions.push('c.slug = ?');
    params.push(options.categorySlug);
  }

  if (options.qualification && options.qualification.trim().length > 0) {
    conditions.push('j.qualification LIKE ?');
    params.push(`%${options.qualification}%`);
  }

  if (options.state && options.state.trim().length > 0) {
    conditions.push('(ci.title LIKE ? OR o.name LIKE ?)');
    params.push(`%${options.state}%`, `%${options.state}%`);
  }

  const whereClause = conditions.join(' AND ');

  let orderBy = 'ci.published_at DESC, ci.created_at DESC';
  if (options.sort === 'deadline') {
    orderBy = "CASE WHEN j.application_last_date IS NULL THEN 1 ELSE 0 END, j.application_last_date ASC";
  } else if (options.sort === 'vacancies') {
    orderBy = "CAST(j.vacancy AS INTEGER) DESC";
  }

  // Count query
  const countRow = await db.first<{ count: number }>(`
    SELECT COUNT(ci.id) as count
    FROM content_items ci
    LEFT JOIN jobs j ON j.content_item_id = ci.id
    LEFT JOIN categories c ON c.id = ci.category_id
    LEFT JOIN organizations o ON o.id = ci.organization_id
    WHERE ${whereClause}
  `, params);

  const total = countRow?.count || 0;
  const totalPages = Math.ceil(total / limit);

  // Items query
  const items = (await db.query<PublicJobItem>(`
    SELECT ci.*, j.post_name, j.vacancy as total_vacancies, j.qualification, j.application_start as application_start_date, j.application_last_date,
           j.application_fee as fee_details, j.age_limit, j.salary, j.official_notification_url, j.official_apply_url as apply_online_url,
           c.name as category_name, c.slug as category_slug,
           o.name as organization_name, o.slug as organization_slug, o.logo_r2_key as organization_logo
    FROM content_items ci
    LEFT JOIN jobs j ON j.content_item_id = ci.id
    LEFT JOIN categories c ON c.id = ci.category_id
    LEFT JOIN organizations o ON o.id = ci.organization_id
    WHERE ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `, [...params, limit, offset])).results.map(item => ({
    ...item,
    calculated_status: calculateJobStatus(item)
  }));

  return {
    items,
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/**
 * Fetches a single content item by type and slug
 */
export async function getContentItemBySlug(
  db: DbClient,
  type: ContentType,
  slug: string,
  options: { allowPreview?: boolean } = {}
): Promise<{ item: PublicJobItem | null; isPreview: boolean }> {
  let whereClause = 'ci.slug = ? AND ci.type = ?';
  const params: any[] = [slug, type];

  if (!options.allowPreview) {
    whereClause += " AND ci.status = 'published'";
  }

  const item = await db.first<PublicJobItem>(`
    SELECT ci.*, j.post_name, j.vacancy as total_vacancies, j.qualification, j.application_start as application_start_date, j.application_last_date,
           j.application_fee as fee_details, j.age_limit, j.salary, j.selection_process,
           j.official_notification_url, j.official_apply_url as apply_online_url,
           c.name as category_name, c.slug as category_slug,
           o.name as organization_name, o.slug as organization_slug, o.logo_r2_key as organization_logo, o.website as organization_website,
           s.name as source_name, s.base_url as source_base_url
    FROM content_items ci
    LEFT JOIN jobs j ON j.content_item_id = ci.id
    LEFT JOIN categories c ON c.id = ci.category_id
    LEFT JOIN organizations o ON o.id = ci.organization_id
    LEFT JOIN sources s ON s.id = ci.source_id
    WHERE ${whereClause}
  `, params);

  if (!item) {
    return { item: null, isPreview: false };
  }

  const isPreview = item.status !== 'published';
  item.calculated_status = calculateJobStatus(item);

  return { item, isPreview };
}

/**
 * Deterministic multi-tier Related Content Engine
 */
export async function getRelatedContent(
  db: DbClient,
  item: PublicJobItem,
  limit: number = 6
): Promise<PublicJobItem[]> {
  const results: PublicJobItem[] = [];
  const seenIds = new Set<string>([item.id]);

  // Tier 1: Same Organization
  if (item.organization_id) {
    const orgItems = (await db.query<PublicJobItem>(`
      SELECT ci.*, c.name as category_name, o.name as organization_name, o.slug as organization_slug
      FROM content_items ci
      LEFT JOIN categories c ON c.id = ci.category_id
      LEFT JOIN organizations o ON o.id = ci.organization_id
      WHERE ci.status = 'published' AND ci.organization_id = ? AND ci.id != ?
      ORDER BY ci.published_at DESC
      LIMIT ?
    `, [item.organization_id, item.id, limit])).results;

    for (const it of orgItems) {
      if (!seenIds.has(it.id)) {
        seenIds.add(it.id);
        results.push({ ...it, calculated_status: calculateJobStatus(it) });
      }
    }
  }

  // Tier 2: Same Category
  if (results.length < limit && item.category_id) {
    const remaining = limit - results.length;
    const catItems = (await db.query<PublicJobItem>(`
      SELECT ci.*, c.name as category_name, o.name as organization_name, o.slug as organization_slug
      FROM content_items ci
      LEFT JOIN categories c ON c.id = ci.category_id
      LEFT JOIN organizations o ON o.id = ci.organization_id
      WHERE ci.status = 'published' AND ci.category_id = ? AND ci.id != ?
      ORDER BY ci.published_at DESC
      LIMIT ?
    `, [item.category_id, item.id, remaining])).results;

    for (const it of catItems) {
      if (!seenIds.has(it.id)) {
        seenIds.add(it.id);
        results.push({ ...it, calculated_status: calculateJobStatus(it) });
      }
    }
  }

  // Tier 3: Same Content Type & Recent
  if (results.length < limit) {
    const remaining = limit - results.length;
    const recentItems = (await db.query<PublicJobItem>(`
      SELECT ci.*, c.name as category_name, o.name as organization_name, o.slug as organization_slug
      FROM content_items ci
      LEFT JOIN categories c ON c.id = ci.category_id
      LEFT JOIN organizations o ON o.id = ci.organization_id
      WHERE ci.status = 'published' AND ci.type = ? AND ci.id != ?
      ORDER BY ci.published_at DESC
      LIMIT ?
    `, [item.type, item.id, remaining])).results;

    for (const it of recentItems) {
      if (!seenIds.has(it.id)) {
        seenIds.add(it.id);
        results.push({ ...it, calculated_status: calculateJobStatus(it) });
      }
    }
  }

  return results.slice(0, limit);
}

/**
 * High-performance Server-Side Search Engine across multiple fields
 */
export async function searchContent(
  db: DbClient,
  query: string,
  filters: {
    type?: string;
    qualification?: string;
    organizationSlug?: string;
    state?: string;
    dateRange?: 'today' | '7days' | '30days' | 'all';
    page?: number;
    limit?: number;
  } = {}
): Promise<PaginationResult<PublicJobItem>> {
  const page = Math.max(filters.page || 1, 1);
  const limit = Math.min(Math.max(filters.limit || 12, 1), 50);
  const offset = (page - 1) * limit;

  const conditions: string[] = ["ci.status = 'published'"];
  const params: any[] = [];

  // Query parameter search
  const trimmedQuery = (query || '').trim();
  if (trimmedQuery.length > 0) {
    conditions.push(`(
      ci.title LIKE ? OR
      o.name LIKE ? OR
      j.post_name LIKE ? OR
      c.name LIKE ?
    )`);
    const searchPattern = `%${trimmedQuery}%`;
    params.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  // Filter: Type
  if (filters.type && filters.type !== 'all') {
    conditions.push('ci.type = ?');
    params.push(filters.type);
  }

  // Filter: Qualification
  if (filters.qualification && filters.qualification !== 'all') {
    conditions.push('j.qualification LIKE ?');
    params.push(`%${filters.qualification}%`);
  }

  // Filter: Organization
  if (filters.organizationSlug && filters.organizationSlug !== 'all') {
    conditions.push('o.slug = ?');
    params.push(filters.organizationSlug);
  }

  // Filter: State
  if (filters.state && filters.state !== 'all') {
    conditions.push('(ci.title LIKE ? OR o.name LIKE ?)');
    params.push(`%${filters.state}%`, `%${filters.state}%`);
  }

  // Filter: Date Range
  if (filters.dateRange === 'today') {
    conditions.push("ci.published_at >= datetime('now', '-1 day')");
  } else if (filters.dateRange === '7days') {
    conditions.push("ci.published_at >= datetime('now', '-7 days')");
  } else if (filters.dateRange === '30days') {
    conditions.push("ci.published_at >= datetime('now', '-30 days')");
  }

  const whereClause = conditions.join(' AND ');

  const countRow = await db.first<{ count: number }>(`
    SELECT COUNT(ci.id) as count
    FROM content_items ci
    LEFT JOIN jobs j ON j.content_item_id = ci.id
    LEFT JOIN categories c ON c.id = ci.category_id
    LEFT JOIN organizations o ON o.id = ci.organization_id
    WHERE ${whereClause}
  `, params);

  const total = countRow?.count || 0;
  const totalPages = Math.ceil(total / limit);

  const items = (await db.query<PublicJobItem>(`
    SELECT ci.*, j.post_name, j.vacancy as total_vacancies, j.qualification, j.application_start as application_start_date, j.application_last_date,
           c.name as category_name, c.slug as category_slug,
           o.name as organization_name, o.slug as organization_slug
    FROM content_items ci
    LEFT JOIN jobs j ON j.content_item_id = ci.id
    LEFT JOIN categories c ON c.id = ci.category_id
    LEFT JOIN organizations o ON o.id = ci.organization_id
    WHERE ${whereClause}
    ORDER BY ci.published_at DESC, ci.created_at DESC
    LIMIT ? OFFSET ?
  `, [...params, limit, offset])).results.map(item => ({
    ...item,
    calculated_status: calculateJobStatus(item)
  }));

  return {
    items,
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/**
 * Fetches organization by slug and all its published sections
 */
export async function getOrganizationDetails(db: DbClient, slug: string) {
  const org = await db.first<Organization>('SELECT * FROM organizations WHERE slug = ?', [slug]);
  if (!org) return null;

  const items = (await db.query<PublicJobItem>(`
    SELECT ci.*, j.post_name, j.vacancy as total_vacancies, j.qualification, j.application_last_date,
           c.name as category_name
    FROM content_items ci
    LEFT JOIN jobs j ON j.content_item_id = ci.id
    LEFT JOIN categories c ON c.id = ci.category_id
    WHERE ci.status = 'published' AND ci.organization_id = ?
    ORDER BY ci.published_at DESC
  `, [org.id])).results.map(i => ({ ...i, calculated_status: calculateJobStatus(i) }));

  const jobs = items.filter(i => i.type === 'job');
  const results = items.filter(i => i.type === 'result');
  const admitCards = items.filter(i => i.type === 'admit_card');
  const answerKeys = items.filter(i => i.type === 'answer_key');
  const exams = items.filter(i => i.type === 'exam');

  return {
    org,
    totalCount: items.length,
    jobs,
    results,
    admitCards,
    answerKeys,
    exams,
  };
}

/**
 * List of recognized Indian States with slug mappings
 */
export const INDIAN_STATES = [
  { name: 'Andhra Pradesh', slug: 'andhra-pradesh' },
  { name: 'Assam', slug: 'assam' },
  { name: 'Bihar', slug: 'bihar' },
  { name: 'Chandigarh', slug: 'chandigarh' },
  { name: 'Chhattisgarh', slug: 'chhattisgarh' },
  { name: 'Delhi', slug: 'delhi' },
  { name: 'Gujarat', slug: 'gujarat' },
  { name: 'Haryana', slug: 'haryana' },
  { name: 'Himachal Pradesh', slug: 'himachal-pradesh' },
  { name: 'Jharkhand', slug: 'jharkhand' },
  { name: 'Karnataka', slug: 'karnataka' },
  { name: 'Kerala', slug: 'kerala' },
  { name: 'Madhya Pradesh', slug: 'madhya-pradesh' },
  { name: 'Maharashtra', slug: 'maharashtra' },
  { name: 'Odisha', slug: 'odisha' },
  { name: 'Punjab', slug: 'punjab' },
  { name: 'Rajasthan', slug: 'rajasthan' },
  { name: 'Tamil Nadu', slug: 'tamil-nadu' },
  { name: 'Telangana', slug: 'telangana' },
  { name: 'Uttar Pradesh', slug: 'uttar-pradesh' },
  { name: 'Uttarakhand', slug: 'uttarakhand' },
  { name: 'West Bengal', slug: 'west-bengal' },
];

/**
 * Fetches state details and published items matching state name
 */
export async function getStateDetails(db: DbClient, stateSlug: string) {
  const stateObj = INDIAN_STATES.find(s => s.slug === stateSlug);
  if (!stateObj) return null;

  const items = (await db.query<PublicJobItem>(`
    SELECT ci.*, j.post_name, j.vacancy as total_vacancies, j.qualification, j.application_last_date,
           c.name as category_name, o.name as organization_name, o.slug as organization_slug
    FROM content_items ci
    LEFT JOIN jobs j ON j.content_item_id = ci.id
    LEFT JOIN categories c ON c.id = ci.category_id
    LEFT JOIN organizations o ON o.id = ci.organization_id
    WHERE ci.status = 'published' AND (
      ci.title LIKE ? OR
      o.name LIKE ?
    )
    ORDER BY ci.published_at DESC
  `, [`%${stateObj.name}%`, `%${stateObj.name}%`])).results.map(i => ({
    ...i,
    calculated_status: calculateJobStatus(i)
  }));

  if (items.length === 0) return null;

  return {
    state: stateObj,
    items,
    totalCount: items.length,
    jobs: items.filter(i => i.type === 'job'),
    results: items.filter(i => i.type === 'result'),
    admitCards: items.filter(i => i.type === 'admit_card'),
    exams: items.filter(i => i.type === 'exam'),
  };
}
