// src/lib/monetization/payments.ts
// Abstracted Server-Side Payment Gateway Adapter with Webhook Idempotency

import type { DbClient } from '../db.ts';

export interface PaymentProviderConfig {
  provider: 'razorpay' | 'stripe' | 'cashfree' | 'none';
  keyId?: string;
  keySecret?: string;
  webhookSecret?: string;
  enabled: boolean;
}

export interface CreateCheckoutOptions {
  userId: string;
  userEmail: string;
  planId: string;
  amount: number;
  currency: string;
  redirectUrl: string;
}

export interface CheckoutResult {
  success: boolean;
  checkoutUrl?: string;
  sessionId?: string;
  error?: string;
}

export interface WebhookProcessingResult {
  success: boolean;
  processed: boolean;
  duplicate: boolean;
  eventId?: string;
  error?: string;
}

export class PaymentService {
  private config: PaymentProviderConfig;

  constructor(config?: Partial<PaymentProviderConfig>) {
    this.config = {
      provider: config?.provider || 'none',
      keyId: config?.keyId,
      keySecret: config?.keySecret,
      webhookSecret: config?.webhookSecret,
      enabled: config?.enabled ?? false,
    };
  }

  /**
   * Generates a checkout session for subscription plans
   */
  async createCheckoutSession(options: CreateCheckoutOptions): Promise<CheckoutResult> {
    if (!this.config.enabled || this.config.provider === 'none') {
      return {
        success: false,
        error: 'Payment system is not configured. Free access is active for all candidates.',
      };
    }

    try {
      // Mock / Real adapter routing
      const sessionId = `chk_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
      return {
        success: true,
        sessionId,
        checkoutUrl: `${options.redirectUrl}?session_id=${sessionId}`,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Payment initiation failed.' };
    }
  }

  /**
   * Verifies webhook signature using Web Crypto HMAC
   */
  async verifyWebhookSignature(payloadText: string, signature: string): Promise<boolean> {
    if (!this.config.webhookSecret || !signature) return false;

    try {
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        enc.encode(this.config.webhookSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );

      const computedSig = await crypto.subtle.sign('HMAC', key, enc.encode(payloadText));
      const hexSig = Array.from(new Uint8Array(computedSig), b => b.toString(16).padStart(2, '0')).join('');

      return hexSig.toLowerCase() === signature.toLowerCase();
    } catch {
      return false;
    }
  }

  /**
   * Processes webhook events with duplicate defense via payment_webhook_events
   */
  async handleWebhookEvent(
    db: DbClient,
    eventId: string,
    eventType: string,
    payload: any
  ): Promise<WebhookProcessingResult> {
    if (!eventId) {
      return { success: false, processed: false, duplicate: false, error: 'Missing eventId' };
    }

    // Check duplicate event idempotency
    const existing = await db.first<{ id: string; processed: number }>(
      'SELECT id, processed FROM payment_webhook_events WHERE event_id = ?',
      [eventId]
    );

    if (existing) {
      return { success: true, processed: true, duplicate: true, eventId };
    }

    const id = `pwe_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    await db.run(`
      INSERT INTO payment_webhook_events (id, provider, event_id, event_type, processed, processed_at, created_at)
      VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `, [id, this.config.provider, eventId, eventType]);

    // Handle subscription lifecycle events
    if (eventType === 'subscription.created' || eventType === 'payment.succeeded') {
      const userId = payload?.userId;
      const planId = payload?.planId || 'plan_premium';

      if (userId) {
        const subId = `sub_${Date.now().toString(36)}`;
        await db.run(`
          INSERT INTO subscriptions (id, user_id, plan_id, provider, provider_subscription_id, status, current_period_start, current_period_end, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now', '+30 days'), datetime('now'), datetime('now'))
          ON CONFLICT(id) DO UPDATE SET status = 'active', updated_at = datetime('now')
        `, [subId, userId, planId, this.config.provider, eventId]);
      }
    } else if (eventType === 'subscription.cancelled') {
      const subId = payload?.subscriptionId;
      if (subId) {
        await db.run(
          "UPDATE subscriptions SET status = 'cancelled', updated_at = datetime('now') WHERE provider_subscription_id = ?",
          [subId]
        );
      }
    }

    return { success: true, processed: true, duplicate: false, eventId };
  }
}
