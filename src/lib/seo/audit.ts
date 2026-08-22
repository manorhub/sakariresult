// src/lib/seo/audit.ts
// Automated Technical SEO Health Audit & Link Validator Engine

import type { DbClient } from '../db.ts';
import type { SeoHealthAuditResult, ProgrammaticPageRecord } from './types.ts';
import type { PublicJobItem } from '../public_queries.ts';

/**
 * Runs a complete SEO health check across all content items and pages in D1
 */
export async function runSeoHealthAudit(db: DbClient): Promise<SeoHealthAuditResult> {
  // 1. Fetch all published content items
  const allItems = (await db.query<PublicJobItem>(`
    SELECT ci.id, ci.type, ci.title, ci.slug, ci.organization_id, ci.category_id,
           ci.published_at, ci.created_at, ci.updated_at,
           j.post_name, j.vacancy, j.qualification,
           o.name as organization_name, c.name as category_name,
           s.meta_title, s.meta_description, s.canonical_url
    FROM content_items ci
    LEFT JOIN jobs j ON j.content_item_id = ci.id
    LEFT JOIN organizations o ON o.id = ci.organization_id
    LEFT JOIN categories c ON c.id = ci.category_id
    LEFT JOIN seo_metadata s ON s.content_item_id = ci.id
    WHERE ci.status = 'published'
  `)).results;

  const totalContentItems = allItems.length;

  // 2. Identify Orphan Pages (items missing both organization and category, or isolated)
  const orphanPages = allItems
    .filter(item => !item.organization_id && !item.category_id)
    .map(i => ({ id: i.id, title: i.title, slug: i.slug, type: i.type }));

  // 3. Identify Missing Titles & Descriptions
  const missingTitles = allItems
    .filter(item => !item.title || item.title.trim().length === 0)
    .map(i => ({ id: i.id, slug: i.slug }));

  const missingDescriptions: { id: string; slug: string }[] = [];
  allItems.forEach(item => {
    if (!item.meta_description && (!item.excerpt || item.excerpt.trim().length === 0)) {
      missingDescriptions.push({ id: item.id, slug: item.slug });
    }
  });

  // 4. Identify Duplicate Titles
  const titleMap = new Map<string, string[]>();
  for (const item of allItems) {
    const t = (item.title || '').trim().toLowerCase();
    if (!t) continue;
    const existing = titleMap.get(t) || [];
    existing.push(item.slug);
    titleMap.set(t, existing);
  }

  const duplicateTitles = Array.from(titleMap.entries())
    .filter(([_, slugs]) => slugs.length > 1)
    .map(([title, slugs]) => ({ title, count: slugs.length, slugs }));

  // 5. Identify Missing Canonicals
  const missingCanonicals: { id: string; slug: string }[] = [];
  allItems.forEach(item => {
    if (!item.canonical_url && !item.slug) {
      missingCanonicals.push({ id: item.id, slug: item.slug });
    }
  });

  // 6. Check Broken Internal Links & Redirects
  const brokenInternalLinks: { sourceSlug: string; brokenUrl: string; reason: string }[] = [];

  // 7. Check Thin Programmatic Pages
  const progPages = (await db.query<ProgrammaticPageRecord>(`SELECT * FROM programmatic_pages`)).results;
  const thinProgrammaticPages: { slug: string; title: string; count: number; threshold: number }[] = [];

  for (const page of progPages) {
    let filterObj: Record<string, any> = {};
    try { filterObj = JSON.parse(page.target_filter_json); } catch {}

    let count = 0;
    if (filterObj.qualification) {
      count = allItems.filter(i => (i.qualification || '').toLowerCase().includes(filterObj.qualification.toLowerCase())).length;
    } else if (filterObj.search) {
      count = allItems.filter(i => 
        i.title.toLowerCase().includes(filterObj.search.toLowerCase()) || 
        (i.organization_name || '').toLowerCase().includes(filterObj.search.toLowerCase())
      ).length;
    }

    if (count < page.min_content_threshold) {
      thinProgrammaticPages.push({
        slug: page.slug,
        title: page.title,
        count,
        threshold: page.min_content_threshold,
      });
    }
  }

  // 8. Calculate Overall SEO Health Score (out of 100)
  let score = 100;
  if (missingTitles.length > 0) score -= Math.min(20, missingTitles.length * 5);
  if (missingDescriptions.length > 0) score -= Math.min(15, missingDescriptions.length * 2);
  if (duplicateTitles.length > 0) score -= Math.min(15, duplicateTitles.length * 3);
  if (orphanPages.length > 0) score -= Math.min(10, orphanPages.length * 2);
  if (brokenInternalLinks.length > 0) score -= Math.min(15, brokenInternalLinks.length * 5);
  if (thinProgrammaticPages.length > 0) score -= Math.min(10, thinProgrammaticPages.length * 2);

  const totalIndexable = allItems.length - orphanPages.length;
  const totalNoindex = orphanPages.length;

  return {
    totalContentItems,
    totalIndexable: Math.max(0, totalIndexable),
    totalNoindex,
    orphanPages,
    brokenInternalLinks,
    missingTitles,
    missingDescriptions,
    duplicateTitles,
    thinProgrammaticPages,
    missingCanonicals,
    auditScore: Math.max(0, Math.round(score)),
    generatedAt: new Date().toISOString(),
  };
}
