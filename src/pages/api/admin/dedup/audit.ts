// src/pages/api/admin/dedup/audit.ts
// Database Deduplication Audit Engine (Dry-Run and Candidate Grouping)

import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db.ts';
import { extractStructuredIdentity, compareIdentities } from '../../../../lib/dedup/index.ts';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const session = (locals as any).adminSession;
  if (!session) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const d1 = (locals as any)?.runtime?.env?.DB;
  const db = getDb(d1);

  try {
    const itemsResult = await db.query<any>(
      `SELECT ci.*, j.vacancy, j.application_last_date, j.official_notification_url, j.official_apply_url, j.official_website_url
       FROM content_items ci
       LEFT JOIN jobs j ON j.content_item_id = ci.id
       WHERE ci.status != 'archived'
       ORDER BY ci.created_at DESC LIMIT 200`
    );
    const items = itemsResult.results || [];

    const identities = items.map((item: any) => ({
      item,
      identity: extractStructuredIdentity({
        title: item.title,
        type: item.type,
        advertisement_number: item.advertisement_number,
        notification_number: item.notification_number,
        vacancy: item.vacancy,
        application_last_date: item.application_last_date,
        official_notification_url: item.official_notification_url,
        official_apply_url: item.official_apply_url,
        official_website_url: item.official_website_url,
      }),
    }));

    const duplicatePairs: any[] = [];
    const seenPairs = new Set<string>();

    for (let i = 0; i < identities.length; i++) {
      for (let j = i + 1; j < identities.length; j++) {
        const a = identities[i];
        const b = identities[j];

        if (a.item.id === b.item.id) continue;
        const pairKey = [a.item.id, b.item.id].sort().join(':');
        if (seenPairs.has(pairKey)) continue;

        const comparison = compareIdentities(a.identity, b.identity);
        if (comparison.confidenceScore >= 65) {
          seenPairs.add(pairKey);
          duplicatePairs.push({
            pairId: pairKey,
            candidateA: {
              id: a.item.id,
              title: a.item.title,
              type: a.item.type,
              slug: a.item.slug,
              status: a.item.status,
              sourceUrl: a.item.source_url,
              createdAt: a.item.created_at,
              vacancy: a.item.vacancy,
              lastDate: a.item.application_last_date,
            },
            candidateB: {
              id: b.item.id,
              title: b.item.title,
              type: b.item.type,
              slug: b.item.slug,
              status: b.item.status,
              sourceUrl: b.item.source_url,
              createdAt: b.item.created_at,
              vacancy: b.item.vacancy,
              lastDate: b.item.application_last_date,
            },
            matchResult: comparison,
          });
        }
      }
    }

    const highConfidence = duplicatePairs.filter(p => p.matchResult.confidenceScore >= 85);
    const reviewRequired = duplicatePairs.filter(p => p.matchResult.confidenceScore >= 65 && p.matchResult.confidenceScore < 85);

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          totalScanned: items.length,
          potentialDuplicates: duplicatePairs.length,
          highConfidence: highConfidence.length,
          reviewRequired: reviewRequired.length,
          unique: items.length - duplicatePairs.length,
        },
        pairs: duplicatePairs,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
