/**
 * In-app SEO cron jobs: weekly sitemap resubmit + SEO digest emails.
 */
import prisma from "./prisma.js";
import { resubmitAllSitemaps } from "./searchconsole.js";
import { buildSeoOpportunityPack } from "./seoOpportunities.js";
import { sendSeoDigestEmail } from "./email.js";
import { normalizeSiteOrigin } from "./validation.js";
import { getSeoDigestEnabled, listSeoDigestRecipients } from "./seoDigestSettings.js";

function envFlag(name) {
  const v = String(process.env[name] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function envDigestRecipients() {
  const raw = String(process.env.SEO_DIGEST_RECIPIENTS || "").trim();
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Websites included in weekly SEO jobs:
 * - All rows in the Site table with an http(s) URL
 * - Plus unique user.siteLink websites not already listed
 * Meta-only page IDs are not included.
 */
export async function listWebsiteUrls() {
  const sites = await prisma.site.findMany({
    select: { siteUrl: true },
    orderBy: { updatedAt: "desc" },
  });
  const urls = [];
  for (const s of sites) {
    const n = normalizeSiteOrigin(s.siteUrl);
    if (n && n.startsWith("http")) urls.push(n);
  }
  const users = await prisma.user.findMany({
    where: { siteLink: { not: null }, deletedAt: null },
    select: { siteLink: true },
  });
  for (const u of users) {
    const n = normalizeSiteOrigin(u.siteLink);
    if (n && n.startsWith("http") && !urls.includes(n)) urls.push(n);
  }
  return urls;
}

/**
 * Digest is on if UI toggle is true, OR SEO_DIGEST_EMAIL env is true
 * (UI false explicitly wins over env).
 */
export async function isSeoDigestEnabled() {
  const dbEnabled = await getSeoDigestEnabled();
  if (dbEnabled === false) return false;
  if (dbEnabled === true) return true;
  return envFlag("SEO_DIGEST_EMAIL");
}

/**
 * Recipients priority:
 * 1) Superadmin-managed DB list (if any)
 * 2) SEO_DIGEST_RECIPIENTS env
 * 3) All super_admin user emails
 */
export async function resolveSeoDigestRecipients() {
  const dbRows = await listSeoDigestRecipients();
  if (dbRows.length) {
    return {
      emails: dbRows.map((r) => r.email),
      source: "database",
    };
  }
  const fromEnv = envDigestRecipients();
  if (fromEnv.length) {
    return { emails: fromEnv, source: "env" };
  }
  const admins = await prisma.user.findMany({
    where: { role: "super_admin", deletedAt: null },
    select: { email: true },
  });
  return {
    emails: admins.map((a) => a.email).filter(Boolean),
    source: "super_admins",
  };
}

/**
 * Resubmit every sitemap already listed in GSC for each known website.
 */
export async function runWeeklySitemapResubmit(logger = console) {
  if (!envFlag("SEO_AUTO_SUBMIT_SITEMAPS")) {
    logger.info?.("SEO_AUTO_SUBMIT_SITEMAPS not enabled — skipping weekly sitemap resubmit.");
    return { skipped: true };
  }
  const urls = await listWebsiteUrls();
  logger.info?.(`Weekly sitemap resubmit: ${urls.length} site(s)`);
  const results = [];
  for (const siteUrl of urls) {
    try {
      const r = await resubmitAllSitemaps(siteUrl);
      results.push({ siteUrl, ...r });
      logger.info?.(
        `Sitemap resubmit ${siteUrl}: ok=${r.okCount ?? 0} fail=${r.failCount ?? 0}${r.skipped ? " (skipped)" : ""}`
      );
    } catch (err) {
      results.push({ siteUrl, error: err.message });
      logger.error?.(`Sitemap resubmit failed for ${siteUrl}: ${err.message}`);
    }
  }
  return { skipped: false, results };
}

/**
 * Build opportunity packs and email a digest covering all known websites.
 */
export async function runWeeklySeoDigest(logger = console) {
  if (!(await isSeoDigestEnabled())) {
    logger.info?.("SEO digest disabled (toggle off / SEO_DIGEST_EMAIL not set) — skipping.");
    return { skipped: true };
  }

  const { emails: recipients, source } = await resolveSeoDigestRecipients();
  if (!recipients.length) {
    logger.error?.(
      "SEO digest: no recipients. Add emails in User Management → Weekly SEO Digest, or set SEO_DIGEST_RECIPIENTS."
    );
    return { skipped: true, reason: "no_recipients" };
  }

  const urls = await listWebsiteUrls();
  const siteSummaries = [];
  for (const siteUrl of urls) {
    try {
      const pack = await buildSeoOpportunityPack(siteUrl, "28d");
      siteSummaries.push({
        siteUrl,
        taskCount: pack.taskCount,
        striking: (pack.strikingDistance || []).length,
        cannibalization: (pack.cannibalization || []).length,
        decayingQueries: (pack.decayingQueries || []).length,
        deviceGaps: (pack.deviceGaps?.gaps || []).length,
        sitemapWarnings: (pack.sitemapWarnings || []).map((w) => w.message),
        topTasks: [
          ...(pack.sitemapWarnings || []).slice(0, 2).map((w) => w.message),
          ...(pack.deviceGaps?.gaps || []).slice(0, 2).map((g) => g.message),
          ...(pack.strikingDistance || []).slice(0, 2).map(
            (q) => `Striking distance: “${q.query}” (pos ${Number(q.position || 0).toFixed(1)})`
          ),
          ...(pack.cannibalization || []).slice(0, 1).map(
            (c) => `Cannibalization: “${c.query}” on ${c.pageCount} pages`
          ),
          ...(pack.decayingQueries || []).slice(0, 2).map(
            (q) => `Decay: “${q.query}” (${Number(q.clickChangePct || 0).toFixed(0)}% clicks)`
          ),
        ].slice(0, 6),
      });
    } catch (err) {
      siteSummaries.push({ siteUrl, error: err.message, taskCount: 0, topTasks: [] });
      logger.error?.(`SEO digest pack failed for ${siteUrl}: ${err.message}`);
    }
  }

  siteSummaries.sort((a, b) => (b.taskCount || 0) - (a.taskCount || 0));

  await sendSeoDigestEmail(recipients, siteSummaries);
  logger.info?.(
    `SEO digest emailed to ${recipients.length} recipient(s) (${source}) covering ${siteSummaries.length} site(s).`
  );
  return { skipped: false, recipients, source, siteCount: siteSummaries.length };
}

export { envFlag };
