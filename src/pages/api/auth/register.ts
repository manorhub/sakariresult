// src/pages/api/auth/register.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db.ts';
import { registerUser } from '../../../lib/user_auth.ts';
import { EmailService } from '../../../lib/email/provider.ts';
import { buildVerificationEmail } from '../../../lib/email/templates.ts';

export const POST: APIRoute = async ({ request, locals, url, site }) => {
  try {
    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const body = (await request.json()) as any;
    const { name, email, password, confirmPassword } = body;

    if (!name || !email || !password) {
      return new Response(JSON.stringify({ success: false, error: 'Name, email, and password are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (password !== confirmPassword) {
      return new Response(JSON.stringify({ success: false, error: 'Passwords do not match.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { user, verificationToken } = await registerUser(db, { name, email, password });

    // Send verification email
    const baseOrigin = (site ? site.toString() : url.origin).replace(/\/+$/, '');
    const verifyUrl = `${baseOrigin}/verify-email?token=${verificationToken}`;
    const emailTmpl = buildVerificationEmail({ name: user.name, verifyUrl });

    const emailService = new EmailService();
    emailService.sendEmail({
      to: { email: user.email, name: user.name },
      subject: emailTmpl.subject,
      html: emailTmpl.html,
      text: emailTmpl.text,
    }).catch(() => {});

    return new Response(JSON.stringify({
      success: true,
      message: 'Account created successfully. Please check your email to verify your account.',
      userId: user.id,
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Registration failed.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
