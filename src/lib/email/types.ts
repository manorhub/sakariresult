// src/lib/email/types.ts
// Transactional Email Service Interface & Types

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface SendEmailPayload {
  to: string | EmailRecipient;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
}

export interface EmailProviderConfig {
  provider: 'resend' | 'sendgrid' | 'postmark' | 'webhook' | 'mock';
  apiKey?: string;
  fromEmail: string;
  fromName: string;
  webhookUrl?: string;
  enabled: boolean;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}
