// src/lib/ai/extractor.ts
// Strict Structured Data Extraction with Null Safety and Evidence Collection

import type { DbClient } from '../db.ts';
import type {
  ClassificationType,
  ExtractedData,
  JobExtractionData,
  ResultExtractionData,
  AdmitCardExtractionData,
  AnswerKeyExtractionData,
  GenericExtractionData,
  SourceEvidenceItem,
} from './types.ts';
import { DeepSeekClient } from './deepseek.ts';
import { getPromptForOperation, interpolatePrompt } from './prompts.ts';

/**
 * Normalizes empty strings or strings containing 'null'/'n/a'/'not mentioned' to null
 */
function cleanNullableString(val: any): string | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (
    str === '' ||
    str.toLowerCase() === 'null' ||
    str.toLowerCase() === 'n/a' ||
    str.toLowerCase() === 'not mentioned' ||
    str.toLowerCase() === 'none' ||
    str.toLowerCase() === 'undefined'
  ) {
    return null;
  }
  return str;
}

/**
 * Normalizes numeric inputs or returns null if not a valid finite number
 */
function cleanNullableNumber(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return isFinite(val) ? val : null;
  const cleanedStr = String(val).replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleanedStr);
  return isFinite(num) ? num : null;
}

/**
 * Normalizes evidence items list
 */
function cleanEvidence(rawEvidence: any): SourceEvidenceItem[] {
  if (!Array.isArray(rawEvidence)) return [];
  return rawEvidence
    .filter((e) => e && typeof e === 'object' && e.field && e.evidence)
    .map((e) => ({
      field: String(e.field).trim(),
      value: e.value !== undefined ? e.value : null,
      evidence: String(e.evidence).trim(),
      location: e.location ? String(e.location).trim() : undefined,
    }));
}

/**
 * Performs structured extraction on source content using DeepSeek AI
 */
export async function extractStructuredData(
  client: DeepSeekClient,
  sourceContent: string,
  contentType: ClassificationType,
  db: DbClient | null = null,
  options: { contentItemId?: string; sourcePageId?: string } = {}
): Promise<ExtractedData> {
  const cleanSnippet = sourceContent.slice(0, 12000).trim();
  const promptConfig = await getPromptForOperation(db, 'extraction');

  const userPrompt = interpolatePrompt(promptConfig.user, {
    CONTENT_TYPE: contentType,
    SOURCE_CONTENT: cleanSnippet,
  });

  const aiResponse = await client.createChatCompletion(
    [
      { role: 'system', content: promptConfig.system },
      { role: 'user', content: userPrompt },
    ],
    'extraction',
    {
      contentItemId: options.contentItemId,
      sourcePageId: options.sourcePageId,
      jsonMode: true,
      temperature: 0.1,
    }
  );

  const raw = DeepSeekClient.parseJsonSafely<any>(aiResponse.content);
  const evidence = cleanEvidence(raw.evidence);
  const extraction_confidence =
    typeof raw.extraction_confidence === 'number' ? Math.min(Math.max(raw.extraction_confidence, 0), 1) : 0.9;

  switch (contentType) {
    case 'result': {
      const resultData: ResultExtractionData = {
        organization: cleanNullableString(raw.organization),
        exam_name: cleanNullableString(raw.exam_name || raw.title),
        result_date: cleanNullableString(raw.result_date),
        exam_date: cleanNullableString(raw.exam_date),
        result_url: cleanNullableString(raw.result_url || raw.download_url),
        merit_list_url: cleanNullableString(raw.merit_list_url),
        cutoff_url: cleanNullableString(raw.cutoff_url),
        official_website_url: cleanNullableString(raw.official_website_url),
        evidence,
        extraction_confidence,
      };
      return resultData;
    }

    case 'admit_card': {
      const admitData: AdmitCardExtractionData = {
        organization: cleanNullableString(raw.organization),
        exam_name: cleanNullableString(raw.exam_name || raw.title),
        admit_card_date: cleanNullableString(raw.admit_card_date),
        exam_date: cleanNullableString(raw.exam_date),
        download_url: cleanNullableString(raw.download_url || raw.admit_card_url),
        official_website_url: cleanNullableString(raw.official_website_url),
        evidence,
        extraction_confidence,
      };
      return admitData;
    }

    case 'answer_key': {
      const keyData: AnswerKeyExtractionData = {
        organization: cleanNullableString(raw.organization),
        exam_name: cleanNullableString(raw.exam_name || raw.title),
        answer_key_date: cleanNullableString(raw.answer_key_date),
        objection_start: cleanNullableString(raw.objection_start),
        objection_end: cleanNullableString(raw.objection_end),
        answer_key_url: cleanNullableString(raw.answer_key_url || raw.download_url),
        official_website_url: cleanNullableString(raw.official_website_url),
        evidence,
        extraction_confidence,
      };
      return keyData;
    }

    case 'government_job':
    default: {
      if (
        contentType === 'exam' ||
        contentType === 'scholarship' ||
        contentType === 'syllabus' ||
        contentType === 'scheme' ||
        contentType === 'important_update' ||
        contentType === 'other'
      ) {
        const genericData: GenericExtractionData = {
          organization: cleanNullableString(raw.organization),
          title: cleanNullableString(raw.recruitment_name || raw.title || raw.post_name),
          date: cleanNullableString(raw.application_last_date || raw.exam_date || raw.date),
          summary: cleanNullableString(raw.selection_process || raw.summary || raw.qualification),
          official_url: cleanNullableString(raw.official_notification_url || raw.official_website_url),
          evidence,
          extraction_confidence,
        };
        return genericData;
      }

      const jobData: JobExtractionData = {
        organization: cleanNullableString(raw.organization),
        recruitment_name: cleanNullableString(raw.recruitment_name),
        post_name: cleanNullableString(raw.post_name),
        advertisement_number: cleanNullableString(raw.advertisement_number),
        vacancy: raw.vacancy !== undefined && raw.vacancy !== null ? cleanNullableString(raw.vacancy) : null,
        qualification: cleanNullableString(raw.qualification),
        age_min: cleanNullableNumber(raw.age_min),
        age_max: cleanNullableNumber(raw.age_max),
        age_relaxation: cleanNullableString(raw.age_relaxation),
        application_start: cleanNullableString(raw.application_start),
        application_last_date: cleanNullableString(raw.application_last_date),
        exam_date: cleanNullableString(raw.exam_date),
        application_fee: cleanNullableString(raw.application_fee),
        salary: cleanNullableString(raw.salary),
        selection_process: cleanNullableString(raw.selection_process),
        job_location: cleanNullableString(raw.job_location),
        official_notification_url: cleanNullableString(raw.official_notification_url),
        official_apply_url: cleanNullableString(raw.official_apply_url),
        official_website_url: cleanNullableString(raw.official_website_url),
        evidence,
        extraction_confidence,
      };
      return jobData;
    }
  }
}
