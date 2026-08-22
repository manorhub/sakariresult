// src/lib/internal-links/renderer.ts
// Injects contextual internal links into article markdown/HTML naturally

import type { InternalLinkCandidate } from './types.ts';

/**
 * Injects up to maxLinks contextual links into text content without duplicate anchors
 */
export function injectContextualLinks(
  content: string,
  candidates: InternalLinkCandidate[],
  maxLinks: number = 3
): string {
  if (!content || candidates.length === 0 || maxLinks <= 0) {
    return content;
  }

  let modifiedContent = content;
  let insertedCount = 0;
  const linkedUrls = new Set<string>();

  for (const candidate of candidates) {
    if (insertedCount >= maxLinks) break;
    if (linkedUrls.has(candidate.targetUrl)) continue;

    const anchor = candidate.suggestedAnchor.trim();
    if (!anchor || anchor.length < 4) continue;

    // Check if anchor appears in text, not inside existing markdown link or html tag
    const safeRegex = new RegExp(`(?<!\\[|href=["']|/|>)(\\b${escapeRegex(anchor)}\\b)(?!\\]|\\))`, 'i');
    
    if (safeRegex.test(modifiedContent)) {
      modifiedContent = modifiedContent.replace(safeRegex, `[$1](${candidate.targetUrl})`);
      linkedUrls.add(candidate.targetUrl);
      insertedCount++;
    }
  }

  return modifiedContent;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
