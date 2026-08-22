import type { DbClient } from '../db';
import type { StorageClient } from '../r2';
import type { Source, HealthStatus } from '../types';
import type {
  CrawlOptions,
  DiscoveredItem,
  ProcessedItemResult,
  SourceCrawlSummary,
} from './types';
import { safeFetch } from './fetcher';
import { normalizeUrl, getOriginUrl } from './normalizer';
import { computeFingerprint } from './fingerprint';
import { getRobotsRules, isPathAllowed } from './robots';
import { checkDuplicateAndChange } from './duplicate';
import { parseRssFeed } from './parsers/rss';
import { parseSitemapXml } from './parsers/xml';
import { parseHtmlPage } from './parsers/html';
import { parseJsonFeed } from './parsers/json';
import { storePdfDocument, isPdfBuffer } from './parsers/pdf';
import { getDueSources } from './scheduler';
import { generateId, slugify } from '../utils';

/**
 * Executes a crawl against a single source
 */
export async function crawlSingleSource(
  db: DbClient,
  storage: StorageClient,
  source: Source,
  options: CrawlOptions = {}
): Promise<SourceCrawlSummary> {
  const executionId = generateId('exec');
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  const maxUrls = options.maxUrlsPerSource || 25;
  const isTestRun = !!options.isTestRun;

  let urlsDiscovered = 0;
  let urlsProcessed = 0;
  let newItems = 0;
  let updatedItems = 0;
  let unchangedItems = 0;
  let documentsDownloaded = 0;
  let errorCount = 0;
  let errorMessage: string | null = null;
  let finalStatus: 'completed' | 'partial' | 'failed' = 'completed';

  const processedResults: ProcessedItemResult[] = [];
  let fetchStatus: number | null = null;
  let responseTimeMs = 0;
  let detectedContentType = '';
  let finalUrl = source.base_url;
  let robotsAllowed = true;

  try {
    // 1. Robots.txt Compliance Check
    if (source.robots_allowed && options.respectRobots !== false) {
      const origin = getOriginUrl(source.base_url);
      const robotsRules = await getRobotsRules(origin, async (rUrl) => {
        const res = await safeFetch(rUrl, { timeoutMs: 5000, allowPrivateForTesting: true });
        return res.status === 200 && res.bodyText ? res.bodyText : null;
      });

      const parsedUrl = new URL(source.base_url);
      robotsAllowed = isPathAllowed(robotsRules, parsedUrl.pathname);
      if (!robotsAllowed) {
        throw new Error(`Crawling path "${parsedUrl.pathname}" is disallowed by robots.txt.`);
      }
    }

    // 2. Fetch the source endpoint
    const fetchRes = await safeFetch(source.base_url, {
      timeoutMs: options.timeoutMs || 15_000,
      userAgent: options.userAgent,
      allowPrivateForTesting: true,
    });

    fetchStatus = fetchRes.status;
    responseTimeMs = fetchRes.responseTimeMs;
    detectedContentType = fetchRes.contentType;
    finalUrl = fetchRes.finalUrl;

    if (fetchRes.status >= 400 || fetchRes.error) {
      throw new Error(`HTTP ${fetchRes.status} ${fetchRes.statusText}: ${fetchRes.error || 'Source endpoint returned an error.'}`);
    }

    // 3. Parse discovered items according to source_type / content-type
    let discovered: DiscoveredItem[] = [];

    const isPdfResponse = fetchRes.isPdf || (fetchRes.bodyBuffer && isPdfBuffer(fetchRes.bodyBuffer));

    if (isPdfResponse && fetchRes.bodyBuffer) {
      // Direct PDF URL
      const norm = normalizeUrl(source.base_url);
      discovered = [{
        url: source.base_url,
        normalizedUrl: norm,
        title: source.name,
        contentType: 'pdf',
        isPdf: true,
        rawBuffer: fetchRes.bodyBuffer,
      }];
    } else {
      const bodyText = fetchRes.bodyText || '';
      const st = (source.source_type || '').toUpperCase();
      const pt = (source.parser_type || '').toLowerCase();

      if (st === 'RSS' || pt === 'rss' || pt === 'rss_atom' || bodyText.includes('<rss') || bodyText.includes('<feed')) {
        discovered = parseRssFeed(bodyText, fetchRes.finalUrl).items;
      } else if (st === 'SITEMAP' || pt === 'sitemap' || bodyText.includes('<urlset') || bodyText.includes('<sitemapindex')) {
        discovered = parseSitemapXml(bodyText, fetchRes.finalUrl).items;
      } else if (st === 'JSON' || st === 'API' || pt === 'json' || detectedContentType.includes('application/json')) {
        discovered = parseJsonFeed(bodyText, fetchRes.finalUrl).items;
      } else {
        // Default HTML Link Discovery
        discovered = parseHtmlPage(bodyText, fetchRes.finalUrl).items;
      }
    }

    urlsDiscovered = discovered.length;
    const itemsToProcess = discovered.slice(0, maxUrls);

    // 4. Process each item (fingerprint, deduplicate, change detection, R2 storage)
    const sourceSlug = slugify(source.name || 'source');

    for (const item of itemsToProcess) {
      try {
        urlsProcessed++;

        // Compute fingerprint
        let fingerprint = '';
        if (item.rawBuffer) {
          fingerprint = await computeFingerprint(item.rawBuffer);
        } else if (item.rawContent) {
          fingerprint = await computeFingerprint(item.rawContent);
        } else {
          fingerprint = await computeFingerprint(item.normalizedUrl);
        }

        // Deduplication & Change Detection
        const dupCheck = await checkDuplicateAndChange(
          db,
          source.id,
          item.normalizedUrl,
          fingerprint,
          item.canonicalUrl
        );

        let r2Key: string | null = null;

        // If item is a PDF and NOT a test run, fetch buffer and store in R2
        if (item.isPdf && !isTestRun) {
          try {
            let pdfBuffer = item.rawBuffer;
            if (!pdfBuffer) {
              const pdfFetch = await safeFetch(item.url, {
                timeoutMs: 15_000,
                maxSizeBytes: 10 * 1024 * 1024,
                allowPrivateForTesting: true,
              });
              if (pdfFetch.status === 200 && pdfFetch.bodyBuffer) {
                pdfBuffer = pdfFetch.bodyBuffer;
              }
            }

            if (pdfBuffer && isPdfBuffer(pdfBuffer)) {
              const storedDoc = await storePdfDocument(
                db,
                storage,
                sourceSlug,
                item.url,
                pdfBuffer,
                dupCheck.existingPage?.id,
                item.title || undefined
              );
              r2Key = storedDoc.r2Key;
              if (!storedDoc.isExisting) {
                documentsDownloaded++;
              }
            }
          } catch (pdfErr: any) {
            console.warn(`[PDF Ingestion Warning] Failed to store ${item.url}:`, pdfErr?.message);
          }
        }

        // Save / Update records in D1 (unless test run)
        let pageId = dupCheck.existingPage?.id;

        if (!isTestRun) {
          if (dupCheck.status === 'NEW') {
            pageId = generateId('spage');
            await db.run(
              `INSERT INTO source_pages (
                id, source_id, url, normalized_url, canonical_url, title, content_type,
                fingerprint, last_content_hash, first_seen_at, last_seen_at, last_changed_at,
                last_status, http_status, r2_key, metadata_json, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'NEW', 200, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
              [
                pageId,
                source.id,
                item.url,
                item.normalizedUrl,
                item.canonicalUrl || null,
                item.title || null,
                item.contentType,
                fingerprint,
                fingerprint,
                r2Key || null,
                item.metadata ? JSON.stringify(item.metadata) : null,
              ]
            );
            newItems++;
          } else if (dupCheck.status === 'UPDATED' && dupCheck.existingPage) {
            await db.run(
              `UPDATE source_pages SET
                title = COALESCE(?, title),
                fingerprint = ?,
                last_content_hash = ?,
                last_seen_at = CURRENT_TIMESTAMP,
                last_changed_at = CURRENT_TIMESTAMP,
                last_status = 'UPDATED',
                http_status = 200,
                r2_key = COALESCE(?, r2_key),
                metadata_json = COALESCE(?, metadata_json),
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
              [
                item.title || null,
                fingerprint,
                fingerprint,
                r2Key || null,
                item.metadata ? JSON.stringify(item.metadata) : null,
                dupCheck.existingPage.id,
              ]
            );
            updatedItems++;
          } else if (dupCheck.existingPage) {
            await db.run(
              `UPDATE source_pages SET
                last_seen_at = CURRENT_TIMESTAMP,
                last_status = 'UNCHANGED',
                http_status = 200,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
              [dupCheck.existingPage.id]
            );
            unchangedItems++;
          }
        } else {
          // In test mode: tally counts for diagnostics
          if (dupCheck.status === 'NEW') newItems++;
          else if (dupCheck.status === 'UPDATED') updatedItems++;
          else unchangedItems++;
        }

        processedResults.push({
          item,
          status: dupCheck.status,
          fingerprint,
          contentHash: fingerprint,
          pageId,
          r2Key,
          isNew: dupCheck.status === 'NEW',
          isUpdated: dupCheck.status === 'UPDATED',
          isUnchanged: dupCheck.status === 'UNCHANGED',
        });
      } catch (itemErr: any) {
        errorCount++;
        processedResults.push({
          item,
          status: 'ERROR',
          fingerprint: '',
          contentHash: '',
          isNew: false,
          isUpdated: false,
          isUnchanged: false,
          error: itemErr?.message || 'Processing error',
        });
      }
    }

    if (errorCount > 0 && urlsProcessed > errorCount) {
      finalStatus = 'partial';
    }
  } catch (err: any) {
    finalStatus = 'failed';
    errorCount++;
    errorMessage = err?.message || 'Crawl execution failed.';
  }

  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - startTime;

  // 5. Update Source Health & Diagnostics in D1 (unless test run)
  if (!isTestRun) {
    const isSuccess = finalStatus === 'completed' || finalStatus === 'partial';
    const consecutiveFailures = isSuccess ? 0 : (source.consecutive_failures || 0) + 1;

    let healthStatus: HealthStatus = 'healthy';
    if (consecutiveFailures >= 3) {
      healthStatus = 'failed';
    } else if (consecutiveFailures > 0 || (responseTimeMs > 5000)) {
      healthStatus = 'warning';
    }

    const currentAvg = source.avg_response_time_ms || responseTimeMs;
    const newAvg = Math.round((currentAvg + responseTimeMs) / 2);

    await db.run(
      `UPDATE sources SET
        last_checked_at = CURRENT_TIMESTAMP,
        last_success_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE last_success_at END,
        last_error = ?,
        health_status = ?,
        consecutive_failures = ?,
        avg_response_time_ms = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        isSuccess ? 1 : 0,
        errorMessage,
        healthStatus,
        consecutiveFailures,
        newAvg,
        source.id,
      ]
    );

    // 6. Record Crawl Log
    await db.run(
      `INSERT INTO crawl_logs (
        id, source_id, started_at, completed_at, status,
        urls_discovered, urls_processed, new_items, updated_items, unchanged_items,
        errors, documents_downloaded, error_message, execution_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        generateId('clog'),
        source.id,
        startedAt,
        completedAt,
        finalStatus,
        urlsDiscovered,
        urlsProcessed,
        newItems,
        updatedItems,
        unchangedItems,
        errorCount,
        documentsDownloaded,
        errorMessage,
        executionId,
      ]
    );
  }

  return {
    sourceId: source.id,
    sourceName: source.name,
    startedAt,
    completedAt,
    durationMs,
    status: finalStatus,
    httpStatus: fetchStatus,
    urlsDiscovered,
    urlsProcessed,
    newItems,
    updatedItems,
    unchangedItems,
    documentsDownloaded,
    errors: errorCount,
    errorMessage,
    executionId,
    results: processedResults,
    diagnosticInfo: {
      responseTimeMs,
      contentType: detectedContentType,
      finalUrl,
      robotsAllowed,
    },
  };
}

/**
 * Crawls all sources that are due for checking with bounded concurrency
 */
export async function crawlDueSources(
  db: DbClient,
  storage: StorageClient,
  options: CrawlOptions & { concurrency?: number; limit?: number } = {}
): Promise<SourceCrawlSummary[]> {
  const concurrency = options.concurrency || 3;
  const limit = options.limit || 10;

  // 1. Fetch active sources from D1
  const sources = (await db.query<Source>('SELECT * FROM sources WHERE status = "active"')).results;
  const dueSources = getDueSources(sources, limit);

  if (dueSources.length === 0) {
    return [];
  }

  const summaries: SourceCrawlSummary[] = [];

  // 2. Execute with bounded concurrency pool
  for (let i = 0; i < dueSources.length; i += concurrency) {
    const batch = dueSources.slice(i, i + concurrency);
    const batchPromises = batch.map(source => 
      crawlSingleSource(db, storage, source, options).catch(err => {
        return {
          sourceId: source.id,
          sourceName: source.name,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 0,
          status: 'failed' as const,
          httpStatus: null,
          urlsDiscovered: 0,
          urlsProcessed: 0,
          newItems: 0,
          updatedItems: 0,
          unchangedItems: 0,
          documentsDownloaded: 0,
          errors: 1,
          errorMessage: err?.message || 'Crawl task crashed',
          executionId: generateId('exec'),
          results: [],
        };
      })
    );

    const batchResults = await Promise.all(batchPromises);
    summaries.push(...batchResults);
  }

  return summaries;
}
