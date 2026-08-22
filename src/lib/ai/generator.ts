// src/lib/ai/generator.ts
// Copyright-Safe Original Article Generation Engine with Structured Sections

import type { DbClient } from '../db.ts';
import type { ExtractedData, GeneratedArticle } from './types.ts';
import { DeepSeekClient } from './deepseek.ts';
import { getPromptForOperation, interpolatePrompt } from './prompts.ts';

/**
 * Extracts sections from generated markdown using regex or splits
 */
function extractSectionsFromMarkdown(markdown: string) {
  const getSection = (headingRegex: RegExp): string => {
    const match = markdown.match(headingRegex);
    if (!match) return '';
    return match[1].trim();
  };

  return {
    overview: getSection(/## Overview([\s\S]*?)(?=##|$)/i),
    importantDates: getSection(/## Important Dates([\s\S]*?)(?=##|$)/i),
    vacancyDetails: getSection(/## Vacancy Details([\s\S]*?)(?=##|$)/i),
    eligibility: getSection(/## Eligibility[\s\S]*?([\s\S]*?)(?=##|$)/i),
    ageLimit: getSection(/## Age Limit([\s\S]*?)(?=##|$)/i),
    applicationFee: getSection(/## Application Fee([\s\S]*?)(?=##|$)/i),
    salary: getSection(/## Salary[\s\S]*?([\s\S]*?)(?=##|$)/i),
    selectionProcess: getSection(/## Selection Process([\s\S]*?)(?=##|$)/i),
    howToApply: getSection(/## How to Apply([\s\S]*?)(?=##|$)/i),
    importantLinks: getSection(/## Important Official Links([\s\S]*?)(?=##|$)/i),
    faq: getSection(/## Frequently Asked Questions([\s\S]*?)(?=##|$)/i),
    disclaimer: getSection(/## Disclaimer[\s\S]*?([\s\S]*?)(?=##|$)/i),
  };
}

/**
 * Generates an original, factual, copyright-safe article from verified structured facts
 */
export async function generateArticle(
  client: DeepSeekClient,
  verifiedData: ExtractedData,
  sourceUrl: string,
  organizationName?: string,
  db: DbClient | null = null,
  options: { contentItemId?: string; sourcePageId?: string } = {}
): Promise<GeneratedArticle> {
  const promptConfig = await getPromptForOperation(db, 'article_generation');
  const factsJson = JSON.stringify(verifiedData, null, 2);

  const userPrompt = interpolatePrompt(promptConfig.user, {
    VERIFIED_FACTS: factsJson,
    SOURCE_URL: sourceUrl,
    ORGANIZATION: organizationName || 'Government of India',
  });

  const aiResponse = await client.createChatCompletion(
    [
      { role: 'system', content: promptConfig.system },
      { role: 'user', content: userPrompt },
    ],
    'article_generation',
    {
      contentItemId: options.contentItemId,
      sourcePageId: options.sourcePageId,
      temperature: 0.3,
    }
  );

  const bodyMarkdown = aiResponse.content.trim();
  const sections = extractSectionsFromMarkdown(bodyMarkdown);

  // Determine a clean title
  let title = '';
  if ('recruitment_name' in verifiedData && verifiedData.recruitment_name) {
    title = verifiedData.recruitment_name;
  } else if ('exam_name' in verifiedData && verifiedData.exam_name) {
    title = verifiedData.exam_name;
  } else if ('title' in verifiedData && verifiedData.title) {
    title = verifiedData.title;
  } else if ('post_name' in verifiedData && verifiedData.post_name) {
    title = `${organizationName ? organizationName + ' ' : ''}${verifiedData.post_name} Recruitment 2026`;
  } else {
    title = `${organizationName || 'Government'} Notification Update 2026`;
  }

  const overview = sections.overview.slice(0, 350).trim() || `${title} details and official updates.`;

  return {
    title,
    overview,
    bodyMarkdown,
    sections,
  };
}
