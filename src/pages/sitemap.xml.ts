// src/pages/sitemap.xml.ts
// Dynamic XML Sitemap Index File

import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ url, site }) => {
  const baseOrigin = (site ? site.toString() : url.origin).replace(/\/+$/, '');

  const sitemaps = [
    'jobs',
    'results',
    'admit-card',
    'answer-key',
    'exams',
    'organizations',
    'states',
    'landing',
    'static',
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps
  .map(
    type => `  <sitemap>
    <loc>${baseOrigin}/sitemaps/${type}.xml</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
  </sitemap>`
  )
  .join('\n')}
</sitemapindex>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=14400',
    },
  });
};
