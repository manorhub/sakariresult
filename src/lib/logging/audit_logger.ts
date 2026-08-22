// src/lib/logging/audit_logger.ts
// Admin Operation Audit Logging Layer

import type { DbClient } from '../db.ts';
import { sanitizeLogMetadata } from './error_logger.ts';

export type AuditAction =
  | 'publish'
  | 'unpublish'
  | 'delete'
  | 'source_update'
  | 'ai_settings'
  | 'content_edit'
  | 'user_suspend'
  | 'user_activate'
  | 'ads_settings'
  | 'flag_toggle'
  | 'maintenance_toggle'
  | 'revenue_entry';

export type AuditResourceType =
  | 'content_item'
  | 'source'
  | 'user'
  | 'setting'
  | 'flag'
  | 'revenue'
  | 'notification';

export interface AuditLogRecord {
  id: string;
  admin_id: string;
  action: AuditAction;
  resource_type: AuditResourceType;
  resource_id: string | null;
  metadata_json: string | null;
  created_at: string;
}

export async function logAdminAudit(
  db: DbClient,
  adminId: string,
  action: AuditAction,
  resourceType: AuditResourceType,
  resourceId: string | null = null,
  metadata: any = {}
): Promise<string> {
  const auditId = `aud_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const sanitized = sanitizeLogMetadata(metadata);
  const metaJson = JSON.stringify(sanitized);

  try {
    await db.run(`
      INSERT INTO admin_audit_logs (id, admin_id, action, resource_type, resource_id, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `, [auditId, adminId, action, resourceType, resourceId, metaJson]);
  } catch (err: any) {
    console.error(`[AUDIT_ERROR] Failed to record admin audit log:`, err?.message);
  }

  return auditId;
}
