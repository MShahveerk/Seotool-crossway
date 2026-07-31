# Production deployment

## Prerequisites

- **Node.js 20+** (matches Next.js 16)
- **MySQL 8+** (or compatible) reachable from the app host
- Environment variables from **`.env.example`** (copy to `.env.local` locally; use your host’s secret store in production)

## Build

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
npm run start
```

- **`prisma migrate deploy`**: applies migrations on the production database (use `prisma migrate dev` only on developer machines).
- **`postinstall`** runs `prisma generate` automatically after `npm ci` / `npm install`.

## Environment variables (production)

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | MySQL connection string |
| `NEXTAUTH_SECRET` | Yes | ≥32 random chars (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Yes | Public URL, e.g. `https://app.example.com` |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Recommended | Service account JSON path or value for Search Console |
| `SMM_COLLECT_SECRET` | **Yes** for GTM | If unset, `/api/smm/collect` returns **503** in production |
| `PAGESPEED_API_KEY` | Optional | PageSpeed features if empty |
| SMTP vars | Optional | Email flows |

Startup runs **`validateEnv()`** via `instrumentation.js` when the Node server starts. Missing required vars **fail the process** in production.

## Security checklist

- Never commit **`.env.local`**, **`credentials/*.json`**, or API tokens.
- Rotate any key that was pasted into chat or committed by mistake.
- Use HTTPS and set `NEXTAUTH_URL` to the HTTPS public URL.
- Configure `SMM_COLLECT_SECRET` before sending GTM traffic to `/api/smm/collect`.

## Docker (optional)

Set `DOCKER_BUILD=1` when building so `next.config.js` uses `output: "standalone"`:

```bash
set DOCKER_BUILD=1
npm run build
```

Run the server from `.next/standalone` per [Next.js standalone output](https://nextjs.org/docs/app/building-your-application/deploying#docker-image).

## Persistent media (`/var/data`)

Post and blog images are **not** stored in the git/deploy tree. On production they go to:

```text
/var/data/uploads/approvals   # SMM posts
/var/data/uploads/blogs       # blog featured images
```

Served via `/api/uploads/<filename>` (looks on the persistent disk first).

1. Attach a persistent disk / volume and mount it at **`/var/data`** (or set `UPLOADS_ROOT` to that mount).
2. Ensure the Node process user can write there, e.g.:
   ```bash
   sudo mkdir -p /var/data/uploads/approvals /var/data/uploads/blogs
   sudo chown -R <app-user>:<app-group> /var/data
   ```
3. Optional env (recommended so the path is explicit):
   ```bash
   UPLOADS_ROOT=/var/data
   ```
4. Restart the app — startup creates the subdirs and **fails in production** if the disk is not writable (so you never silently fall back to wipeable `public/uploads`).

Local/dev without `/var/data` still uses `public/uploads/` under the project.

## Health check

`GET /api/health` — returns JSON with DB connectivity (intended for load balancers / uptime checks).

## Vercel / managed hosts

1. Add all env vars in the project dashboard (Production + Preview as needed).
2. Run **`prisma migrate deploy`** in a release step or use a migration service; some teams run migrations from CI before deploy.
3. Ensure **`NEXTAUTH_URL`** matches the deployment URL (including `https://`).

## Troubleshooting

- **Prisma / DB errors**: confirm `DATABASE_URL` and that migrations ran (`migrate deploy`).
- **Login / session issues**: `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, and HTTPS.
- **Infinite loading after `npm run start` on `http://localhost`**: ensure `NEXTAUTH_URL` matches the URL you open (e.g. `http://localhost:3000`). Cookies are only `Secure` when `NEXTAUTH_URL` starts with `https://` — so local HTTP production builds still get working session cookies.
- **SMM collect 503**: set `SMM_COLLECT_SECRET` in production.
- **Meta / Instagram**: refresh **Page access tokens** before expiry; use Instagram Graph API + Instagram User ID (see app docs).
