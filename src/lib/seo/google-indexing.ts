// src/lib/seo/google-indexing.ts
// Google Instant Indexing API Client (OAuth2 JWT / RS256 with Web Crypto API)
// Compatible with Cloudflare Workers Edge & Node.js runtimes

import type { DbClient } from '../db.ts';
import { getGlobalSetting, setGlobalSetting } from '../settings.ts';

export interface GoogleServiceAccountCredentials {
  client_email: string;
  private_key: string;
  project_id?: string;
}

export interface GoogleIndexingSettings {
  enabled: boolean;
  auto_index_on_publish: boolean;
  auto_index_on_update: boolean;
  only_index_job_postings: boolean; // Strictly limits API push to Job Postings (/jobs/*) per Google Policy
  client_email: string;
  private_key: string;
  project_id: string;
  daily_quota?: number;
}

export interface IndexingLog {
  id: string;
  url: string;
  content_item_id?: string | null;
  notification_type: 'URL_UPDATED' | 'URL_DELETED';
  status: 'success' | 'failed' | 'queued';
  http_status: number | null;
  response_json: string | null;
  error_message: string | null;
  created_at: string;
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_INDEXING_API_URL = 'https://indexing.googleapis.com/v3/urlNotifications:publish';
const GOOGLE_METADATA_API_URL = 'https://indexing.googleapis.com/v3/urlNotifications/metadata';
const INDEXING_SCOPE = 'https://www.googleapis.com/auth/indexing';

/**
 * Converts a string to base64url format
 */
function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return bytesToBase64Url(bytes);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Imports PKCS8 PEM private key into CryptoKey using Web Crypto API
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const cleanPem = pem
    .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/g, '')
    .replace(/-----END (?:RSA )?PRIVATE KEY-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\s+/g, '');

  const binaryDerString = atob(cleanPem);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }

  return await crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['sign']
  );
}

/**
 * Generates signed RS256 JWT assertion for Google OAuth2
 */
export async function createSignedGoogleJwt(credentials: GoogleServiceAccountCredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  const payload = {
    iss: credentials.client_email,
    scope: INDEXING_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const privateKey = await importPrivateKey(credentials.private_key);
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(unsignedToken)
  );

  const signatureB64 = bytesToBase64Url(new Uint8Array(signatureBuffer));
  return `${unsignedToken}.${signatureB64}`;
}

/**
 * Exchanges signed JWT for a short-lived Google OAuth access token
 */
export async function getGoogleAccessToken(credentials: GoogleServiceAccountCredentials): Promise<string> {
  const jwt = await createSignedGoogleJwt(credentials);

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Google OAuth Token Error (${res.status}): ${errorBody}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/**
 * Retrieves Google Indexing Settings from database
 */
export async function getGoogleIndexingSettings(db: DbClient): Promise<GoogleIndexingSettings> {
  const settings = await getGlobalSetting<GoogleIndexingSettings>(db, 'google_indexing', {
    enabled: false,
    auto_index_on_publish: true,
    auto_index_on_update: true,
    only_index_job_postings: true,
    client_email: '',
    private_key: '',
    project_id: '',
    daily_quota: 200
  });

  return settings;
}

/**
 * Helper to check if a URL or Content Type is eligible for Google Indexing API
 * Per Google's official documentation, Indexing API is strictly reserved for JobPosting pages.
 */
export function isJobPostingUrlOrType(url: string, contentType?: string | null): boolean {
  if (contentType) {
    return contentType === 'job' || contentType === 'government_job';
  }
  try {
    const parsed = new URL(url, 'https://realsarkariexam.com');
    const path = parsed.pathname.toLowerCase();
    // Exclude explicit non-job routes
    if (
      path.startsWith('/results') ||
      path.startsWith('/admit-card') ||
      path.startsWith('/answer-key') ||
      path.startsWith('/syllabus') ||
      path.startsWith('/schemes') ||
      path.startsWith('/exams') ||
      path.startsWith('/scholarships') ||
      path.startsWith('/important-updates')
    ) {
      return false;
    }
    // Check if it's a job path
    return path.startsWith('/jobs/') || path === '/jobs';
  } catch {
    return url.includes('/jobs/');
  }
}

/**
 * Saves Google Indexing Settings into database
 */
export async function saveGoogleIndexingSettings(db: DbClient, settings: Partial<GoogleIndexingSettings>): Promise<void> {
  const current = await getGoogleIndexingSettings(db);
  const updated: GoogleIndexingSettings = {
    ...current,
    ...settings
  };

  await setGlobalSetting(db, 'google_indexing', 'seo', updated);
}

/**
 * Submits a single URL notification (URL_UPDATED or URL_DELETED) to Google Indexing API
 */
export async function submitUrlToGoogle(
  db: DbClient,
  url: string,
  type: 'URL_UPDATED' | 'URL_DELETED' = 'URL_UPDATED',
  options: {
    contentItemId?: string;
    contentType?: string;
    overrideCredentials?: GoogleServiceAccountCredentials;
  } = {}
): Promise<{ success: boolean; data?: any; error?: string; httpStatus?: number; skipped?: boolean }> {
  const settings = await getGoogleIndexingSettings(db);

  // Google Policy Compliance Check: Restrict to Job Postings only
  if (settings.only_index_job_postings !== false) {
    const isJob = isJobPostingUrlOrType(url, options.contentType);
    if (!isJob) {
      return {
        success: true,
        skipped: true,
        error: 'Skipped: URL is not a JobPosting. Google Indexing API is strictly reserved for Job Notifications per Google Guidelines. Results, Admit Cards, and Updates are indexed via XML sitemap.',
      };
    }
  }

  const credentials = options.overrideCredentials || {
    client_email: settings.client_email,
    private_key: settings.private_key,
    project_id: settings.project_id
  };

  if (!credentials.client_email || !credentials.private_key) {
    return {
      success: false,
      error: 'Google Service Account credentials not configured.'
    };
  }

  const logId = `idx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  try {
    const accessToken = await getGoogleAccessToken(credentials);

    const res = await fetch(GOOGLE_INDEXING_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        url,
        type
      })
    });

    const httpStatus = res.status;
    const resText = await res.text();
    let resJson: any = null;
    try {
      resJson = JSON.parse(resText);
    } catch {}

    if (res.ok) {
      await db.run(
        `INSERT INTO google_indexing_logs (id, url, content_item_id, notification_type, status, http_status, response_json, created_at)
         VALUES (?, ?, ?, ?, 'success', ?, ?, datetime('now'))`,
        [logId, url, options.contentItemId || null, type, httpStatus, resText]
      );

      return {
        success: true,
        data: resJson || resText,
        httpStatus
      };
    } else {
      const errorMsg = resJson?.error?.message || resText || `HTTP ${httpStatus}`;
      await db.run(
        `INSERT INTO google_indexing_logs (id, url, content_item_id, notification_type, status, http_status, response_json, error_message, created_at)
         VALUES (?, ?, ?, ?, 'failed', ?, ?, ?, datetime('now'))`,
        [logId, url, options.contentItemId || null, type, httpStatus, resText, errorMsg]
      );

      return {
        success: false,
        error: errorMsg,
        httpStatus
      };
    }
  } catch (err: any) {
    await db.run(
      `INSERT INTO google_indexing_logs (id, url, content_item_id, notification_type, status, error_message, created_at)
       VALUES (?, ?, ?, ?, 'failed', ?, datetime('now'))`,
      [logId, url, options.contentItemId || null, type, err.message]
    );

    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Checks metadata/indexing status for a URL from Google Indexing API
 */
export async function getUrlIndexingStatus(
  db: DbClient,
  url: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  const settings = await getGoogleIndexingSettings(db);
  if (!settings.client_email || !settings.private_key) {
    return { success: false, error: 'Google Service Account credentials missing.' };
  }

  try {
    const accessToken = await getGoogleAccessToken({
      client_email: settings.client_email,
      private_key: settings.private_key
    });

    const res = await fetch(`${GOOGLE_METADATA_API_URL}?url=${encodeURIComponent(url)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `Google API Error (${res.status}): ${errText}` };
    }

    const data = await res.json();
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Batch submits multiple URLs to Google Indexing API
 */
export async function batchSubmitUrlsToGoogle(
  db: DbClient,
  urls: string[],
  type: 'URL_UPDATED' | 'URL_DELETED' = 'URL_UPDATED'
): Promise<{ total: number; successCount: number; failedCount: number; results: any[] }> {
  const results: any[] = [];
  let successCount = 0;
  let failedCount = 0;

  for (const url of urls) {
    const trimmed = url.trim();
    if (!trimmed) continue;

    const res = await submitUrlToGoogle(db, trimmed, type);
    results.push({ url: trimmed, ...res });
    if (res.success) {
      successCount++;
    } else {
      failedCount++;
    }
  }

  return {
    total: results.length,
    successCount,
    failedCount,
    results
  };
}

/**
 * Retrieves recent Google Indexing Logs
 */
export async function getRecentIndexingLogs(db: DbClient, limit: number = 50): Promise<IndexingLog[]> {
  const res = await db.query<IndexingLog>(`
    SELECT * FROM google_indexing_logs
    ORDER BY created_at DESC
    LIMIT ?
  `, [limit]);

  return res.results;
}
