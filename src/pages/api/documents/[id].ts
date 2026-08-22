// src/pages/api/documents/[id].ts
// Secure Document Proxy Endpoint for R2 Documents & Official PDF Access
// Strictly looks up document by ID in database; prevents arbitrary file path traversal.

import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db.ts';
import { getStorage } from '../../../lib/r2.ts';
import type { SourceDocument } from '../../../lib/types.ts';

export const GET: APIRoute = async ({ params, locals }) => {
  const { id } = params;

  if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return new Response('Invalid document identifier.', { status: 400 });
  }

  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const r2 = (locals as any)?.runtime?.env?.R2;
    const db = getDb(d1);
    const storage = getStorage(r2);

    const doc = await db.first<SourceDocument>('SELECT * FROM source_documents WHERE id = ?', [id]);

    if (!doc) {
      return new Response('Document not found.', { status: 404 });
    }

    // If document is stored in R2
    if (doc.r2_key) {
      const fileObj = await storage.getDownloadStream(doc.r2_key);
      if (fileObj) {
        return new Response(fileObj.body as any, {
          status: 200,
          headers: {
            'Content-Type': doc.mime_type || (doc.file_type === 'pdf' ? 'application/pdf' : 'application/octet-stream'),
            'Content-Disposition': `inline; filename="${doc.id}.pdf"`,
            'Cache-Control': 'public, max-age=86400, s-maxage=604800',
          },
        });
      }
    }

    // If document only has an external URL, safely redirect to verified URL
    const docUrl = doc.source_url || doc.url;
    if (docUrl && (docUrl.startsWith('https://') || docUrl.startsWith('http://'))) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: docUrl,
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    return new Response('Document storage location unavailable.', { status: 404 });
  } catch (err: any) {
    return new Response(`Document retrieval error: ${err?.message || 'Internal server error'}`, { status: 500 });
  }
};
