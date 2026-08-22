// src/middleware.ts
// Middleware for Admin & User Authentication, Session Verification, Maintenance Mode & Dynamic Redirects

import { defineMiddleware } from 'astro:middleware';
import { getAdminSession } from './lib/auth.ts';
import { getUserSession } from './lib/user_auth.ts';
import { getDb } from './lib/db.ts';
import { getSiteSettings } from './lib/settings.ts';
import type { RedirectRecord } from './lib/seo/types.ts';

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies, redirect, locals } = context;
  const pathname = url.pathname;
  const d1 = (locals as any)?.runtime?.env?.DB;

  // 1. Dynamic 301/302 URL Redirects from D1 (for public routes)
  if (!pathname.startsWith('/admin') && !pathname.startsWith('/api') && !pathname.startsWith('/_astro') && pathname !== '/maintenance') {
    try {
      if (d1) {
        const db = getDb(d1);
        const cleanPath = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

        const match = await db.first<RedirectRecord>(
          'SELECT * FROM redirects WHERE (source_path = ? OR source_path = ?) AND active = 1',
          [pathname, cleanPath]
        );

        if (match && match.destination_path && match.destination_path !== pathname && match.destination_path !== cleanPath) {
          db.run(
            "UPDATE redirects SET hit_count = hit_count + 1, last_accessed_at = datetime('now') WHERE id = ?",
            [match.id]
          ).catch(() => {});

          const statusCode = (match.status_code === 302 ? 302 : 301) as 301 | 302;
          return redirect(match.destination_path, statusCode);
        }
      }
    } catch {}
  }

  // 2. Admin Authentication & Session Handling
  const secret = (context.locals as any)?.runtime?.env?.ADMIN_JWT_SECRET 
    || import.meta.env.ADMIN_JWT_SECRET 
    || 'sarkari-portal-default-dev-secret-key-32chars!';

  const isAdminRoute = pathname.startsWith('/admin');
  const isAdminApiRoute = pathname.startsWith('/api/admin');
  const isAdminLoginPage = pathname === '/admin/login' || pathname === '/admin/login/';
  const isAdminLoginApi = pathname === '/api/admin/auth/login';

  const adminSession = await getAdminSession(cookies, secret);
  (locals as any).adminSession = adminSession;

  if (isAdminRoute && !isAdminLoginPage) {
    if (!adminSession) {
      return redirect('/admin/login');
    }
  }

  if (isAdminLoginPage && adminSession) {
    return redirect('/admin/dashboard');
  }

  if (isAdminApiRoute && !isAdminLoginApi) {
    if (!adminSession) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized. Admin session required.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // 3. Maintenance Mode Check (Public routes blocked if active; admin, cron, static assets bypass)
  if (!isAdminRoute && !isAdminApiRoute && !pathname.startsWith('/api/cron') && !pathname.startsWith('/_astro') && pathname !== '/maintenance') {
    try {
      if (d1) {
        const db = getDb(d1);
        const siteSettings = await getSiteSettings(db);
        (locals as any).siteSettings = siteSettings;

        if (siteSettings.maintenanceMode && !adminSession) {
          return redirect('/maintenance');
        }
      }
    } catch {}
  }

  // 4. Public User Authentication & Account Protection
  const userSessionToken = cookies.get('user_session')?.value;
  let userSession = null;

  if (userSessionToken && d1) {
    try {
      const db = getDb(d1);
      userSession = await getUserSession(db, userSessionToken);
    } catch {}
  }
  (locals as any).userSession = userSession;

  const isAccountRoute = pathname.startsWith('/account');
  const isUserAuthPage = pathname === '/login' || pathname === '/register';

  if (isAccountRoute && !userSession) {
    return redirect(`/login?redirect=${encodeURIComponent(pathname)}`);
  }

  if (isUserAuthPage && userSession) {
    return redirect('/account');
  }

  return next();
});
