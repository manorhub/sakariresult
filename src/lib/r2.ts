// src/lib/r2.ts
// Cloudflare R2 Storage Foundation & Reusable Server-Side Utility

import type { R2Bucket, R2ObjectBody } from '@cloudflare/workers-types';

export const R2_STORAGE_PATHS = {
  DOCUMENTS: 'documents',
  IMAGES: 'images',
  LOGOS: 'logos',
  GENERATED: 'generated',
  OG_IMAGES: 'og-images',
} as const;

export type StorageFolder = typeof R2_STORAGE_PATHS[keyof typeof R2_STORAGE_PATHS];

export interface FileUploadOptions {
  folder: StorageFolder;
  fileName: string;
  contentType?: string;
  customMetadata?: Record<string, string>;
}

export interface FileMetadataResult {
  key: string;
  size: number;
  etag: string;
  uploaded: Date;
  contentType?: string;
  customMetadata?: Record<string, string>;
}

/**
 * Generate a clean, URL-safe and collision-resistant filename
 */
export function getSafeFileName(originalName: string, prefix?: string): string {
  const parts = originalName.split('.');
  const extension = parts.length > 1 ? parts.pop()?.toLowerCase() : '';
  const baseName = parts.join('.');
  
  const sanitized = baseName
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  const timestamp = Date.now().toString(36);
  const randomSuffix = Math.random().toString(36).substring(2, 7);

  const finalName = prefix
    ? `${prefix}-${sanitized}-${timestamp}-${randomSuffix}`
    : `${sanitized}-${timestamp}-${randomSuffix}`;

  return extension ? `${finalName}.${extension}` : finalName;
}

/**
 * Build the canonical logical storage key
 */
export function buildStorageKey(folder: StorageFolder, safeFileName: string): string {
  return `${folder}/${safeFileName}`;
}

export interface StorageClient {
  upload(data: any, options: FileUploadOptions): Promise<string>;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  getMetadata(key: string): Promise<FileMetadataResult | null>;
  getDownloadStream(key: string): Promise<R2ObjectBody | null>;
}

/**
 * R2 Storage Client
 */
export function getStorage(bucket?: R2Bucket | null): StorageClient {
  return {
    async upload(data: any, options: FileUploadOptions) {
      const safeName = getSafeFileName(options.fileName);
      const key = buildStorageKey(options.folder, safeName);

      if (bucket && typeof bucket.put === 'function') {
        await bucket.put(key, data as any, {
          httpMetadata: {
            contentType: options.contentType || 'application/octet-stream',
          },
          customMetadata: options.customMetadata,
        });
        return key;
      }

      // In local dev without R2 binding, return mock key for testing
      console.log(`[Storage Mock] Uploaded to key: ${key}`);
      return key;
    },

    async delete(key: string) {
      if (bucket && typeof bucket.delete === 'function') {
        await bucket.delete(key);
        return true;
      }
      console.log(`[Storage Mock] Deleted key: ${key}`);
      return true;
    },

    async exists(key: string) {
      if (bucket && typeof bucket.head === 'function') {
        const obj = await bucket.head(key);
        return obj !== null;
      }
      return false;
    },

    async getMetadata(key: string) {
      if (bucket && typeof bucket.head === 'function') {
        const obj = await bucket.head(key);
        if (!obj) return null;
        return {
          key: obj.key,
          size: obj.size,
          etag: obj.etag,
          uploaded: obj.uploaded,
          contentType: obj.httpMetadata?.contentType,
          customMetadata: obj.customMetadata,
        };
      }
      return null;
    },

    async getDownloadStream(key: string) {
      if (bucket && typeof bucket.get === 'function') {
        return await bucket.get(key);
      }
      return null;
    },
  };
}
