// src/lib/email/provider.ts
// Server-Side Abstracted Transactional Email Provider Adapter

import type { EmailProviderConfig, SendEmailPayload, SendEmailResult } from './types.ts';

export class EmailService {
  private config: EmailProviderConfig;

  constructor(config?: Partial<EmailProviderConfig>) {
    this.config = {
      provider: config?.provider || 'mock',
      apiKey: config?.apiKey,
      fromEmail: config?.fromEmail || 'alerts@sarkariinfo.in',
      fromName: config?.fromName || 'Sarkari Info Alerts',
      webhookUrl: config?.webhookUrl,
      enabled: config?.enabled ?? true,
    };
  }

  /**
   * Dispatches email using the configured backend provider
   */
  async sendEmail(payload: SendEmailPayload): Promise<SendEmailResult> {
    if (!this.config.enabled) {
      return { success: true, messageId: 'mock_disabled' };
    }

    const recipientEmail = typeof payload.to === 'string' ? payload.to : payload.to.email;
    const recipientName = typeof payload.to === 'string' ? undefined : payload.to.name;

    try {
      switch (this.config.provider) {
        case 'resend':
          return await this.sendViaResend(recipientEmail, payload);
        case 'sendgrid':
          return await this.sendViaSendGrid(recipientEmail, recipientName, payload);
        case 'postmark':
          return await this.sendViaPostmark(recipientEmail, payload);
        case 'webhook':
          return await this.sendViaWebhook(recipientEmail, payload);
        case 'mock':
        default:
          return this.sendViaMock(recipientEmail, payload);
      }
    } catch (err: any) {
      console.error(`[EmailService Error] Failed to dispatch email to ${recipientEmail}:`, err?.message);
      return { success: false, error: err?.message || 'Email delivery failed' };
    }
  }

  private async sendViaResend(to: string, payload: SendEmailPayload): Promise<SendEmailResult> {
    if (!this.config.apiKey) throw new Error('Resend API key is missing.');

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${this.config.fromName} <${this.config.fromEmail}>`,
        to: [to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
    });

    const data = (await res.json()) as any;
    if (!res.ok) throw new Error(data.message || `Resend HTTP error ${res.status}`);
    return { success: true, messageId: data.id };
  }

  private async sendViaSendGrid(to: string, name: string | undefined, payload: SendEmailPayload): Promise<SendEmailResult> {
    if (!this.config.apiKey) throw new Error('SendGrid API key is missing.');

    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to, name }] }],
        from: { email: this.config.fromEmail, name: this.config.fromName },
        subject: payload.subject,
        content: [
          ...(payload.text ? [{ type: 'text/plain', value: payload.text }] : []),
          { type: 'text/html', value: payload.html },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`SendGrid HTTP error ${res.status}: ${errText}`);
    }
    return { success: true, messageId: res.headers.get('x-message-id') || 'sendgrid_sent' };
  }

  private async sendViaPostmark(to: string, payload: SendEmailPayload): Promise<SendEmailResult> {
    if (!this.config.apiKey) throw new Error('Postmark Server Token is missing.');

    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'X-Postmark-Server-Token': this.config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        From: `${this.config.fromName} <${this.config.fromEmail}>`,
        To: to,
        Subject: payload.subject,
        HtmlBody: payload.html,
        TextBody: payload.text,
      }),
    });

    const data = (await res.json()) as any;
    if (!res.ok) throw new Error(data.Message || `Postmark HTTP error ${res.status}`);
    return { success: true, messageId: data.MessageID };
  }

  private async sendViaWebhook(to: string, payload: SendEmailPayload): Promise<SendEmailResult> {
    if (!this.config.webhookUrl) throw new Error('Email webhook URL is missing.');

    const res = await fetch(this.config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, recipient: to }),
    });

    if (!res.ok) throw new Error(`Webhook error ${res.status}`);
    return { success: true, messageId: 'webhook_delivered' };
  }

  private sendViaMock(to: string, payload: SendEmailPayload): SendEmailResult {
    console.log(`[Email Mock Log] To: ${to} | Subject: "${payload.subject}"`);
    return { success: true, messageId: `mock_${Date.now()}` };
  }
}
