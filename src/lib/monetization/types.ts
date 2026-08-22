// src/lib/monetization/types.ts
// Monetization, Subscriptions, Payments & Revenue Interfaces

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'cancelled' | 'expired' | 'incomplete';
export type RevenueType = 'advertising' | 'subscription' | 'sponsored';

export interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  currency: string;
  billing_interval: 'monthly' | 'yearly' | 'lifetime';
  features_json: string; // JSON array of feature slugs
  active: number;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  provider: string;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: number;
  created_at: string;
  updated_at: string;
  // joined fields
  plan_name?: string;
  plan_slug?: string;
  features?: string[];
}

export interface RevenueRecord {
  id: string;
  revenue_type: RevenueType;
  amount: number;
  currency: string;
  source: string;
  period_start: string;
  period_end: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SponsoredListing {
  id: string;
  title: string;
  sponsor_name: string;
  sponsor_url: string;
  sponsored_start: string;
  sponsored_end: string;
  sponsored_status: 'active' | 'paused' | 'expired';
}
