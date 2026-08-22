# Sarkari Info — Official Indian Government Jobs & Results Information Platform

A fast, edge-rendered, SEO-first, Cloudflare-native portal delivering verified updates for Indian Government Jobs, Exam Results, Admit Cards, Answer Keys, Syllabi, and Recruitment Notices.

---

## 🚀 Technology Stack

* **Framework:** [Astro.js](https://astro.build/) (v5, Strict TypeScript, SSR mode)
* **Compute & Hosting:** Cloudflare Workers / Cloudflare Pages via `@astrojs/cloudflare` adapter
* **Database:** Cloudflare D1 (Serverless Distributed SQLite at the Edge)
* **Object Storage:** Cloudflare R2 (Server-side storage for notification PDFs and assets)
* **AI Engine:** DeepSeek API (Server-side structured entity extraction, fact verification, and FAQ generation)
* **Automation & Crons:** Cloudflare Cron Triggers (Scheduled multi-source crawler & alert processors)
* **Styling:** Tailwind CSS (Accessible, mobile-responsive, performant UI)
* **Security & Auth:** Web Crypto API (PBKDF2-HMAC-SHA256 password hashing, signed HMAC-SHA256 admin/user sessions)

---

## 📁 Repository Structure

```text
├── migrations/                        # D1 Database Migrations (0000 to 0006)
│   ├── 0000_initial_schema.sql        # Core D1 schema, tables & performance indexes
│   ├── 0001_seed_initial_data.sql     # Seed categories, settings & admin account
│   ├── 0002_phase2_crawler_tables.sql # Crawler tracking & crawl log tables
│   ├── 0003_phase3_ai_engine.sql      # AI generations tracking, prompt versions & content logs
│   ├── 0004_phase5_seo_and_redirects.sql # 301 redirects, SEO extended meta & landing pages
│   ├── 0005_phase6_user_accounts_and_alerts.sql # User accounts, sessions, bookmarks & alerts
│   └── 0006_phase7_monetization_analytics_and_logs.sql # Plans, subs, ads, error & audit logs
├── public/                            # Static assets & favicon
├── src/
│   ├── components/                    # UI Components (JobCard, SEO, Header, Footer, Ads, Admin)
│   ├── layouts/                       # BaseLayout, AdminLayout, AccountLayout
│   ├── lib/                           # Core business logic & services
│   │   ├── ai/                        # DeepSeek client, classifier, extractor, verifier, FAQ generator
│   │   ├── analytics/                 # Search tracker & aggregate platform stats
│   │   ├── crawler/                   # Edge crawler, HTML parser, change detector, PDF processor
│   │   ├── logging/                   # Error logging with secret masking & admin audit trail
│   │   ├── monetization/              # Ad evaluation, payment abstraction, entitlement verification
│   │   ├── notifications/             # Alert matching engine, deadline reminders & email templates
│   │   ├── seo/                       # Canonical URLs, Schema.org generators, internal link scoring
│   │   ├── auth.ts                    # Admin session cookie management
│   │   ├── crypto.ts                  # Web Crypto API hashing & token signing
│   │   ├── db.ts                      # Unified Cloudflare D1 database client
│   │   ├── r2.ts                      # Cloudflare R2 storage client & safe key generator
│   │   ├── settings.ts                # Global settings & feature flags loader
│   │   ├── system_health.ts           # System diagnostic engine
│   │   ├── types.ts                   # Domain & database TypeScript interfaces
│   │   ├── user_auth.ts               # Candidate account authentication & sessions
│   │   └── utils.ts                   # Formatting, slugify, and helper utilities
│   ├── middleware.ts                  # Server-side auth, redirects & maintenance mode guard
│   ├── pages/                         # Public routes, Account dashboard, Admin CMS & Internal API
│   │   ├── account/                   # Candidate account portal
│   │   ├── admin/                     # Admin CMS control panel & settings
│   │   ├── api/                       # Internal server-side API endpoints & cron triggers
│   │   └── ...                        # Public category, job, exam, search & static pages
│   └── styles/                        # Tailwind CSS global stylesheet
├── tests/                             # Automated end-to-end integration test suites (Phases 1–7)
├── .env.example                       # Environment configuration template (Placeholders only)
├── .gitignore                         # Comprehensive Git ignore rules
├── astro.config.mjs                   # Astro configuration with Cloudflare adapter
├── package.json                       # Scripts and dependencies
├── tsconfig.json                      # Strict TypeScript compiler options
├── wrangler.toml                      # Cloudflare Workers, D1, R2 and Cron configuration
└── DEPLOYMENT.md                      # Production deployment guidelines
```

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` for local development. **Never commit real credentials to version control.**

| Variable | Description | Type |
|---|---|---|
| `ADMIN_JWT_SECRET` | Cryptographic secret for HMAC session signing (Min 32 chars) | Required |
| `DEEPSEEK_API_KEY` | DeepSeek API key for entity extraction and content verification | Required |
| `DEEPSEEK_MODEL` | DeepSeek model name (`deepseek-chat`) | Optional |
| `DEEPSEEK_BASE_URL` | DeepSeek API base URL endpoint | Optional |
| `EMAIL_PROVIDER` | Transactional email driver (`resend`, `sendgrid`, `postmark`, `mock`) | Optional |
| `EMAIL_API_KEY` | Transactional email provider API key | Optional |
| `EMAIL_FROM_ADDRESS` | Sender email address for notification alerts | Optional |
| `ADS_ENABLED` | Toggle display advertising (`true` / `false`) | Optional |
| `ADS_PROVIDER` | Advertising network (`google_adsense`, `custom`, `none`) | Optional |
| `ADS_PUBLISHER_ID` | Publisher ID for ad tags | Optional |
| `SITE_URL` | Canonical portal URL (e.g. `https://sarkariinfo.in`) | Required |

---

## 🛠️ Local Setup & Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your local development keys
```

### 3. Apply Local D1 Database Migrations
```bash
npm run d1:local:migrate
```

### 4. Start Local Development Server
```bash
npm run dev
```

The portal will be available at `http://localhost:4321`.

---

## 🧪 Testing & Verification

Run the full automated Phase 1–7 integration test suite:

```bash
npm test
```

To run individual phase test suites:

```bash
npm run test:phase1    # Database, Schema & Admin Foundation
npm run test:phase2    # Edge Crawler, Parser & Document Engine
npm run test:phase3    # DeepSeek AI Engine & Factual Verification
npm run test:phase4    # Public Website & Search Verification
npm run test:phase5    # SEO, Structured Data & Redirects
npm run test:phase6    # User Accounts, Bookmarks & Alerts
npm run test:phase7    # Monetization, Analytics, Logs & Health
```

---

## 🏗️ Type-Checking & Production Build

Perform full TypeScript diagnostic check:

```bash
npm run check
```

Compile for Cloudflare Workers / Pages production:

```bash
npm run build
```

---

## ☁️ Cloudflare Infrastructure Requirements

The production deployment requires the following Cloudflare bindings configured in `wrangler.toml` and the Cloudflare Dashboard:

* **Cloudflare D1:** Binding `DB` attached to your production D1 database.
* **Cloudflare R2:** Binding `R2` attached to your production document storage bucket.
* **Cloudflare Workers / Pages:** Edge SSR runtime with `nodejs_compat` enabled.
* **Cloudflare Cron Triggers:** Configured schedule (`*/15 * * * *`) invoking `/api/cron/crawl` and `/api/cron/process-alerts`.
* **Cloudflare Secrets:** Set via `wrangler secret put <KEY>`:
  * `ADMIN_JWT_SECRET`
  * `DEEPSEEK_API_KEY`
  * `EMAIL_API_KEY` (if transactional email provider enabled)

See [DEPLOYMENT.md](DEPLOYMENT.md) for full step-by-step production deployment instructions.
