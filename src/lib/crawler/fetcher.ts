// src/lib/crawler/fetcher.ts
// Secure HTTP client with SSRF protection, size caps, retries, and timeout controls

import type { FetchResult } from './types';

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; SarkariBot/1.0; +https://realsarkariexam.com/bot)';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB cap

const PRIVATE_IP_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

/**
 * Validates that the hostname is not a private or loopback IP (SSRF guard)
 */
export function isSafePublicUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(host)) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxSizeBytes?: number;
  userAgent?: string;
  maxRetries?: number;
  headers?: Record<string, string>;
  allowPrivateForTesting?: boolean;
}

/**
 * Safe server-side fetch with SSRF validation, size limits, and transient error retries
 */
export async function safeFetch(targetUrl: string, options: SafeFetchOptions = {}): Promise<FetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxSizeBytes = options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const maxRetries = options.maxRetries ?? 2;

  if (!options.allowPrivateForTesting && !isSafePublicUrl(targetUrl)) {
    return {
      url: targetUrl,
      finalUrl: targetUrl,
      status: 400,
      statusText: 'Bad Request (Blocked by SSRF Policy)',
      contentType: 'text/plain',
      contentLength: 0,
      isPdf: false,
      headers: {},
      responseTimeMs: 0,
      error: 'Destination URL is not an allowed public HTTP(S) address.'
    };
  }

  let attempt = 0;
  let lastError: any = null;

  while (attempt <= maxRetries) {
    attempt++;
    const startTime = Date.now();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,application/json,*/*;q=0.8',
          'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.8',
          ...(options.headers || {}),
        },
        redirect: 'follow',
        signal: controller.signal,
      });

      clearTimeout(timer);
      const responseTimeMs = Date.now() - startTime;

      const headersObj: Record<string, string> = {};
      response.headers.forEach((val, key) => {
        headersObj[key.toLowerCase()] = val;
      });

      const contentType = (headersObj['content-type'] || '').toLowerCase();
      const isPdf = contentType.includes('application/pdf') || targetUrl.toLowerCase().endsWith('.pdf');

      // Check Content-Length header cap
      const declaredLength = parseInt(headersObj['content-length'] || '0', 10);
      if (declaredLength > maxSizeBytes) {
        return {
          url: targetUrl,
          finalUrl: response.url || targetUrl,
          status: 413,
          statusText: 'Payload Too Large',
          contentType,
          contentLength: declaredLength,
          isPdf,
          headers: headersObj,
          responseTimeMs,
          error: `Response size (${declaredLength} bytes) exceeds limit of ${maxSizeBytes} bytes.`
        };
      }

      // Handle 429 Too Many Requests
      if (response.status === 429) {
        const retryAfter = headersObj['retry-after'] || '60';
        return {
          url: targetUrl,
          finalUrl: response.url || targetUrl,
          status: 429,
          statusText: 'Too Many Requests',
          contentType,
          contentLength: 0,
          isPdf,
          headers: headersObj,
          responseTimeMs,
          error: `Rate limited by source (Retry-After: ${retryAfter}s).`
        };
      }

      // If server error 5xx, retry with backoff unless max attempts reached
      if (response.status >= 500 && attempt <= maxRetries) {
        await new Promise(r => setTimeout(r, attempt * 1000));
        continue;
      }

      // Read body stream with cap
      if (isPdf) {
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > maxSizeBytes) {
          return {
            url: targetUrl,
            finalUrl: response.url || targetUrl,
            status: 413,
            statusText: 'Payload Too Large',
            contentType,
            contentLength: arrayBuffer.byteLength,
            isPdf: true,
            headers: headersObj,
            responseTimeMs,
            error: `PDF size exceeds max limit (${arrayBuffer.byteLength} > ${maxSizeBytes}).`
          };
        }
        return {
          url: targetUrl,
          finalUrl: response.url || targetUrl,
          status: response.status,
          statusText: response.statusText,
          contentType,
          contentLength: arrayBuffer.byteLength,
          bodyBuffer: new Uint8Array(arrayBuffer),
          isPdf: true,
          headers: headersObj,
          responseTimeMs,
        };
      } else {
        const bodyText = await response.text();
        return {
          url: targetUrl,
          finalUrl: response.url || targetUrl,
          status: response.status,
          statusText: response.statusText,
          contentType,
          contentLength: bodyText.length,
          bodyText,
          isPdf: false,
          headers: headersObj,
          responseTimeMs,
        };
      }
    } catch (err: any) {
      clearTimeout(timer);
      lastError = err;

      // Abort / Timeout error
      if (err?.name === 'AbortError') {
        if (attempt <= maxRetries) {
          await new Promise(r => setTimeout(r, attempt * 1000));
          continue;
        }
        return {
          url: targetUrl,
          finalUrl: targetUrl,
          status: 408,
          statusText: 'Request Timeout',
          contentType: 'text/plain',
          contentLength: 0,
          isPdf: false,
          headers: {},
          responseTimeMs: Date.now() - startTime,
          error: `HTTP request timed out after ${timeoutMs}ms.`
        };
      }

      // Network transient error retry
      if (attempt <= maxRetries) {
        await new Promise(r => setTimeout(r, attempt * 1000));
        continue;
      }
    }
  }

  return {
    url: targetUrl,
    finalUrl: targetUrl,
    status: 502,
    statusText: 'Bad Gateway / Fetch Failure',
    contentType: 'text/plain',
    contentLength: 0,
    isPdf: false,
    headers: {},
    responseTimeMs: 0,
    error: lastError?.message || 'Network fetch failed after retries.'
  };
}
