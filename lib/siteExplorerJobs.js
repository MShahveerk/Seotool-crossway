/**
 * Site Explorer jobs — daily Common Crawl CDX fetch + Open PageRank merge, stored per domain.
 */
import prisma from "./prisma.js";
import { buildSiteExplorerReport } from "./commonCrawl.js";
import { getAuthorityScores, isAuthorityConfigured, toDomain } from "./authority.js";
import { toScore100 } from "./authorityScore.js";
import { listWebsiteUrls } from "./seoJobs.js";
import { normalizeSiteOrigin } from "./validation.js";

const KEEP_SNAPSHOTS_PER_DOMAIN = 30;
const DELAY_BETWEEN_SITES_MS = 12000;
const RUNNING_LOCK_MS = 20 * 60 * 1000;

function todayDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function snapshotToApiPayload(snapshot, { view = "overview", page = 1, pageSize = 50 } = {}) {
  const payload = snapshot.payload || {};
  const overview = payload.overview || {
    indexedUrls: snapshot.indexedUrls,
    subdomains: snapshot.subdomainCount,
    referringDomains: snapshot.referringDomainsCount,
    http200Rate: payload.http200Rate ?? null,
    statusBreakdown: payload.statusBreakdown || {},
    mimeBreakdown: payload.mimeBreakdown || {},
    lastCapture: payload.lastCapture || null,
  };

  const authority = {
    configured: isAuthorityConfigured(),
    score: snapshot.authorityScore,
    score100: toScore100(snapshot.authorityScore),
    globalRank: snapshot.globalRank,
    referringDomains: snapshot.referringDomainsOpr,
    found: snapshot.authorityScore != null,
  };

  const base = {
    domain: snapshot.domain,
    siteUrl: snapshot.siteUrl,
    crawl: payload.crawl || { id: snapshot.crawlId, name: snapshot.crawlName },
    fetchedAt: snapshot.finishedAt || snapshot.startedAt,
    fetchedDate: snapshot.fetchedDate,
    source: "database",
    stale: snapshot.fetchedDate < todayDate(),
    blocked: Boolean(payload.blocked),
    notes: payload.notes || [],
    authority,
    openhrefs: payload.openhrefs || { status: "planned", message: "Full HTML backlink graph pending openhrefs dataset import." },
  };

  if (view === "pages") {
    const allPages = payload.pages || [];
    const start = (page - 1) * pageSize;
    return {
      ...base,
      view,
      page,
      pageSize,
      totalPages: snapshot.indexedUrls,
      items: allPages.slice(start, start + pageSize),
      truncated: allPages.length < snapshot.indexedUrls,
    };
  }

  if (view === "subdomains") {
    const items = payload.subdomains || [];
    return { ...base, view, items, total: items.length };
  }

  if (view === "referring") {
    const items = payload.referring || [];
    return {
      ...base,
      view,
      items,
      total: items.length,
      method: payload.referringMethod || "cdx-url-mention",
      referringDomainsOpr: snapshot.referringDomainsOpr,
    };
  }

  if (view === "backlinks") {
    const items = payload.referring || [];
    return {
      ...base,
      view,
      items: items.map((r) => ({
        sourceUrl: r.sampleUrl,
        sourceDomain: r.host,
        mentions: r.mentions,
        captured: r.captured,
        status: r.sampleStatus,
      })),
      total: items.length,
      method: payload.referringMethod || "cdx-url-mention",
    };
  }

  return {
    ...base,
    view: "overview",
    overview,
    samples: {
      pages: (payload.pages || []).slice(0, 10),
      subdomains: (payload.subdomains || []).slice(0, 10),
      referring: (payload.referring || []).slice(0, 10),
    },
  };
}

export async function getLatestSiteExplorer(domain) {
  const d = toDomain(domain);
  if (!d) return null;

  const [latest, running, history] = await Promise.all([
    prisma.siteExplorerSnapshot.findFirst({
      where: { domain: d, status: "success" },
      orderBy: { fetchedDate: "desc" },
    }),
    prisma.siteExplorerSnapshot.findFirst({
      where: {
        domain: d,
        status: "running",
        startedAt: { gte: new Date(Date.now() - RUNNING_LOCK_MS) },
      },
      select: { id: true, startedAt: true },
    }),
    prisma.siteExplorerSnapshot.findMany({
      where: { domain: d, status: "success" },
      orderBy: { fetchedDate: "asc" },
      take: 30,
      select: {
        fetchedDate: true,
        indexedUrls: true,
        referringDomainsCount: true,
        referringDomainsOpr: true,
        authorityScore: true,
      },
    }),
  ]);

  return { latest, running, history };
}

async function pruneSnapshots(domain) {
  const old = await prisma.siteExplorerSnapshot.findMany({
    where: { domain },
    orderBy: { fetchedDate: "desc" },
    skip: KEEP_SNAPSHOTS_PER_DOMAIN,
    select: { id: true },
  });
  if (old.length) {
    await prisma.siteExplorerSnapshot.deleteMany({ where: { id: { in: old.map((s) => s.id) } } });
  }
}

/** Fetch Common Crawl + OPR for one site and persist today's snapshot. */
export async function runSiteExplorer(siteUrl) {
  const normalized = normalizeSiteOrigin(siteUrl);
  const domain = toDomain(normalized);
  if (!domain || !normalized) throw new Error("Invalid website URL for site explorer.");

  const fetchedDate = todayDate();

  const running = await prisma.siteExplorerSnapshot.findFirst({
    where: {
      domain,
      status: "running",
      startedAt: { gte: new Date(Date.now() - RUNNING_LOCK_MS) },
    },
  });
  if (running) return running;

  const snapshot = await prisma.siteExplorerSnapshot.upsert({
    where: { domain_fetchedDate: { domain, fetchedDate } },
    create: { domain, siteUrl: normalized, status: "running", fetchedDate },
    update: { siteUrl: normalized, status: "running", errorMessage: null, startedAt: new Date(), finishedAt: null },
  });

  try {
    const report = await buildSiteExplorerReport(normalized, { crawlCount: 1 });

    let authorityScore = null;
    let globalRank = null;
    let referringDomainsOpr = null;

    if (isAuthorityConfigured()) {
      const scores = await getAuthorityScores([domain]);
      const own = scores.get(domain) || {};
      authorityScore = own.score ?? null;
      globalRank = own.globalRank ?? null;
      referringDomainsOpr = own.referringDomains ?? null;
    }

    const ok200 = report.pages.filter((p) => String(p.status) === "200").length;
    const http200Rate = report.pages.length ? ok200 / report.pages.length : null;

    const payload = {
      crawl: report.crawl,
      overview: report.overview,
      pages: report.pages,
      subdomains: report.subdomains,
      referring: report.referring,
      referringMethod: "cdx-url-mention",
      statusBreakdown: report.overview.statusBreakdown,
      mimeBreakdown: report.overview.mimeBreakdown,
      http200Rate,
      lastCapture: report.overview.lastCapture,
      notes: report.notes,
      blocked: report.blocked,
      openhrefs: {
        status: "external-pipeline",
        message:
          "openhrefs is a separate Spark/dbt pipeline over full Common Crawl dumps — too heavy to run inside this app. When its public backlink dataset ships, we can import it here for true DR/UR/backlink rows.",
        repo: "https://github.com/ivan-aleshin/openhrefs",
      },
    };

    const finished = await prisma.siteExplorerSnapshot.update({
      where: { id: snapshot.id },
      data: {
        status: "success",
        crawlId: report.crawl?.id || null,
        crawlName: report.crawl?.name || null,
        indexedUrls: report.overview.indexedUrls || 0,
        subdomainCount: report.overview.subdomains || 0,
        referringDomainsCount: report.overview.referringDomains || 0,
        referringDomainsOpr,
        authorityScore,
        globalRank,
        payload,
        finishedAt: new Date(),
      },
    });

    await pruneSnapshots(domain);
    return finished;
  } catch (err) {
    return prisma.siteExplorerSnapshot.update({
      where: { id: snapshot.id },
      data: {
        status: "error",
        errorMessage: err.message || "Site explorer fetch failed",
        finishedAt: new Date(),
      },
    });
  }
}

/** Daily cron: refresh site explorer for every known website. */
export async function runSiteExplorerForAllSites(logger = console) {
  const urls = await listWebsiteUrls();
  let ok = 0;
  let failed = 0;

  for (const url of urls) {
    try {
      const snap = await runSiteExplorer(url);
      if (snap.status === "error") {
        failed += 1;
        logger.error(`Site explorer failed: ${url} — ${snap.errorMessage}`);
      } else {
        ok += 1;
        logger.info(
          `Site explorer saved: ${url} (indexed=${snap.indexedUrls}, referring=${snap.referringDomainsCount}, opr=${snap.referringDomainsOpr ?? "n/a"})`
        );
      }
    } catch (err) {
      failed += 1;
      logger.error(`Site explorer crashed: ${url} — ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, DELAY_BETWEEN_SITES_MS));
  }

  logger.info(`Site explorer daily run done. ok=${ok} failed=${failed} sites=${urls.length}`);
  return { ok, failed, total: urls.length };
}
