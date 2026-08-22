// src/lib/ai/updates.ts
// Update Detection, Change Summaries, and Version Management

import type { DbClient } from '../db.ts';
import type { ExtractedData, UpdateSummaryResult } from './types.ts';
import { DeepSeekClient } from './deepseek.ts';
import { getPromptForOperation, interpolatePrompt } from './prompts.ts';
import { generateId } from '../utils.ts';

/**
 * Detects differences between old and new structured data and generates an update summary
 */
export async function detectAndSummarizeUpdates(
  client: DeepSeekClient,
  oldData: ExtractedData | null,
  newData: ExtractedData,
  db: DbClient | null = null,
  options: { contentItemId?: string; sourcePageId?: string } = {}
): Promise<UpdateSummaryResult> {
  if (!oldData) {
    return {
      hasUpdates: false,
      summary: null,
      changes: [],
    };
  }

  // 1. Programmatic field diff
  const changes: Array<{ field: string; oldValue: any; newValue: any; description: string }> = [];
  const fieldsToCheck = [
    'application_last_date',
    'application_start',
    'exam_date',
    'vacancy',
    'qualification',
    'salary',
    'application_fee',
    'official_apply_url',
    'official_notification_url',
    'result_date',
    'admit_card_date',
    'answer_key_date',
  ];

  for (const field of fieldsToCheck) {
    const oldVal = (oldData as any)[field];
    const newVal = (newData as any)[field];

    if (oldVal !== undefined && newVal !== undefined && oldVal !== newVal && (oldVal || newVal)) {
      changes.push({
        field,
        oldValue: oldVal,
        newValue: newVal,
        description: `Field "${field}" changed from "${oldVal ?? 'N/A'}" to "${newVal ?? 'N/A'}".`,
      });
    }
  }

  if (changes.length === 0) {
    return {
      hasUpdates: false,
      summary: null,
      changes: [],
    };
  }

  // 2. AI Update Summary Generation
  try {
    const promptConfig = await getPromptForOperation(db, 'update_summary');
    const userPrompt = interpolatePrompt(promptConfig.user, {
      OLD_DATA: JSON.stringify(oldData, null, 2),
      NEW_DATA: JSON.stringify(newData, null, 2),
    });

    const aiResponse = await client.createChatCompletion(
      [
        { role: 'system', content: promptConfig.system },
        { role: 'user', content: userPrompt },
      ],
      'update_summary',
      {
        contentItemId: options.contentItemId,
        sourcePageId: options.sourcePageId,
        jsonMode: true,
        temperature: 0.1,
      }
    );

    const parsed = DeepSeekClient.parseJsonSafely<any>(aiResponse.content);
    return {
      hasUpdates: true,
      summary: parsed.summary?.trim() || `Important Update: Changes detected in ${changes.map((c) => c.field).join(', ')}.`,
      changes: Array.isArray(parsed.changes) && parsed.changes.length > 0 ? parsed.changes : changes,
    };
  } catch (err: any) {
    console.warn('[Update Summary AI Warning - Using rule fallback]', err?.message);
    const summaryLines = changes.map((c) => `- ${c.description}`);
    return {
      hasUpdates: true,
      summary: `**Important Update:**\n${summaryLines.join('\n')}`,
      changes,
    };
  }
}

/**
 * Creates a new immutable version record in content_versions
 */
export async function createContentVersion(
  db: DbClient,
  contentItemId: string,
  title: string,
  body: string | null,
  structuredDataJson: string | null,
  seoDataJson: string | null,
  generatedBy: 'ai' | 'manual_edit' | 'system_update' = 'ai'
): Promise<number> {
  const lastVer = await db.first<{ max_ver: number }>(
    'SELECT COALESCE(MAX(version_number), 0) as max_ver FROM content_versions WHERE content_item_id = ?',
    [contentItemId]
  );
  const newVersion = (lastVer?.max_ver || 0) + 1;
  const versionId = generateId('cver');

  await db.run(
    `INSERT INTO content_versions (
      id, content_item_id, version_number, title, body, structured_data_json, seo_data_json, generated_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      versionId,
      contentItemId,
      newVersion,
      title,
      body,
      structuredDataJson,
      seoDataJson,
      generatedBy,
    ]
  );

  return newVersion;
}
