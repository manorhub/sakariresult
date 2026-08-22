// src/lib/crawler/parsers/pdf.ts
// PDF detection, verification, and R2 document storage engine

import type { DbClient } from '../../db';
import type { StorageClient } from '../../r2';
import { computeFingerprint } from '../fingerprint.ts';
import { generateId, slugify } from '../../utils.ts';

export interface StoredDocumentResult {
  documentId: string;
  r2Key: string;
  checksum: string;
  fileSize: number;
  isExisting: boolean;
}

/**
 * Checks if a byte buffer contains PDF magic bytes (%PDF)
 */
export function isPdfBuffer(buffer: Uint8Array): boolean {
  if (!buffer || buffer.byteLength < 4) return false;
  // %PDF in ASCII is [0x25, 0x50, 0x44, 0x46]
  return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
}

/**
 * Stores an eligible PDF document in R2 and records its metadata in D1
 */
export async function storePdfDocument(
  db: DbClient,
  storage: StorageClient,
  sourceSlug: string,
  sourceUrl: string,
  pdfBuffer: Uint8Array,
  sourcePageId?: string | null,
  fileNameHint?: string
): Promise<StoredDocumentResult> {
  const checksum = await computeFingerprint(pdfBuffer);
  const fileSize = pdfBuffer.byteLength;

  // 1. Check if this exact checksum is already archived in source_documents
  const existingDoc = await db.first<{ id: string; r2_key: string }>(
    'SELECT id, r2_key FROM source_documents WHERE checksum = ?',
    [checksum]
  );

  if (existingDoc) {
    return {
      documentId: existingDoc.id,
      r2Key: existingDoc.r2_key,
      checksum,
      fileSize,
      isExisting: true,
    };
  }

  // 2. Generate path: documents/{source-slug}/{year}/{safe-file-name}.pdf
  const year = new Date().getFullYear().toString();
  let baseName = fileNameHint ? slugify(fileNameHint.replace(/\.pdf$/i, '')) : '';
  if (!baseName) {
    const urlObj = new URL(sourceUrl);
    const lastPart = urlObj.pathname.split('/').pop() || 'document';
    baseName = slugify(lastPart.replace(/\.pdf$/i, ''));
  }
  if (!baseName) baseName = 'notification';

  const safeFileName = `${sourceSlug}/${year}/${baseName}-${checksum.slice(0, 8)}.pdf`;

  // 3. Upload to R2
  const r2Key = await storage.upload(pdfBuffer, {
    folder: 'documents',
    fileName: safeFileName,
    contentType: 'application/pdf',
    customMetadata: {
      sourceUrl,
      checksum,
      uploadedAt: new Date().toISOString(),
    }
  });

  // 4. Save metadata to source_documents table in D1
  const docId = generateId('doc');
  await db.run(
    `INSERT INTO source_documents (id, source_page_id, source_url, r2_key, file_type, file_size, checksum, created_at)
     VALUES (?, ?, ?, ?, 'pdf', ?, ?, CURRENT_TIMESTAMP)`,
    [docId, sourcePageId || null, sourceUrl, r2Key, fileSize, checksum]
  );

  return {
    documentId: docId,
    r2Key,
    checksum,
    fileSize,
    isExisting: false,
  };
}
