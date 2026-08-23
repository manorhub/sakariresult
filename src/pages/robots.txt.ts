// src/pages/robots.txt.ts
// Dynamic robots.txt Generator

import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ site, url }) => {
  const baseOrigin = (site ? site.toString() : url.origin).replace(/\/+$/, '');

  const content = `# Robots.txt for RealSarkariExam Portal
User-agent: *
Allow: /
Allow: /jobs/
Allow: /results/
Allow: /admit-card/
Allow: /answer-key/
Allow: /exams/
Allow: /scholarships/
Allow: /syllabus/
Allow: /schemes/
Allow: /important-updates/
Allow: /organizations/
Allow: /states/
Allow: /_astro/
Allow: /assets/

# Block Administration & Internal Endpoints
Disallow: /admin/
Disallow: /api/admin/
Disallow: /*?*preview=true
Disallow: /*&preview=true

# Sitemap Index Reference
Sitemap: ${baseOrigin}/sitemap.xml
`;

  return new Response(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
