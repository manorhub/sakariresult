// src/lib/ai/pipeline.ts
// End-to-End DeepSeek AI Processing Pipeline

import type { DbClient } from '../db.ts';
import type { StorageClient } from '../r2.ts';
import type { Source, SourcePage, ContentItem, ContentStatus } from '../types.ts';
import type { PipelineExecutionResult, PipelineOptions } from './types.ts';
import { DeepSeekClient } from './deepseek.ts';
import { classifyContent } from './classifier.ts';
import { extractStructuredData } from './extractor.ts';
import { verifyExtractedData } from './verifier.ts';
import { calculateQualityScore } from './quality.ts';
import { generateArticle } from './generator.ts';
import { generateSEO } from './seo.ts';
import { generateFAQs } from './faq.ts';
import { detectAndSummarizeUpdates, createContentVersion } from './updates.ts';
import { generateId, slugify, getContentTypeRoute } from '../utils.ts';
import { extractCleanContent } from '../crawler/fingerprint.ts';
import { submitUrlToGoogle } from '../seo/google-indexing.ts';
import {
  extractStructuredIdentity,
  findDuplicateCandidate,
  attachSourceToCanonical,
  detectSourceType,
} from '../dedup/index.ts';

/**
 * Executes the complete 12-step AI pipeline for a given source page or raw content
 */
export async function runAIPipeline(
  db: DbClient,
  _storage: StorageClient | null,
  client: DeepSeekClient,
  sourcePage: SourcePage & { source_name?: string; raw_text_content?: string },
  source?: Source | null,
  _options: PipelineOptions = {}
): Promise<PipelineExecutionResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  // 1. Prepare raw content
  let rawContent = sourcePage.raw_text_content || '';
  if (!rawContent && sourcePage.metadata_json) {
    try {
      const meta = JSON.parse(sourcePage.metadata_json);
      rawContent = meta.clean_text || meta.description || meta.title || sourcePage.title || '';
    } catch {
      // ignore
    }
  }
  if (!rawContent) {
    rawContent = sourcePage.title || 'Government notification notice.';
  }

  // Sanitize content to remove HTML tags, script noise, ads
  const cleanSourceText = extractCleanContent(rawContent);

  // 2. Fetch or create ContentItem record
  let existingItem = await db.first<ContentItem>(
    'SELECT * FROM content_items WHERE source_url = ? OR id = (SELECT content_item_id FROM source_documents WHERE source_page_id = ?)',
    [sourcePage.url, sourcePage.id]
  );

  const contentItemId = existingItem?.id || generateId('ci');
  const orgName = source?.name || sourcePage.source_name || 'Government Organization';

  try {
    // 3. Step 1: Content Classification
    const classification = await classifyContent(client, cleanSourceText, db, {
      contentItemId,
      sourcePageId: sourcePage.id,
    });

    // 4. Step 2: Structured Data Extraction
    const extraction = await extractStructuredData(client, cleanSourceText, classification.type, db, {
      contentItemId,
      sourcePageId: sourcePage.id,
    });

    // 4.1. Multi-Source Deduplication & Structured Identity Extraction
    const structuredIdentity = extractStructuredIdentity({
      title: sourcePage.title || '',
      type: classification.mappedContentType,
      organization: orgName,
      recruitment_name: (extraction as any).post_name || (extraction as any).title,
      advertisement_number: (extraction as any).advertisement_number,
      notification_number: (extraction as any).notification_number,
      vacancy: (extraction as any).vacancy,
      application_start: (extraction as any).application_start,
      application_end: (extraction as any).application_last_date,
      official_website_url: (extraction as any).official_website_url,
      official_notification_url: (extraction as any).official_notification_url,
      official_apply_url: (extraction as any).official_apply_url,
    });

    if (!existingItem) {
      const { candidateItem, matchResult } = await findDuplicateCandidate(db, structuredIdentity);
      if (candidateItem && matchResult.isDuplicate) {
        // High confidence duplicate found! Attach source to canonical item instead of creating duplicate article
        await attachSourceToCanonical(db, candidateItem.id, {
          source_url: sourcePage.url,
          source_id: source?.id || null,
          source_title: sourcePage.title,
          source_type: detectSourceType(sourcePage.url),
          has_pdf: Boolean(structuredIdentity.official_pdf_url),
          has_apply_url: Boolean(structuredIdentity.official_url),
        });
        existingItem = candidateItem;
      }
    }

    // 5. Step 3: Critical Field Fact-Check & Verification
    const verification = verifyExtractedData(extraction, cleanSourceText, source?.base_url || sourcePage.url);

    // 6. Step 4: Deterministic Quality Scoring
    const autoPublishThresholdSetting = await db.first<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['ai_auto_publish_threshold']);
    const minReviewThresholdSetting = await db.first<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['ai_min_review_threshold']);

    const autoPublishThreshold = autoPublishThresholdSetting ? parseInt(autoPublishThresholdSetting.value, 10) : 90;
    const minReviewThreshold = minReviewThresholdSetting ? parseInt(minReviewThresholdSetting.value, 10) : 75;

    const quality = calculateQualityScore({
      extracted: extraction,
      verification,
      source,
      autoPublishThreshold,
      minReviewThreshold,
    });

    // 7. Step 5: Original Article Generation
    const article = await generateArticle(client, extraction, sourcePage.url, orgName, db, {
      contentItemId,
      sourcePageId: sourcePage.id,
    });

    // 8. Step 6: SEO Metadata Generation
    const seo = await generateSEO(client, extraction, db, {
      contentItemId,
      sourcePageId: sourcePage.id,
    });

    // 9. Step 7: Verified FAQs Generation
    const faqs = await generateFAQs(client, extraction, db, {
      contentItemId,
      sourcePageId: sourcePage.id,
    });

    // 10. Step 8: Update Detection (if previous data exists)
    let updateSummaryResult = { hasUpdates: false, summary: null as string | null, changes: [] as any[] };
    if (existingItem && existingItem.extracted_data_json) {
      try {
        const oldExtracted = JSON.parse(existingItem.extracted_data_json);
        updateSummaryResult = await detectAndSummarizeUpdates(client, oldExtracted, extraction, db, {
          contentItemId,
          sourcePageId: sourcePage.id,
        });
      } catch (err: any) {
        console.warn('[Update Diff Warning]', err?.message);
      }
    }

    // 11. Determine Final Item Status (Auto-Publish by default unless critical conflicts exist)
    let finalContentStatus: ContentStatus = 'published';
    if (verification.hasCriticalConflicts) {
      // Conflicts detected -> Flag for human review
      finalContentStatus = 'review';
    } else {
      // Active / verified notification -> Automatically Publish to live portal!
      finalContentStatus = 'published';
    }

    const aiStatus = verification.hasCriticalConflicts ? 'verification_required' : 'completed';
    const slugBase = slugify(article.title || sourcePage.title || 'notification') || generateId('post');
    const slug = existingItem?.slug || `${slugBase}-${contentItemId.slice(-6)}`;

    // Match category
    const cat = await db.first<{ id: string }>('SELECT id FROM categories WHERE slug LIKE ? OR slug LIKE ? LIMIT 1', [
      `%${classification.mappedContentType}%`,
      `%${classification.type}%`,
    ]);
    const categoryId = cat?.id || 'cat_gov_jobs';

    // 12. Save to D1 Database
    if (existingItem) {
      await db.run(
        `UPDATE content_items SET
          title = ?,
          type = ?,
          category_id = COALESCE(category_id, ?),
          status = ?,
          ai_status = ?,
          classification_confidence = ?,
          extraction_confidence = ?,
          verification_status = ?,
          quality_score = ?,
          auto_publish_eligible = ?,
          evidence_json = ?,
          extracted_data_json = ?,
          faq_json = ?,
          article_content = ?,
          update_summary = ?,
          conflict_details_json = ?,
          last_ai_processed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [
          article.title,
          classification.mappedContentType,
          categoryId,
          finalContentStatus,
          aiStatus,
          classification.confidence,
          extraction.extraction_confidence,
          verification.hasCriticalConflicts ? 'conflict_detected' : 'verified',
          quality.totalScore,
          quality.eligibility === 'auto_publish_eligible' ? 1 : 0,
          JSON.stringify(extraction.evidence || []),
          JSON.stringify(extraction),
          JSON.stringify(faqs),
          article.bodyMarkdown,
          updateSummaryResult.summary,
          JSON.stringify(verification.conflicts),
          contentItemId,
        ]
      );
    } else {
      await db.run(
        `INSERT INTO content_items (
          id, type, title, slug, organization_id, category_id, status, source_url, source_id,
          published_at, ai_status, classification_confidence, extraction_confidence, verification_status,
          quality_score, auto_publish_eligible, evidence_json, extracted_data_json, faq_json,
          article_content, update_summary, conflict_details_json, last_ai_processed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          contentItemId,
          classification.mappedContentType,
          article.title,
          slug,
          categoryId,
          finalContentStatus,
          sourcePage.url,
          sourcePage.source_id || null,
          finalContentStatus === 'published' ? new Date().toISOString() : null,
          aiStatus,
          classification.confidence,
          extraction.extraction_confidence,
          verification.hasCriticalConflicts ? 'conflict_detected' : 'verified',
          quality.totalScore,
          quality.eligibility === 'auto_publish_eligible' ? 1 : 0,
          JSON.stringify(extraction.evidence || []),
          JSON.stringify(extraction),
          JSON.stringify(faqs),
          article.bodyMarkdown,
          updateSummaryResult.summary,
          JSON.stringify(verification.conflicts),
        ]
      );
    }

    // 12.1. Track and attach source reference in content_sources
    try {
      await attachSourceToCanonical(db, contentItemId, {
        source_url: sourcePage.url,
        source_id: sourcePage.source_id || null,
        source_title: sourcePage.title,
        source_type: detectSourceType(sourcePage.url),
        has_pdf: Boolean(structuredIdentity.official_pdf_url),
        has_apply_url: Boolean(structuredIdentity.official_url),
      });
    } catch (csrcErr: any) {
      console.warn('[Content Sources Attach Warning]', csrcErr?.message);
    }

    // 13. Save Jobs Record if applicable
    if (classification.mappedContentType === 'job' && 'post_name' in extraction) {
      const jobRecord = extraction as any;
      const existingJob = await db.first<{ id: string }>('SELECT id FROM jobs WHERE content_item_id = ?', [contentItemId]);
      if (existingJob) {
        await db.run(
          `UPDATE jobs SET
            post_name = ?,
            vacancy = ?,
            qualification = ?,
            age_limit = ?,
            application_start = ?,
            application_last_date = ?,
            exam_date = ?,
            application_fee = ?,
            salary = ?,
            selection_process = ?,
            official_notification_url = ?,
            official_apply_url = ?,
            official_website_url = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE content_item_id = ?`,
          [
            jobRecord.post_name || article.title,
            jobRecord.vacancy ? String(jobRecord.vacancy) : null,
            jobRecord.qualification || null,
            jobRecord.age_min || jobRecord.age_max ? `${jobRecord.age_min || 18}-${jobRecord.age_max || 40} Years` : null,
            jobRecord.application_start || null,
            jobRecord.application_last_date || null,
            jobRecord.exam_date || null,
            jobRecord.application_fee || null,
            jobRecord.salary || null,
            jobRecord.selection_process || null,
            jobRecord.official_notification_url || null,
            jobRecord.official_apply_url || null,
            jobRecord.official_website_url || null,
            contentItemId,
          ]
        );
      } else {
        await db.run(
          `INSERT INTO jobs (
            id, content_item_id, post_name, vacancy, qualification, age_limit,
            application_start, application_last_date, exam_date, application_fee,
            salary, selection_process, official_notification_url, official_apply_url,
            official_website_url, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [
            generateId('job'),
            contentItemId,
            jobRecord.post_name || article.title,
            jobRecord.vacancy ? String(jobRecord.vacancy) : null,
            jobRecord.qualification || null,
            jobRecord.age_min || jobRecord.age_max ? `${jobRecord.age_min || 18}-${jobRecord.age_max || 40} Years` : null,
            jobRecord.application_start || null,
            jobRecord.application_last_date || null,
            jobRecord.exam_date || null,
            jobRecord.application_fee || null,
            jobRecord.salary || null,
            jobRecord.selection_process || null,
            jobRecord.official_notification_url || null,
            jobRecord.official_apply_url || null,
            jobRecord.official_website_url || null,
          ]
        );
      }
    }

    // 14. Save SEO Metadata Record
    const existingSeo = await db.first<{ id: string }>('SELECT id FROM seo_metadata WHERE content_item_id = ?', [contentItemId]);
    if (existingSeo) {
      await db.run(
        `UPDATE seo_metadata SET
          meta_title = ?,
          meta_description = ?,
          og_title = ?,
          og_description = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE content_item_id = ?`,
        [seo.metaTitle, seo.metaDescription, seo.ogTitle, seo.ogDescription, contentItemId]
      );
    } else {
      await db.run(
        `INSERT INTO seo_metadata (
          id, content_item_id, meta_title, meta_description, canonical_url, og_title, og_description, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [generateId('seo'), contentItemId, seo.metaTitle, seo.metaDescription, seo.ogTitle, seo.ogDescription]
      );
    }

    // 15. Create Content Version
    await createContentVersion(
      db,
      contentItemId,
      article.title,
      article.bodyMarkdown,
      JSON.stringify(extraction),
      JSON.stringify(seo),
      'ai'
    );

    // 16. Auto Google Instant Indexing on Publish (Strictly for Job Postings per Google API Policy)
    if (finalContentStatus === 'published' && classification.mappedContentType === 'job') {
      try {
        const routePrefix = getContentTypeRoute(classification.mappedContentType);
        const publicUrl = `https://realsarkariexam.com/${routePrefix}/${slug}`;
        await submitUrlToGoogle(db, publicUrl, 'URL_UPDATED', {
          contentItemId,
          contentType: classification.mappedContentType,
        });
      } catch (idxErr: any) {
        console.warn('[Auto Google Indexing Notice]', idxErr?.message);
      }
    }

    const durationMs = Date.now() - startTime;

    return {
      success: true,
      contentItemId,
      sourcePageId: sourcePage.id,
      status: aiStatus,
      classification,
      extraction,
      verification,
      quality,
      article,
      seo,
      faqs,
      updateSummary: updateSummaryResult,
      publishEligibility: quality.eligibility,
      totalTokensUsed: 1200,
      durationMs,
      errors: [],
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    errors.push(err?.message || 'Pipeline execution failed');

    // Update content_items failure status
    if (contentItemId) {
      await db.run(
        `UPDATE content_items SET
          ai_status = 'failed',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [contentItemId]
      ).catch(() => {});
    }

    return {
      success: false,
      contentItemId,
      sourcePageId: sourcePage.id,
      status: 'failed',
      publishEligibility: 'rejected',
      totalTokensUsed: 0,
      durationMs,
      errors,
    };
  }
}
