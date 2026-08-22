# Sarkari Info — Production Deployment Guide

This guide outlines the complete 10-step procedure for deploying the **Sarkari Info** portal to Cloudflare Workers / Cloudflare Pages.

---

## 1. GitHub Repository Preparation

1. Verify that all local tests and type-checks pass (`npm test`, `npm run check`, `npm run build`).
2. Ensure `.gitignore` excludes `.env`, `node_modules/`, `dist/`, `.wrangler/`, and all temporary files.
3. Push the clean source code to your repository:
   ```bash
   git add .
   git commit -m "Initial production-ready release"
   git branch -M main
   git remote add origin https://github.com/<your-org-or-user>/<repo-name>.git
   git push -u origin main
   ```
4. Set repository visibility to **Private** (recommended for proprietary production codebase).

---

## 2. Cloudflare Project Connection

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
3. Select your repository and configure the build settings:
   * **Framework preset:** `Astro`
   * **Build command:** `npm run build`
   * **Build output directory:** `dist`
   * **Root directory:** `/`
   * **Compatibility flag:** `nodejs_compat`
   * **Compatibility date:** `2024-09-23` (or latest)

---

## 3. D1 Database Setup

1. Create a new Cloudflare D1 database:
   ```bash
   npx wrangler d1 create sarkari-portal-db
   ```
2. Note the generated `database_id` (UUID).
3. In `wrangler.toml`, ensure the binding is configured:
   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "sarkari-portal-db"
   database_id = "<YOUR_D1_DATABASE_UUID>"
   migrations_dir = "./migrations"
   ```
4. In Cloudflare Dashboard, bind the D1 database `DB` to your Pages project under **Settings** > **Functions** > **D1 database bindings**.

---

## 4. D1 Database Migrations

Apply all ordered migration files to the remote production database:

```bash
npx wrangler d1 execute DB --remote --file=./migrations/0000_initial_schema.sql
npx wrangler d1 execute DB --remote --file=./migrations/0001_seed_initial_data.sql
npx wrangler d1 execute DB --remote --file=./migrations/0002_phase2_crawler_tables.sql
npx wrangler d1 execute DB --remote --file=./migrations/0003_phase3_ai_engine.sql
npx wrangler d1 execute DB --remote --file=./migrations/0004_phase5_seo_and_redirects.sql
npx wrangler d1 execute DB --remote --file=./migrations/0005_phase6_user_accounts_and_alerts.sql
npx wrangler d1 execute DB --remote --file=./migrations/0006_phase7_monetization_analytics_and_logs.sql
```

*(Alternatively, use the convenience npm script: `npm run d1:remote:migrate`)*

---

## 5. Cloudflare R2 Bucket Setup

1. Create a production R2 bucket for notification PDFs and official documents:
   ```bash
   npx wrangler r2 bucket create sarkari-portal-storage
   ```
2. In `wrangler.toml`, verify the R2 binding:
   ```toml
   [[r2_buckets]]
   binding = "R2"
   bucket_name = "sarkari-portal-storage"
   ```
3. In Cloudflare Dashboard, bind the R2 bucket `R2` to your project under **Settings** > **Functions** > **R2 bucket bindings**.

---

## 6. Environment Variables Configuration

Set standard environment variables in the Cloudflare Dashboard under **Settings** > **Environment variables**:

* `SITE_URL`: `https://yourdomain.in` (e.g. `https://sarkariinfo.in`)
* `SITE_NAME`: `Sarkari Info`
* `DEFAULT_CURRENCY`: `INR`
* `DEFAULT_LANGUAGE`: `en`
* `ADS_ENABLED`: `true`
* `ADS_PROVIDER`: `google_adsense`
* `ADS_PUBLISHER_ID`: `ca-pub-XXXXXXXXXXXXXXXX`

---

## 7. Cloudflare Production Secrets

Add sensitive credentials as encrypted secrets (never stored in source code):

```bash
# 1. Admin HMAC Session Secret (Min 32 characters random string)
npx wrangler secret put ADMIN_JWT_SECRET

# 2. DeepSeek AI API Key
npx wrangler secret put DEEPSEEK_API_KEY

# 3. Transactional Email API Key (e.g., Resend, SendGrid, Postmark)
npx wrangler secret put EMAIL_API_KEY
```

---

## 8. Cron Triggers Configuration

Cloudflare Cron Triggers automatically execute the edge crawler and notification dispatcher every 15 minutes.

Verify `wrangler.toml`:
```toml
[triggers]
crons = ["*/15 * * * *"]
```

The trigger invokes:
* `/api/cron/crawl` — Crawls active official recruitment sources
* `/api/cron/process-alerts` — Matches newly published items to candidate alerts & sends digests

---

## 9. Custom Domain & DNS Setup

1. In Cloudflare Dashboard, navigate to **Workers & Pages** > Your Project > **Custom domains**.
2. Click **Set up a custom domain** and enter your domain (e.g., `sarkariinfo.in` and `www.sarkariinfo.in`).
3. Cloudflare will automatically route DNS and provision an Edge SSL/TLS certificate.

---

## 10. Production Smoke Test Checklist

After deployment, perform these verification checks:

1. **Homepage:** Visit `https://yourdomain.in` — verify fast edge render, CSS styles, and header navigation.
2. **Category Pages:** Verify `/jobs`, `/results`, `/admit-card`, `/answer-key` render correctly.
3. **Admin CMS Login:** Access `/admin/login` and verify secure authentication with your admin credentials.
4. **Admin Dashboard:** Check `/admin/dashboard` metrics and `/admin/settings/ai` configuration.
5. **AI Extraction Test:** Run a test extraction from the Admin AI Panel to verify DeepSeek API connectivity.
6. **Crawler Verification:** Run a manual trigger from `/admin/sources` to confirm D1 and R2 operations.
7. **SEO & Sitemaps:** Visit `/sitemap-index.xml` and `/robots.txt` to verify search engine indexing readiness.
8. **Candidate Account Flow:** Register a test candidate account at `/register`, verify login and bookmarking.
9. **System Health:** Visit `/admin/logs` to verify system health diagnostics and zero unhandled errors.
