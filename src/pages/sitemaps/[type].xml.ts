// src/pages/sitemaps/[type].xml.ts
// Dynamic Child XML Sitemaps with Authentic Database Timestamps

import type { APIRoute } from 'astro';
import { getDb } from '../../lib/db.ts';
import { INDIAN_STATES } from '../../lib/public_queries.ts';
import type { SitemapEntry } from '../../lib/seo/types.ts';

export const GET: APIRoute = async ({ params, locals, url, site }) => {
  const { type } = params;
  const baseOrigin = (site ? site.toString() : url.origin).replace(/\/+$/, '');

  const d1 = (locals as any)?.runtime?.env?.DB;
  const db = getDb(d1);

  const entries: SitemapEntry[] = [];

  try {
    if (type === 'jobs' || type === 'results' || type === 'admit-card' || type === 'answer-key' || type === 'exams') {
      const contentTypeMap: Record<string, string> = {
        'jobs': 'job',
        'results': 'result',
        'admit-card': 'admit_card',
        'answer-key': 'answer_key',
        'exams': 'exam',
      };
      const contentType = contentTypeMap[type || ''] || 'job';
      const pathPrefix = type;

      const rows = (await db.query<{ slug: string; updated_at: string; published_at: string }>(`
        SELECT slug, updated_at, published_at
        FROM content_items
        WHERE status = 'published' AND type = ?
        ORDER BY published_at DESC
      `, [contentType])).results;

      // Add main category listing page
      entries.push({
        loc: `${baseOrigin}/${pathPrefix}`,
        lastmod: rows[0]?.updated_at ? rows[0].updated_at.split('T')[0] : undefined,
        changefreq: 'daily',
        priority: 0.9,
      });

      for (const row of rows) {
        const lastmodDate = (row.updated_at || row.published_at || '').split('T')[0];
        entries.push({
          loc: `${baseOrigin}/${pathPrefix}/${row.slug}`,
          lastmod: lastmodDate || undefined,
          changefreq: 'weekly',
          priority: 0.8,
        });
      }
    } else if (type === 'organizations') {
      const rows = (await db.query<{ slug: string; updated_at: string }>(`
        SELECT o.slug, o.updated_at
        FROM organizations o
        JOIN content_items ci ON ci.organization_id = o.id AND ci.status = 'published'
        GROUP BY o.id
        HAVING COUNT(ci.id) > 0
        ORDER BY o.name ASC
      `)).results;

      entries.push({
        loc: `${baseOrigin}/organizations`,
        changefreq: 'weekly',
        priority: 0.8,
      });

      for (const row of rows) {
        entries.push({
          loc: `${baseOrigin}/organizations/${row.slug}`,
          lastmod: row.updated_at ? row.updated_at.split('T')[0] : undefined,
          changefreq: 'weekly',
          priority: 0.7,
        });
      }
    } else if (type === 'states') {
      entries.push({
        loc: `${baseOrigin}/states`,
        changefreq: 'weekly',
        priority: 0.8,
      });

      for (const s of INDIAN_STATES) {
        entries.push({
          loc: `${baseOrigin}/states/${s.slug}`,
          changefreq: 'weekly',
          priority: 0.7,
        });
      }
    } else if (type === 'landing') {
      // Programmatic landing pages with sufficient content
      const rows = (await db.query<{ slug: string; min_content_threshold: number; target_filter_json: string; updated_at: string }>(`
        SELECT slug, min_content_threshold, target_filter_json, updated_at
        FROM programmatic_pages
        WHERE is_indexable = 1
      `)).results;

      for (const row of rows) {
        entries.push({
          loc: `${baseOrigin}/jobs/${row.slug}`,
          lastmod: row.updated_at ? row.updated_at.split('T')[0] : undefined,
          changefreq: 'daily',
          priority: 0.85,
        });
      }
    } else if (type === 'static') {
      const staticPaths = [
        '/',
        '/about',
        '/contact',
        '/disclaimer',
        '/privacy-policy',
        '/terms',
        '/editorial-policy',
        '/correction-policy',
        '/scholarships',
        '/syllabus',
        '/schemes',
        '/important-updates',
      ];

      for (const path of staticPaths) {
        entries.push({
          loc: path === '/' ? baseOrigin : `${baseOrigin}${path}`,
          changefreq: path === '/' ? 'daily' : 'monthly',
          priority: path === '/' ? 1.0 : 0.5,
        });
      }
    } else {
      return new Response('Sitemap not found', { status: 404 });
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    e => `  <url>
    <loc>${e.loc}</loc>${e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : ''}${e.changefreq ? `\n    <changefreq>${e.changefreq}</changefreq>` : ''}${e.priority !== undefined ? `\n    <priority>${e.priority.toFixed(2)}</priority>` : ''}
  </url>`
  )
  .join('\n')}
</urlset>`;

    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=14400',
      },
    });
  } catch (err: any) {
    return new Response(`Sitemap generation error: ${err?.message}`, { status: 500 });
  }
};
