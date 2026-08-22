// src/pages/api/admin/auth/logout.ts
import type { APIRoute } from 'astro';
import { clearAdminSession } from '../../../../lib/auth';

export const POST: APIRoute = async ({ cookies }) => {
  clearAdminSession(cookies);
  return new Response(JSON.stringify({ success: true, message: 'Logged out successfully' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const GET: APIRoute = async ({ cookies, redirect }) => {
  clearAdminSession(cookies);
  return redirect('/admin/login');
};
