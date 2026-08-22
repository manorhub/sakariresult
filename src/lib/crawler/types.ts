import type { PageStatus } from '../types';

export interface CrawlOptions {
  maxUrlsPerSource?: number;
  timeoutMs?: number;
  maxSizeBytes?: number;
  respectRobots?: boolean;
  userAgent?: string;
  isTestRun?: boolean;
}

export interface FetchResult {
  url: string;
  finalUrl: string;
  status: number;
  statusText: string;
  contentType: string;
  contentLength: number;
  bodyText?: string;
  bodyBuffer?: Uint8Array;
  isPdf: boolean;
  headers: Record<string, string>;
  responseTimeMs: number;
  error?: string;
}

export interface DiscoveredItem {
  url: string;
  normalizedUrl: string;
  canonicalUrl?: string | null;
  title?: string | null;
  snippet?: string | null;
  contentType: 'html' | 'pdf' | 'json' | 'xml' | 'rss';
  rawContent?: string;
  rawBuffer?: Uint8Array;
  metadata?: Record<string, any>;
  isPdf: boolean;
}

export interface ParseResult {
  items: DiscoveredItem[];
  feedTitle?: string;
  feedDescription?: string;
  error?: string;
}

export interface ProcessedItemResult {
  item: DiscoveredItem;
  status: PageStatus;
  fingerprint: string;
  contentHash: string;
  pageId?: string;
  r2Key?: string | null;
  isNew: boolean;
  isUpdated: boolean;
  isUnchanged: boolean;
  error?: string;
}

export interface SourceCrawlSummary {
  sourceId: string;
  sourceName: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: 'completed' | 'partial' | 'failed';
  httpStatus: number | null;
  urlsDiscovered: number;
  urlsProcessed: number;
  newItems: number;
  updatedItems: number;
  unchangedItems: number;
  documentsDownloaded: number;
  errors: number;
  errorMessage?: string | null;
  executionId: string;
  results: ProcessedItemResult[];
  diagnosticInfo?: {
    responseTimeMs: number;
    contentType: string;
    finalUrl: string;
    robotsAllowed: boolean;
  };
}
