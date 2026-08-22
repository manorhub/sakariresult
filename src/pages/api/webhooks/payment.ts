// src/pages/api/webhooks/payment.ts
// Payment Gateway Webhook Receiver with Signature Verification & Idempotency

import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db.ts';
import { PaymentService } from '../../../lib/monetization/payments.ts';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    if (!d1) return new Response(JSON.stringify({ success: false, error: 'Database unavailable' }), { status: 500 });

    const db = getDb(d1);
    const signature = request.headers.get('x-webhook-signature') || request.headers.get('stripe-signature') || '';
    const bodyText = await request.text();

    const paymentService = new PaymentService({ enabled: false });

    // Validate webhook signature if secret configured
    if (signature) {
      const isValid = await paymentService.verifyWebhookSignature(bodyText, signature);
      if (!isValid) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid webhook signature' }), { status: 401 });
      }
    }

    let payload: any = {};
    try {
      payload = JSON.parse(bodyText);
    } catch {
      return new Response(JSON.stringify({ success: false, error: 'Invalid JSON payload' }), { status: 400 });
    }

    const eventId = payload.id || payload.event_id || `evt_${Date.now()}`;
    const eventType = payload.type || payload.event || 'payment.event';

    const result = await paymentService.handleWebhookEvent(db, eventId, eventType, payload);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message }), { status: 500 });
  }
};
