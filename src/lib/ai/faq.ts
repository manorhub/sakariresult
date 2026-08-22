// src/lib/ai/faq.ts
// Verified FAQ Generation Engine from Structured Facts

import type { DbClient } from '../db.ts';
import type { ExtractedData, FAQItem } from './types.ts';
import { DeepSeekClient } from './deepseek.ts';
import { getPromptForOperation, interpolatePrompt } from './prompts.ts';

/**
 * Generates verified FAQ questions and answers strictly derived from factual extracted fields
 */
export async function generateFAQs(
  client: DeepSeekClient,
  verifiedData: ExtractedData,
  db: DbClient | null = null,
  options: { contentItemId?: string; sourcePageId?: string } = {}
): Promise<FAQItem[]> {
  const promptConfig = await getPromptForOperation(db, 'faq_generation');
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
      'faq_generation',
      {
        contentItemId: options.contentItemId,
        sourcePageId: options.sourcePageId,
        jsonMode: true,
        temperature: 0.2,
      }
    );

    const parsed = DeepSeekClient.parseJsonSafely<any>(aiResponse.content);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item) => item && typeof item === 'object' && item.question && item.answer)
        .map((item) => ({
          question: String(item.question).trim(),
          answer: String(item.answer).trim(),
          verifiedFromField: item.verified_from_field || item.verifiedFromField || 'general',
        }));
    }
  } catch (err: any) {
    console.warn('[FAQ Generation Warning - Generating deterministic fallback]', err?.message);
  }

  // Deterministic fallback FAQs using only non-null fields
  const fallbackFaqs: FAQItem[] = [];

  if ('application_last_date' in verifiedData && verifiedData.application_last_date) {
    fallbackFaqs.push({
      question: 'What is the last date to apply?',
      answer: `The last date to submit the application is ${verifiedData.application_last_date}.`,
      verifiedFromField: 'application_last_date',
    });
  }

  if ('vacancy' in verifiedData && verifiedData.vacancy) {
    fallbackFaqs.push({
      question: 'How many total vacancies are announced?',
      answer: `A total of ${verifiedData.vacancy} vacancies have been notified.`,
      verifiedFromField: 'vacancy',
    });
  }

  if ('qualification' in verifiedData && verifiedData.qualification) {
    fallbackFaqs.push({
      question: 'What is the required educational qualification?',
      answer: verifiedData.qualification,
      verifiedFromField: 'qualification',
    });
  }

  if ('application_fee' in verifiedData && verifiedData.application_fee) {
    fallbackFaqs.push({
      question: 'What is the application fee structure?',
      answer: verifiedData.application_fee,
      verifiedFromField: 'application_fee',
    });
  }

  if ('exam_date' in verifiedData && verifiedData.exam_date) {
    fallbackFaqs.push({
      question: 'When is the examination scheduled?',
      answer: `The examination date is announced as ${verifiedData.exam_date}.`,
      verifiedFromField: 'exam_date',
    });
  }

  return fallbackFaqs;
}
