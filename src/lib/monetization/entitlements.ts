// src/lib/monetization/entitlements.ts
// Server-Side Subscription Entitlement Engine

import type { DbClient } from '../db.ts';

export type PremiumFeature =
  | 'basic_alerts'
  | 'save_jobs'
  | 'view_all_content'
  | 'instant_priority_alerts'
  | 'advanced_deadline_reminders'
  | 'daily_custom_digest'
  | 'ad_free_experience';

export interface UserEntitlement {
  userId: string;
  isPremium: boolean;
  planName: string;
  allowedFeatures: Set<string>;
  subscriptionStatus: string;
  expiresAt: string | null;
}

/**
 * Evaluates real server-side entitlements for a user
 */
export async function getUserEntitlements(
  db: DbClient,
  userId: string
): Promise<UserEntitlement> {
  // Check active subscription
  const sub = await db.first<{
    status: string;
    current_period_end: string | null;
    plan_name: string;
    features_json: string;
  }>(`
    SELECT s.status, s.current_period_end, p.name as plan_name, p.features_json
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.user_id = ?
      AND s.status IN ('active', 'trialing')
      AND (s.current_period_end IS NULL OR s.current_period_end >= datetime('now'))
    ORDER BY s.created_at DESC
    LIMIT 1
  `, [userId]);

  if (sub) {
    let features: string[] = [];
    try {
      features = JSON.parse(sub.features_json);
    } catch {}

    return {
      userId,
      isPremium: true,
      planName: sub.plan_name,
      allowedFeatures: new Set(features),
      subscriptionStatus: sub.status,
      expiresAt: sub.current_period_end,
    };
  }

  // Fallback to default Free Plan
  const freePlan = await db.first<{ name: string; features_json: string }>(
    "SELECT name, features_json FROM plans WHERE slug = 'free'"
  );

  let freeFeatures = ['basic_alerts', 'save_jobs', 'view_all_content'];
  if (freePlan?.features_json) {
    try {
      freeFeatures = JSON.parse(freePlan.features_json);
    } catch {}
  }

  return {
    userId,
    isPremium: false,
    planName: freePlan?.name || 'Free Plan',
    allowedFeatures: new Set(freeFeatures),
    subscriptionStatus: 'none',
    expiresAt: null,
  };
}

/**
 * Checks whether a specific feature is permitted for a user
 */
export async function hasFeatureEntitlement(
  db: DbClient,
  userId: string,
  feature: PremiumFeature
): Promise<boolean> {
  const entitlement = await getUserEntitlements(db, userId);
  return entitlement.allowedFeatures.has(feature);
}
