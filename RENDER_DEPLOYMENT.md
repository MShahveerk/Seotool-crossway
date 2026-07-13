# Deploying Crossway SEO Tool to Render

This repository includes a `render.yaml` Blueprint file, making it incredibly easy to deploy the entire stack—including the Next.js web application and the background SMM publishing scheduler—to [Render.com](https://render.com).

## Infrastructure Overview

When you deploy this application, Render will create **three** components:
1. **MySQL Database:** To store your users, approvals, and metrics.
2. **Web Service (`crossway-web`):** The main Next.js frontend and API routes.
3. **Background Worker (`crossway-scheduler`):** A standalone Node.js process that polls the database every minute to automatically publish scheduled posts to Meta (Facebook/Instagram).

## Step-by-Step Deployment Guide

### 1. Set Up the Database
Before deploying the application, you need a PostgreSQL database.
You can instantly deploy a managed PostgreSQL instance directly from the Render Dashboard by clicking **New > PostgreSQL**.
> *Note: Copy the "Internal Database URL" (if deploying the web app in the same region) or the "External Database URL" connection string provided by Render. You will need it in Step 2.*

### 2. Deploy the Blueprint
1. Log in to your [Render Dashboard](https://dashboard.render.com/).
2. Go to **Blueprints** and click **New Blueprint Instance**.
3. Connect your GitHub repository containing this codebase.
4. Render will read the `render.yaml` file and prompt you to fill in any environment variables that have `sync: false`.

### 3. Configure Environment Variables
In the Render dashboard, you will be asked to provide values for the following environment variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | The PostgreSQL connection string from Step 1. Ensure it looks like `postgres://user:pass@host:5432/db`. **This must be identical for both the Web Service and the Worker.** |
| `META_PAGE_ACCESS_TOKEN` | Your Facebook/Meta Graph API token. Required for the background worker to publish scheduled posts. |
| `META_APP_ACCESS_TOKEN` | Secondary Meta token (if applicable). |

*Note: Render will automatically generate secure strings for `NEXTAUTH_SECRET` and `SMM_COLLECT_SECRET` based on the blueprint rules.*

### 4. Initialize Database and Create Admin User
Once the web service finishes building, you need to push the Prisma schema to your new database to create the tables, and then seed the initial admin account.
*(If you are seeing a `DATABASE_UNAVAILABLE` or `Invalid `prisma.user.findFirst()`... relation does not exist` error, it is because you have not run these commands yet!)*

1. In the Render Dashboard, go to your **crossway-web** service.
2. Click on the **Shell** tab on the left sidebar.
3. Run the following command to create the database tables:
   ```bash
   npx prisma@6 db push
   ```
4. Next, run the following command to generate the default Super Admin user:
   ```bash
   npx prisma@6 db seed
   ```
5. The shell will output the default Admin Email (`admin@crossway.com`) and Password (`Admin123!`). You can now log into your live application!

### 5. Final Configuration Checklist
- **OAuth / Google Cloud:** If you are using Google Search Console or PageSpeed Insights, ensure you go to the **Environment** tab of the `crossway-web` service and add your `PAGESPEED_API_KEY` and `GOOGLE_APPLICATION_CREDENTIALS_JSON`.
- **SMTP Settings:** To enable email sending (password resets, invitations), add your `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` variables to the web service environment.
- **Instagram Publishing:** Instagram requires images to be hosted on publicly accessible URLs. The background scheduler uses the `NEXTAUTH_URL` variable to format absolute image links. Ensure `NEXTAUTH_URL` exactly matches your Render deployment URL (e.g., `https://crossway-web.onrender.com`).

### Monitoring the Scheduler
To verify that your posts are being scheduled and published successfully:
1. Go to the **crossway-scheduler** service in your Render dashboard.
2. Click on the **Logs** tab.
3. You will see output like `[Scheduler] <timestamp> - Checking for scheduled posts...` every minute. If an error occurs during Facebook or Instagram API calls, the detailed error message will be printed here.