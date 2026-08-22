// src/lib/ai/classifier.ts
// AI Content Classification with Strict Type Validation and Content Mapping

import type { DbClient } from '../db.ts';
import type { ContentType } from '../types.ts';
import type { ClassificationResult, ClassificationType } from './types.ts';
import { DeepSeekClient } from './deepseek.ts';
import { getPromptForOperation, interpolatePrompt } from './prompts.ts';

const VALID_CLASSIFICATION_TYPES: ClassificationType[] = [
  'government_job',
  'result',
  'admit_card',
  'answer_key',
  'exam',
  'scholarship',
  'syllabus',
  'scheme',
  'important_update',
  'other',
];

const TYPE_MAP: Record<ClassificationType, ContentType> = {
  government_job: 'job',
  result: 'result',
  admit_card: 'admit_card',
  answer_key: 'answer_key',
  exam: 'exam',
  scholarship: 'scholarship',
  syllabus: 'syllabus',
  scheme: 'scheme',
  important_update: 'update',
  other: 'update',
};

/**
 * Classifies source content using DeepSeek AI with prompt injection protection and strict validation
 */
export async function classifyContent(
  client: DeepSeekClient,
  sourceContent: string,
  db: DbClient | null = null,
  options: { contentItemId?: string; sourcePageId?: string } = {}
): Promise<ClassificationResult> {
  // Sanitize and truncate excessive source text to save tokens and avoid noise
  const cleanSnippet = sourceContent.slice(0, 8000).trim();
  if (!cleanSnippet) {
    return {
      type: 'other',
      confidence: 0.1,
      reason: 'Empty or blank content received.',
      mappedContentType: 'update',
    };
  }

  const promptConfig = await getPromptForOperation(db, 'classification');
  const userPrompt = interpolatePrompt(promptConfig.user, { SOURCE_CONTENT: cleanSnippet });

  try {
    const aiResponse = await client.createChatCompletion(
      [
        { role: 'system', content: promptConfig.system },
        { role: 'user', content: userPrompt },
      ],
      'classification',
      {
        contentItemId: options.contentItemId,
        sourcePageId: options.sourcePageId,
        jsonMode: true,
        temperature: 0.1, // low temperature for strict deterministic classification
      }
    );

    const parsed = DeepSeekClient.parseJsonSafely<any>(aiResponse.content);

    // Validate type
    let rawType = (parsed.type || '').toLowerCase().trim() as ClassificationType;
    if (!VALID_CLASSIFICATION_TYPES.includes(rawType)) {
      // Safe fallback heuristics if model returns minor deviation
      if (rawType.includes('job') || rawType.includes('recruit') || rawType.includes('vacan')) {
        rawType = 'government_job';
      } else if (rawType.includes('result') || rawType.includes('merit')) {
        rawType = 'result';
      } else if (rawType.includes('admit') || rawType.includes('hall_ticket') || rawType.includes('card')) {
        rawType = 'admit_card';
      } else if (rawType.includes('answer')) {
        rawType = 'answer_key';
      } else {
        rawType = 'other';
      }
    }

    const confidence = typeof parsed.confidence === 'number' ? Math.min(Math.max(parsed.confidence, 0), 1) : 0.85;
    const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : 'Classified via content analysis.';

    return {
      type: rawType,
      confidence,
      reason,
      mappedContentType: TYPE_MAP[rawType] || 'update',
    };
  } catch (err: any) {
    console.warn('[Classification Error - Falling back to heuristic]', err?.message);

    // Rule-based fallback if AI call fails
    const lower = cleanSnippet.toLowerCase();
    let fallbackType: ClassificationType = 'other';

    if (lower.includes('recruitment') || lower.includes('vacancy') || lower.includes('apply online') || lower.includes('notification')) {
      fallbackType = 'government_job';
    } else if (lower.includes('result') || lower.includes('merit list') || lower.includes('marksheet') || lower.includes('score card')) {
      fallbackType = 'result';
    } else if (lower.includes('admit card') || lower.includes('hall ticket') || lower.includes('call letter')) {
      fallbackType = 'admit_card';
    } else if (lower.includes('answer key') || lower.includes('question paper') || lower.includes('objection')) {
      fallbackType = 'answer_key';
    }

    return {
      type: fallbackType,
      confidence: 0.6,
      reason: `Rule-based fallback classifier after AI failure: ${err?.message || 'Error'}`,
      mappedContentType: TYPE_MAP[fallbackType],
    };
  }
}
