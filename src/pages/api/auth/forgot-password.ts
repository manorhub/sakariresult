// src/pages/api/auth/forgot-password.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db.ts';
import { createPasswordResetToken } from '../../../lib/user_auth.ts';
import { EmailService } from '../../../lib/email/provider.ts';
import { buildPasswordResetEmail } from '../../../lib/email/templates.ts';

export const POST: APIRoute = async ({ request, locals, url, site }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const body = (await request.json()) as any;
    const { email } = body;

    if (!email) {
      return new Response(JSON.stringify({ success: false, error: 'Email is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { rawToken, user } = await createPasswordResetToken(db, email);

    // If user found, send reset email
    if (rawToken && user) {
      const baseOrigin = (site ? site.toString() : url.origin).replace(/\/+$/, '');
      const resetUrl = `${baseOrigin}/reset-password?token=${rawToken}`;
      const emailTmpl = buildPasswordResetEmail({ name: user.name, resetUrl });

      const emailService = new EmailService();
      emailService.sendEmail({
        to: { email: user.email, name: user.name },
        subject: emailTmpl.subject,
        html: emailTmpl.html,
        text: emailTmpl.text,
      }).catch(() => {});
    }

    // Security rule: Always respond with success to avoid email enumeration
    return new Response(JSON.stringify({
      success: true,
      message: 'If an account exists with this email, a password reset link has been dispatched.',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Password reset request failed.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
