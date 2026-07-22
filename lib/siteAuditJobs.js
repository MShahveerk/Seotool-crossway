/**
 * Site Audit jobs: run/store/prune snapshots, daily refresh for all websites.
 */
import prisma from "./prisma.js";
import { runSiteAuditForUrl } from "./siteAudit.js";
import { listWebsiteUrls } from "./seoJobs.js";

const KEEP_SNAPSHOTS_PER_SITE = 15;
const RUNNING_LOCK_MS = 15 * 60 * 1000;
const DELAY_BETWEEN_SITES_MS = 5000;

/** Run one audit for a site and persist it. Returns the finished snapshot. */
export async function runSiteAudit(siteUrl) {
  // Don't start a second crawl if one is already in flight for this site
  const running = await prisma.siteAuditSnapshot.findFirst({
    where: { siteUrl, status: "running", startedAt: { gte: new Date(Date.now() - RUNNING_LOCK_MS) } },
  });
  if (running) return running;

  const snapshot = await prisma.siteAuditSnapshot.create({
    data: { siteUrl, status: "running" },
  });

  try {
    const payload = await runSiteAuditForUrl(siteUrl);
    const finished = await prisma.siteAuditSnapshot.update({
      where: { id: snapshot.id },
      data: {
        status: "success",
        healthScore: payload.healthScore,
        totalPages: payload.stats.pagesCrawled,
        criticalCount: payload.counts.critical,
        warningCount: payload.counts.warning,
        noticeCount: payload.counts.notice,
        payload,
        finishedAt: new Date(),
      },
    });
    await pruneSnapshots(siteUrl);
    return finished;
  } catch (err) {
    return prisma.siteAuditSnapshot.update({
      where: { id: snapshot.id },
      data: { status: "error", errorMessage: err.message || "Audit failed", finishedAt: new Date() },
    });
  }
}

async function pruneSnapshots(siteUrl) {
  const old = await prisma.siteAuditSnapshot.findMany({
    where: { siteUrl },
    orderBy: { startedAt: "desc" },
    skip: KEEP_SNAPSHOTS_PER_SITE,
    select: { id: true },
  });
  if (old.length) {
    await prisma.siteAuditSnapshot.deleteMany({ where: { id: { in: old.map((s) => s.id) } } });
  }
}

/** Latest successful snapshot + health trend + whether a crawl is in flight. */
export async function getLatestSiteAudit(siteUrl) {
  const [latest, running, trendRows] = await Promise.all([
    prisma.siteAuditSnapshot.findFirst({
      where: { siteUrl, status: "success" },
      orderBy: { startedAt: "desc" },
    }),
    prisma.siteAuditSnapshot.findFirst({
      where: { siteUrl, status: "running", startedAt: { gte: new Date(Date.now() - RUNNING_LOCK_MS) } },
      select: { id: true, startedAt: true },
    }),
    prisma.siteAuditSnapshot.findMany({
      where: { siteUrl, status: "success" },
      orderBy: { startedAt: "asc" },
      take: 20,
      select: { startedAt: true, healthScore: true, criticalCount: true, warningCount: true },
    }),
  ]);

  const lastError = latest
    ? null
    : (
        await prisma.siteAuditSnapshot.findFirst({
          where: { siteUrl, status: "error" },
          orderBy: { startedAt: "desc" },
          select: { errorMessage: true },
        })
      )?.errorMessage || null;

  return { snapshot: latest, running: Boolean(running), trend: trendRows, lastError };
}

/** Cron entry: audit every known website, sequentially. */
export async function runSiteAuditsForAllSites(logger = console) {
  const urls = await listWebsiteUrls();
  let ok = 0;
  let failed = 0;
  for (const url of urls) {
    try {
      const snap = await runSiteAudit(url);
      if (snap.status === "error") {
        failed += 1;
        logger.error(`Site audit failed: ${url} — ${snap.errorMessage}`);
      } else {
        ok += 1;
        logger.info(`Site audit complete: ${url} (score ${snap.healthScore}, ${snap.totalPages} pages)`);
      }
    } catch (err) {
      failed += 1;
      logger.error(`Site audit crashed: ${url} — ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, DELAY_BETWEEN_SITES_MS));
  }
  logger.info(`Site audits done. ok=${ok} failed=${failed} sites=${urls.length}`);
  return { ok, failed, total: urls.length };
}
