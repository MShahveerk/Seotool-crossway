# Crossway SEO Tool

Next.js dashboard for Search Console–style analytics, PageSpeed, and SMM baselines (MySQL + Prisma + NextAuth).

## Local development

```bash
npm install
cp .env.example .env.local
# Edit .env.local — DATABASE_URL, NEXTAUTH_*, etc.
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production

See **[RENDER_DEPLOYMENT.md](./RENDER_DEPLOYMENT.md)** for instructions on how to seamlessly deploy the Web Application and the Background Publishing Scheduler to Render using the included Blueprint (`render.yaml`).

Alternatively, see **[DEPLOYMENT.md](./DEPLOYMENT.md)** for manual server configurations, `prisma migrate deploy`, Docker/standalone build, and security notes.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Run production server (after `build`) |
| `npm run prisma:deploy` | Apply DB migrations (production) |
