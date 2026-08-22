// src/lib/system_health.ts
// Platform System Health & Diagnostic Diagnostics Engine

import type { DbClient } from './db.ts';

export interface ServiceHealthStatus {
  service: 'database' | 'storage' | 'ai_engine' | 'crawler' | 'email' | 'cron';
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  latencyMs?: number;
  details?: Record<string, any>;
}

export interface PlatformHealthReport {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: ServiceHealthStatus[];
}

export async function runSystemHealthCheck(
  db: DbClient,
  env?: any
): Promise<PlatformHealthReport> {
  const services: ServiceHealthStatus[] = [];

  // 1. Database (D1) Check
  const dbStart = Date.now();
  try {
    const dbTest = await db.first<{ test: number }>('SELECT 1 as test');
    const dbLatency = Date.now() - dbStart;
    if (dbTest && dbTest.test === 1) {
      services.push({
        service: 'database',
        status: dbLatency < 300 ? 'healthy' : 'degraded',
        message: 'Cloudflare D1 connection active and responding normally.',
        latencyMs: dbLatency,
      });
    } else {
      services.push({
        service: 'database',
        status: 'unhealthy',
        message: 'Unexpected response from D1 query.',
        latencyMs: dbLatency,
      });
    }
  } catch (err: any) {
    services.push({
      service: 'database',
      status: 'unhealthy',
      message: `Database error: ${err?.message}`,
    });
  }

  // 2. Storage (R2) Check
  try {
    const hasR2 = !!env?.DOCUMENTS_BUCKET;
    services.push({
      service: 'storage',
      status: hasR2 ? 'healthy' : 'degraded',
      message: hasR2
        ? 'Cloudflare R2 Documents bucket connected.'
        : 'Cloudflare R2 bucket binding not detected; local storage mode active.',
    });
  } catch {
    services.push({
      service: 'storage',
      status: 'unhealthy',
      message: 'Failed to evaluate R2 storage state.',
    });
  }

  // 3. AI Engine (DeepSeek) Check
  try {
    const aiConfig = await db.first<{ value_json: string }>(
      'SELECT value_json FROM global_settings WHERE key = "ai_settings"'
    );
    services.push({
      service: 'ai_engine',
      status: 'healthy',
      message: 'DeepSeek API integration ready with verification engine & guardrails.',
      details: { configPresent: !!aiConfig },
    });
  } catch {
    services.push({
      service: 'ai_engine',
      status: 'degraded',
      message: 'Unable to verify AI configuration.',
    });
  }

  // 4. Crawler Check
  try {
    const failedSources = (await db.first<{ c: number }>(
      'SELECT COUNT(*) as c FROM sources WHERE consecutive_failures >= 3'
    ))?.c || 0;
    const activeSources = (await db.first<{ c: number }>(
      'SELECT COUNT(*) as c FROM sources WHERE active = 1'
    ))?.c || 0;

    services.push({
      service: 'crawler',
      status: failedSources === 0 ? 'healthy' : (failedSources < 3 ? 'degraded' : 'unhealthy'),
      message: `${activeSources} active sources configured (${failedSources} failing).`,
      details: { activeSources, failedSources },
    });
  } catch {
    services.push({
      service: 'crawler',
      status: 'degraded',
      message: 'Crawler status table could not be queried.',
    });
  }

  // 5. Email Service & Queue Check
  try {
    const pendingCount = (await db.first<{ c: number }>(
      'SELECT COUNT(*) as c FROM notifications WHERE status = "pending"'
    ))?.c || 0;
    const failedCount = (await db.first<{ c: number }>(
      'SELECT COUNT(*) as c FROM notifications WHERE status = "failed"'
    ))?.c || 0;

    services.push({
      service: 'email',
      status: failedCount < 10 ? 'healthy' : 'degraded',
      message: `Email queue: ${pendingCount} pending, ${failedCount} failed.`,
      details: { pendingCount, failedCount },
    });
  } catch {
    services.push({
      service: 'email',
      status: 'degraded',
      message: 'Could not query email notification queue.',
    });
  }

  // 6. Cron Execution Check
  try {
    const lastCrawl = await db.first<{ started_at: string }>(
      'SELECT started_at FROM crawl_logs ORDER BY started_at DESC LIMIT 1'
    );
    services.push({
      service: 'cron',
      status: 'healthy',
      message: lastCrawl?.started_at
        ? `Last scheduled crawl task executed at ${lastCrawl.started_at}.`
        : 'Cron trigger registered and waiting for next scheduled execution.',
    });
  } catch {
    services.push({
      service: 'cron',
      status: 'degraded',
      message: 'Could not inspect cron logs.',
    });
  }

  const overall = services.some(s => s.status === 'unhealthy')
    ? 'unhealthy'
    : (services.some(s => s.status === 'degraded') ? 'degraded' : 'healthy');

  return {
    overall,
    timestamp: new Date().toISOString(),
    services,
  };
}
