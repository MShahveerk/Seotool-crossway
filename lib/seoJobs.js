/**
 * In-app SEO cron jobs: weekly sitemap resubmit + SEO digest emails.
 */
import prisma from "./prisma.js";
import { resubmitAllSitemaps } from "./searchconsole.js";
import { buildSeoOpportunityPack } from "./seoOpportunities.js";
import { sendSeoDigestEmail } from "./email.js";
import { normalizeSiteOrigin } from "./validation.js";

function envFlag(name) {
  const v = String(process.env[name] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function digestRecipients() {
  const raw = String(process.env.SEO_DIGEST_RECIPIENTS || "").trim();
  if (raw) {
    return raw
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);
  }
  return null;
}

async function listWebsiteUrls() {
  const sites = await prisma.site.findMany({
    select: { siteUrl: true },
    orderBy: { updatedAt: "desc" },
  });
  const urls = [];
  for (const s of sites) {
    const n = normalizeSiteOrigin(s.siteUrl);
    if (n && (n.startsWith("http") || n.startsWith("sc-domain:"))) urls.push(n);
  }
  // Also include unique user siteLinks that look like websites
  const users = await prisma.user.findMany({
    where: { siteLink: { not: null } },
    select: { siteLink: true },
  });
  for (const u of users) {
    const n = normalizeSiteOrigin(u.siteLink);
    if (n && n.startsWith("http") && !urls.includes(n)) urls.push(n);
  }
  return urls;
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
 * Build opportunity packs and email a digest.
 */
export async function runWeeklySeoDigest(logger = console) {
  if (!envFlag("SEO_DIGEST_EMAIL")) {
    logger.info?.("SEO_DIGEST_EMAIL not enabled — skipping SEO digest.");
    return { skipped: true };
  }

  let recipients = digestRecipients();
  if (!recipients?.length) {
    const admins = await prisma.user.findMany({
      where: { role: "super_admin", email: { not: null } },
      select: { email: true },
    });
    recipients = admins.map((a) => a.email).filter(Boolean);
  }
  if (!recipients.length) {
    logger.error?.("SEO digest: no recipients (set SEO_DIGEST_RECIPIENTS or ensure super_admin emails exist).");
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
  logger.info?.(`SEO digest emailed to ${recipients.length} recipient(s) covering ${siteSummaries.length} site(s).`);
  return { skipped: false, recipients, siteCount: siteSummaries.length };
}

export { envFlag };
