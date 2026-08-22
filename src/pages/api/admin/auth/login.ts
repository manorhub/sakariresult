// src/pages/api/admin/auth/login.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { verifyPassword } from '../../../../lib/crypto';
import { createAdminSession } from '../../../../lib/auth';
import type { AdminUser } from '../../../../lib/types';

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  try {
    const contentType = request.headers.get('content-type') || '';
    let email = '';
    let password = '';

    if (contentType.includes('application/json')) {
      const body = (await request.json()) as any;
      email = body.email?.trim()?.toLowerCase();
      password = body.password || '';
    } else {
      const formData = await request.formData();
      email = (formData.get('email') as string)?.trim()?.toLowerCase();
      password = (formData.get('password') as string) || '';
    }

    if (!email || !password) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email and password are required.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const d1 = (locals as any)?.runtime?.env?.DB;
    const db = getDb(d1);

    const admin = await db.first<AdminUser>(
      'SELECT * FROM admins WHERE email = ?',
      [email]
    );

    if (!admin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid email or password.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (admin.status !== 'active') {
      return new Response(
        JSON.stringify({ success: false, error: 'Account is deactivated. Please contact support.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const isValid = await verifyPassword(password, admin.salt, admin.password_hash);
    if (!isValid) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid email or password.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const secret = (locals as any)?.runtime?.env?.ADMIN_JWT_SECRET 
      || import.meta.env.ADMIN_JWT_SECRET 
      || 'sarkari-portal-default-dev-secret-key-32chars!';

    await createAdminSession(admin, cookies, secret);

    // Update last_login_at timestamp
    await db.run(
      'UPDATE admins SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [admin.id]
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Authentication successful',
        data: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
        }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Login error:', err);
    return new Response(
      JSON.stringify({ success: false, error: 'An unexpected server error occurred.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
