// src/lib/seo/og.ts
// Dynamic Open Graph Image & Metadata Builder

export interface OgImageOptions {
  title: string;
  category?: string;
  organization?: string;
  siteName?: string;
  badge?: string;
}

/**
 * Generates an SVG Open Graph banner for social sharing
 */
export function generateOgSvg(options: OgImageOptions): string {
  const {
    title,
    category = 'Government Job Alert',
    organization = 'Official Government Recruitment',
    siteName = 'SARKARI INFO',
    badge = 'VERIFIED 2026',
  } = options;

  const escapedTitle = escapeXml(title.length > 75 ? title.slice(0, 72) + '...' : title);
  const escapedOrg = escapeXml(organization.length > 50 ? organization.slice(0, 47) + '...' : organization);
  const escapedCategory = escapeXml(category.toUpperCase());

  return `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="50%" stop-color="#1e293b" />
      <stop offset="100%" stop-color="#090d16" />
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ff9933" />
      <stop offset="100%" stop-color="#f59e0b" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)" />

  <!-- Top Accent Border -->
  <rect x="0" y="0" width="1200" height="12" fill="url(#accent)" />

  <!-- Brand Badge Top Left -->
  <rect x="80" y="60" width="48" height="48" rx="10" fill="url(#accent)" />
  <text x="140" y="93" fill="#ffffff" font-size="28" font-weight="900" font-family="system-ui, sans-serif">${escapeXml(siteName.toUpperCase())}</text>

  <!-- Category & Verified Tag -->
  <rect x="80" y="150" width="220" height="36" rx="8" fill="#334155" />
  <text x="190" y="174" fill="#38bdf8" font-size="14" font-weight="800" font-family="system-ui, sans-serif" text-anchor="middle">${escapedCategory}</text>

  <rect x="315" y="150" width="160" height="36" rx="8" fill="#14532d" />
  <text x="395" y="174" fill="#4ade80" font-size="14" font-weight="800" font-family="system-ui, sans-serif" text-anchor="middle">${badge}</text>

  <!-- Title -->
  <text x="80" y="260" fill="#ffffff" font-size="44" font-weight="900" font-family="system-ui, sans-serif">
    ${escapedTitle}
  </text>

  <!-- Organization Subtitle -->
  <text x="80" y="380" fill="#94a3b8" font-size="24" font-weight="600" font-family="system-ui, sans-serif">
    Authority: ${escapedOrg}
  </text>

  <!-- Bottom Details Bar -->
  <line x1="80" y1="470" x2="1120" y2="470" stroke="#334155" stroke-width="2" />
  <text x="80" y="525" fill="#f8fafc" font-size="18" font-weight="700" font-family="system-ui, sans-serif">
    Official Application Forms &bull; Exam Results &bull; Merit Lists &bull; Admit Cards
  </text>
  <text x="1120" y="525" fill="#ff9933" font-size="18" font-weight="800" font-family="system-ui, sans-serif" text-anchor="end">
    sarkariinfo.in
  </text>
</svg>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
