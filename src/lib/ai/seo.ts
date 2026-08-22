// src/lib/ai/seo.ts
// SEO Metadata & OpenGraph Tag Generation Engine

import type { DbClient } from '../db.ts';
import type { ExtractedData, GeneratedSEO } from './types.ts';
import { DeepSeekClient } from './deepseek.ts';
import { getPromptForOperation, interpolatePrompt } from './prompts.ts';

/**
 * Generates natural, keyword-relevant SEO metadata and OpenGraph tags from verified data
 */
export async function generateSEO(
  client: DeepSeekClient,
  verifiedData: ExtractedData,
  db: DbClient | null = null,
  options: { contentItemId?: string; sourcePageId?: string; canonicalUrl?: string } = {}
): Promise<GeneratedSEO> {
  const promptConfig = await getPromptForOperation(db, 'seo_generation');
  const factsJson = JSON.stringify(verifiedData, null, 2);

  const userPrompt = interpolatePrompt(promptConfig.user, {
    VERIFIED_FACTS: factsJson,
  });

  try {
    const aiResponse = await client.createChatCompletion(
      [
        { role: 'system', content: promptConfig.system },
        { role: 'user', content: userPrompt },
      ],
      'seo_generation',
      {
        contentItemId: options.contentItemId,
        sourcePageId: options.sourcePageId,
        jsonMode: true,
        temperature: 0.2,
      }
    );

    const parsed = DeepSeekClient.parseJsonSafely<any>(aiResponse.content);

    return {
      metaTitle: parsed.meta_title?.trim() || 'Government Recruitment & Results Update 2026',
      metaDescription: parsed.meta_description?.trim() || 'Check latest official government job notification, eligibility criteria, vacancy details, and application dates.',
      excerpt: parsed.excerpt?.trim() || 'Official update for recruitment, eligibility, important dates, and online application details.',
      ogTitle: parsed.og_title?.trim() || parsed.meta_title?.trim() || 'Government Jobs Notification 2026',
      ogDescription: parsed.og_description?.trim() || parsed.meta_description?.trim() || 'Verified updates on Indian government examinations and recruitments.',
      canonicalUrl: options.canonicalUrl,
    };
  } catch (err: any) {
    console.warn('[SEO Generation Warning - Fallback applied]', err?.message);

    // Deterministic fallback
    let subject = 'Notification';
    if ('recruitment_name' in verifiedData && verifiedData.recruitment_name) subject = verifiedData.recruitment_name;
    else if ('post_name' in verifiedData && verifiedData.post_name) subject = verifiedData.post_name;
    else if ('exam_name' in verifiedData && verifiedData.exam_name) subject = verifiedData.exam_name;

    const org = ('organization' in verifiedData && verifiedData.organization) ? verifiedData.organization : 'Government of India';

    return {
      metaTitle: `${org} ${subject} 2026 – Eligibility, Dates & Apply Online`,
      metaDescription: `Check complete details for ${subject} by ${org}. Verified qualification, age limits, vacancy, and official application link.`,
      excerpt: `${org} has published official details regarding ${subject} 2026. Review verified dates and qualifications.`,
      ogTitle: `${org} ${subject} 2026 Update`,
      ogDescription: `Verified recruitment and exam details for ${subject} by ${org}.`,
      canonicalUrl: options.canonicalUrl,
    };
  }
}
