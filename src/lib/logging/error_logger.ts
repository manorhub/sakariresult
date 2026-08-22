// src/lib/logging/error_logger.ts
// Structured Error Logging with Sensitive Data Masking

import type { DbClient } from '../db.ts';

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';
export type ErrorService = 'crawler' | 'ai_engine' | 'd1_database' | 'r2_storage' | 'email_service' | 'auth' | 'payment' | 'system';

export interface ErrorLogRecord {
  id: string;
  service: ErrorService;
  operation: string;
  severity: ErrorSeverity;
  error_code: string;
  message: string;
  metadata_json: string | null;
  resolved: number;
  created_at: string;
}

const SENSITIVE_KEYS = [
  'password',
  'password_hash',
  'salt',
  'token',
  'session_token',
  'api_key',
  'apiKey',
  'secret',
  'jwt_secret',
  'authorization',
  'bearer',
  'signature',
];

/**
 * Recursively sanitizes metadata object to strip out passwords, secrets and tokens
 */
export function sanitizeLogMetadata(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeLogMetadata(item));
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some(sk => lowerKey.includes(sk.toLowerCase()))) {
      sanitized[key] = '[REDACTED_SECRET]';
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitizeLogMetadata(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Logs a structured error into D1 with safety redaction
 */
export async function logError(
  db: DbClient,
  service: ErrorService,
  operation: string,
  errorCode: string,
  message: string,
  severity: ErrorSeverity = 'error',
  metadata: any = {}
): Promise<string> {
  const logId = `err_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const sanitizedMeta = sanitizeLogMetadata(metadata);
  const metaJson = JSON.stringify(sanitizedMeta);

  try {
    await db.run(`
      INSERT INTO error_logs (id, service, operation, severity, error_code, message, metadata_json, resolved, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
    `, [logId, service, operation, severity, errorCode, message.slice(0, 1000), metaJson]);
  } catch (err: any) {
    console.error(`[CRITICAL] Fallback logger failed to write error_logs:`, err?.message);
  }

  return logId;
}
