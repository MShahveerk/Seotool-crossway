# Crossway SEO Tool - Comprehensive App Examination

## 1. High-Level Overview
**Crossway SEO Tool** is a Next.js-based web application designed as a dashboard for SEO analytics, website performance analysis, and Social Media Marketing (SMM) baselines.
It integrates Google Search Console analytics, Google PageSpeed Insights data, and SMM post approvals into a single platform for internal or client-facing users.

The system features robust role-based access control (RBAC), multi-site support per user, email verification workflows, automated report generation (PDF), and a robust admin dashboard for managing users and approval tasks.

## 2. Tech Stack & Dependencies
- **Framework:** Next.js (16.1.0) using the App Router.
- **Frontend UI:** React 19.2.3, Tailwind CSS (v4), Recharts (for charts), React Icons.
- **Backend Environment:** Node.js.
- **Database:** MySQL, managed via **Prisma ORM** (v6.19.2). *(Note: There's a script indicating a previous migration from MongoDB to MySQL).*
- **Authentication:** NextAuth (v4.24.10) with credentials strategy and secure JWT handling.
- **Integrations:**
  - `googleapis` (Search Console API, PageSpeed Insights API).
  - `nodemailer` (Transactional emails like resets, verifications).
  - `pdf-lib` (PDF report generation).
- **Security:** `bcryptjs` for password hashing, `crypto` for token generation.

## 3. Database Schema (`schema.prisma`)
The application relies on a relational model in MySQL with the following core entities:

1. **`User` (`users`)**
   - Stores users with standard fields (`email`, `password_hash`, `name`, `role`, `status`).
   - Supports different states via `isActive`, `emailVerified`, and `status` (`pending`, `active`).
   - Has properties linking a user to their sites (`siteLink`, `accessibleSites`) and tracking IDs (`gtmContainerId`, `facebookPageId`, `instagramUserId`).
   - Tracks audit logs (created by, timestamps).
2. **`UserAccessibleSite` (`user_accessible_sites`)**
   - Links users to multiple domains (`siteLink`), creating a Many-to-Many mapping for users viewing multiple analytics sites.
3. **`Approval` (`approvals`)**
   - Facilitates an internal SMM content approval workflow.
   - Contains fields for original admin content (`title`, `caption`, `bodyText`, `imagePath`) and assignee edits/feedback (`userEditedTitle`, `userEditedCaption`, `userEditedInstructions`).
   - Has states like `status` (pending, approved, etc.), `awaitingAdminReview`, and `skippedAssigneeReview`.
4. **`SocialMediaDailyStat` (`social_media_daily_stats`)**
   - Records daily snapshots of SMM stats per user, site, and platform (e.g., `followers`, `reach`, `engagements`, `queuedPosts`).
5. **Auth / Recovery Models**
   - `PasswordResetToken`: Secure, time-limited token generation for password resets.
   - `EmailVerificationToken`: Secure tokens to verify emails post-signup.
   - `VerificationLog`: Audit table for tracking email verification attempts.

## 4. Authentication & Security (NextAuth + Middleware)
- **NextAuth Setup:** Located in `app/api/auth/[...nextauth]/route.js`, using `CredentialsProvider`.
- **Flow:** Users authenticate using email and password. The system checks database validity, account activity (`isActive`), and email verification status.
- **JWT / Session:** Claims include role, linked sites, and GTM containers, reducing DB lookups on route changes.
- **Middleware:** `middleware.js` blocks unauthenticated access to protected routes (everything except `/login`, `/signup`, `/forgot-password`, `/reset-password`, and `/verify-email`). It enforces setting `NEXTAUTH_SECRET` in production via a styled error page if missing.

## 5. Core Features & Directory Structure
- **`app/` (Next.js App Router):**
  - **Auth Pages:** `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email` provide standard unauthenticated flows.
  - **Dashboard:** Main app lives likely in `page.jsx` or specialized dashboard components (`app/components/DashboardLayout.jsx`).
  - **API Routes (`app/api/`):** Separated by domain (`admin/`, `approvals/`, `auth/`, `dashboard/`, `health/`, `pagespeed/`, `report/`, `searchconsole/`, `smm/`).
- **`lib/` (Core Backend Logic):**
  - `auth.js` & `rbac.js`: DB queries for users, hashing, token issuance, and role checks.
  - `searchconsole.js`: Integrates `googleapis` to fetch Search Analytics (clicks, impressions, top pages/queries, countries) and site/sitemap info.
  - `pagespeed.js`: Uses Google PageSpeed API to audit a given URL.
  - `pdf.js` & `unifiedMarketingReportPdf.js`: PDF generation logic merging SEO/SMM stats.
  - `email.js`: Nodemailer wrapper.
  - `db.js` / `prisma.js`: Prisma client instantiation.
  - `env.js`: Strict startup environment variable validation (ensuring `DATABASE_URL`, `NEXTAUTH_SECRET`, etc. are present).

## 6. External API Integrations
1. **Google Search Console API:** Requires `GOOGLE_APPLICATION_CREDENTIALS_JSON`. Fetches clicks, impressions, CTR, position, and indexing statuses.
2. **Google PageSpeed API:** Requires `PAGESPEED_API_KEY`. Fetches Lighthouse metrics.
3. **Nodemailer:** Requires standard SMTP environment variables (`EMAIL_HOST`, `EMAIL_USER`, etc.) to send account management emails.
4. **GTM / Analytics Data ingestion:** A dedicated endpoint `api/smm/collect` appears to process incoming webhooks/metrics secured by `SMM_COLLECT_SECRET`.

## 7. Configuration & Deployment
- The app demands strict validation for production (`NODE_ENV=production`).
- The repository provides setup via `.env` files and `prisma` CLI.
- Scripts in `package.json` handle Next.js build and database migrations (e.g. `npm run prisma:deploy`, `node scripts/prisma-with-local-env.mjs`).
- Environment warnings actively notify if optional configurations (like GTM keys) are missing but will allow the core app to run.

---
*Generated by Jules, based on thorough codebase examination.*