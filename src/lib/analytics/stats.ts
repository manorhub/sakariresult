// src/lib/analytics/stats.ts
// Aggregated Platform Statistics for Admin & System Monitoring

import type { DbClient } from '../db.ts';

export interface AggregatePlatformStats {
  users: {
    total: number;
    active: number;
    verified: number;
    newToday: number;
  };
  content: {
    totalPublished: number;
    jobs: number;
    results: number;
    admitCards: number;
    answerKeys: number;
    sponsored: number;
  };
  engagement: {
    savedItems: number;
    followedOrgs: number;
    followedCategories: number;
    totalSearches: number;
  };
  notifications: {
    sent: number;
    pending: number;
    failed: number;
  };
  revenue: {
    totalAmount: number;
    currency: string;
    ads: number;
    subscriptions: number;
    sponsored: number;
  };
}

export async function getPlatformStatistics(db: DbClient): Promise<AggregatePlatformStats> {
  const usersTotal = (await db.first<{ c: number }>('SELECT COUNT(*) as c FROM users'))?.c || 0;
  const usersActive = (await db.first<{ c: number }>("SELECT COUNT(*) as c FROM users WHERE status = 'active'"))?.c || 0;
  const usersVerified = (await db.first<{ c: number }>('SELECT COUNT(*) as c FROM users WHERE email_verified = 1'))?.c || 0;
  const usersNewToday = (await db.first<{ c: number }>("SELECT COUNT(*) as c FROM users WHERE date(created_at) = date('now')"))?.c || 0;

  const contentPublished = (await db.first<{ c: number }>("SELECT COUNT(*) as c FROM content_items WHERE status = 'published'"))?.c || 0;
  const contentJobs = (await db.first<{ c: number }>("SELECT COUNT(*) as c FROM content_items WHERE status = 'published' AND type = 'job'"))?.c || 0;
  const contentResults = (await db.first<{ c: number }>("SELECT COUNT(*) as c FROM content_items WHERE status = 'published' AND type = 'result'"))?.c || 0;
  const contentAdmitCards = (await db.first<{ c: number }>("SELECT COUNT(*) as c FROM content_items WHERE status = 'published' AND type = 'admit_card'"))?.c || 0;
  const contentAnswerKeys = (await db.first<{ c: number }>("SELECT COUNT(*) as c FROM content_items WHERE status = 'published' AND type = 'answer_key'"))?.c || 0;
  const contentSponsored = (await db.first<{ c: number }>('SELECT COUNT(*) as c FROM content_items WHERE sponsored = 1'))?.c || 0;

  const savedItems = (await db.first<{ c: number }>('SELECT COUNT(*) as c FROM saved_items'))?.c || 0;
  const followedOrgs = (await db.first<{ c: number }>('SELECT COUNT(*) as c FROM followed_organizations'))?.c || 0;
  const followedCategories = (await db.first<{ c: number }>('SELECT COUNT(*) as c FROM followed_categories'))?.c || 0;
  const totalSearches = (await db.first<{ s: number }>('SELECT SUM(hit_count) as s FROM search_queries'))?.s || 0;

  const notifSent = (await db.first<{ c: number }>("SELECT COUNT(*) as c FROM notifications WHERE status = 'sent'"))?.c || 0;
  const notifPending = (await db.first<{ c: number }>("SELECT COUNT(*) as c FROM notifications WHERE status = 'pending'"))?.c || 0;
  const notifFailed = (await db.first<{ c: number }>("SELECT COUNT(*) as c FROM notifications WHERE status = 'failed'"))?.c || 0;

  const revTotal = (await db.first<{ s: number }>('SELECT SUM(amount) as s FROM revenue_records'))?.s || 0;
  const revAds = (await db.first<{ s: number }>("SELECT SUM(amount) as s FROM revenue_records WHERE revenue_type = 'advertising'"))?.s || 0;
  const revSubs = (await db.first<{ s: number }>("SELECT SUM(amount) as s FROM revenue_records WHERE revenue_type = 'subscription'"))?.s || 0;
  const revSponsored = (await db.first<{ s: number }>("SELECT SUM(amount) as s FROM revenue_records WHERE revenue_type = 'sponsored'"))?.s || 0;

  return {
    users: {
      total: usersTotal,
      active: usersActive,
      verified: usersVerified,
      newToday: usersNewToday,
    },
    content: {
      totalPublished: contentPublished,
      jobs: contentJobs,
      results: contentResults,
      admitCards: contentAdmitCards,
      answerKeys: contentAnswerKeys,
      sponsored: contentSponsored,
    },
    engagement: {
      savedItems,
      followedOrgs,
      followedCategories,
      totalSearches,
    },
    notifications: {
      sent: notifSent,
      pending: notifPending,
      failed: notifFailed,
    },
    revenue: {
      totalAmount: revTotal,
      currency: 'INR',
      ads: revAds,
      subscriptions: revSubs,
      sponsored: revSponsored,
    },
  };
}
