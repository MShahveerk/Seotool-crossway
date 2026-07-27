/**
 * Site Explorer jobs — daily Common Crawl CDX fetch + Open PageRank merge, stored per domain.
 */
import prisma from "./prisma.js";
import { buildSiteExplorerReport } from "./commonCrawl.js";
import { getAuthorityScores, isAuthorityConfigured, toDomain } from "./authority.js";
import { toScore100 } from "./authorityScore.js";
import { estimateHomepageUr100, estimatePageUr100 } from "./urlRating.js";
import { listWebsiteUrls } from "./seoJobs.js";
import { normalizeSiteOrigin } from "./validation.js";

function authorityFromOpr(own, domain) {
  const dr100 = toScore100(own.score);
  return {
    configured: isAuthorityConfigured(),
    score: own.score ?? null,
    score100: dr100,
    globalRank: own.globalRank ?? null,
    referringDomains: own.referringDomains ?? null,
    found: own.score != null || own.referringDomains != null,
    homepageUr100: estimateHomepageUr100(dr100, domain),
  };
}

/** Merge live Open PageRank (always fresh referring_domains + DA). */
export async function enrichWithLiveAuthority(payload, domain) {
  const d = toDomain(domain);
  if (!d) return payload;
  if (!isAuthorityConfigured()) {
    payload.authority = { configured: false, score: null, score100: null, globalRank: null, referringDomains: null, found: false, homepageUr100: null };
    return payload;
  }
  try {
    const scores = await getAuthorityScores([d]);
    const own = scores.get(d) || {};
    payload.authority = authorityFromOpr(own, d);
    payload.homepageUr100 = payload.authority.homepageUr100;
    if (payload.overview && payload.authority.referringDomains != null) {
      payload.overview.referringDomainsOpr = payload.authority.referringDomains;
    }
  } catch (err) {
    console.warn(`Live OPR enrich failed for ${d}:`, err?.message || err);
  }
  return payload;
}

/** UR-like per URL — domain DR adjusted by path depth (subdomains use their own OPR host). */
export async function enrichPageUrlRatings(items = [], registrableDomain = "") {
  if (!items.length || !isAuthorityConfigured()) return items;
  const apex = toDomain(registrableDomain) || toDomain(items[0]?.host || items[0]?.url) || "";
  const hosts = [...new Set(items.map((row) => toDomain(row.host || row.url)).filter(Boolean))].slice(0, 100);
  if (!hosts.length) return items;
  try {
    const scores = await getAuthorityScores(hosts);
    return items.map((row) => {
      const hostDomain = toDomain(row.host || row.url);
      const opr = hostDomain ? scores.get(hostDomain) : null;
      const dr100 = opr ? toScore100(opr.score) : null;
      const ur100 = dr100 != null ? estimatePageUr100(dr100, row.url, apex || hostDomain) : null;
      return { ...row, ur100, dr100, urHost: hostDomain };
    });
  } catch {
    return items;
  }
}

const KEEP_SNAPSHOTS_PER_DOMAIN = 30;
const DELAY_BETWEEN_SITES_MS = 12000;
const RUNNING_LOCK_MS = 15 * 60 * 1000;
const STALE_RUNNING_MS = 8 * 60 * 1000;

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

/** Mark long-running jobs as failed so refresh can be retried. */
export async function clearStaleRunningSnapshots(domain = null) {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS);
  const where = {
    status: "running",
    startedAt: { lt: cutoff },
    ...(domain ? { domain: toDomain(domain) } : {}),
  };
  const stale = await prisma.siteExplorerSnapshot.findMany({ where, select: { id: true } });
  if (!stale.length) return 0;
  await prisma.siteExplorerSnapshot.updateMany({
    where: { id: { in: stale.map((s) => s.id) } },
    data: {
      status: "error",
      errorMessage: "Refresh timed out. Click Refresh now to try again.",
      finishedAt: new Date(),
    },
  });
  return stale.length;
}

export async function getLatestSiteExplorer(domain) {
  const d = toDomain(domain);
  if (!d) return null;

  await clearStaleRunningSnapshots(d);

  const [latest, running, history, failedToday] = await Promise.all([
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
    prisma.siteExplorerSnapshot.findFirst({
      where: { domain: d, status: "error", fetchedDate: todayDate() },
      orderBy: { finishedAt: "desc" },
      select: { errorMessage: true, finishedAt: true },
    }),
  ]);

  return { latest, running, history, failedToday };
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

/**
 * Create today's "running" row synchronously (before HTTP response ends).
 * @returns {{ started: boolean, snapshotId?: string, alreadyRunning?: boolean }}
 */
export async function prepareSiteExplorerRefresh(siteUrl) {
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
    select: { id: true },
  });
  if (running) return { started: false, alreadyRunning: true, snapshotId: running.id };

  const snapshot = await prisma.siteExplorerSnapshot.upsert({
    where: { domain_fetchedDate: { domain, fetchedDate } },
    create: { domain, siteUrl: normalized, status: "running", fetchedDate },
    update: { siteUrl: normalized, status: "running", errorMessage: null, startedAt: new Date(), finishedAt: null },
  });

  return { started: true, snapshotId: snapshot.id };
}

/** Heavy lifting — call from cron or Next.js after(). */
export async function executeSiteExplorerRefresh(
  siteUrl,
  snapshotId,
  { includeReferring = false, includeCrawl = true } = {}
) {
  const normalized = normalizeSiteOrigin(siteUrl);
  const domain = toDomain(normalized);
  if (!domain || !normalized) throw new Error("Invalid website URL for site explorer.");

  try {
    let report;
    if (includeCrawl) {
      report = await buildSiteExplorerReport(normalized, { includeReferring });
    } else {
      report = {
        domain,
        crawl: null,
        overview: {
          indexedUrls: 0,
          indexedSampleSize: 0,
          indexedTruncated: false,
          subdomains: 0,
          referringDomains: 0,
          http200Rate: null,
          statusBreakdown: {},
          mimeBreakdown: {},
          lastCapture: null,
        },
        pages: [],
        subdomains: [],
        referring: [],
        notes: [
          "Authority from Open PageRank (live). Indexed pages refresh overnight via cron to avoid Common Crawl rate limits.",
        ],
        blocked: false,
      };
    }

    let authorityScore = null;
    let globalRank = null;
    let referringDomainsOpr = null;

    if (isAuthorityConfigured()) {
      try {
        const scores = await getAuthorityScores([domain]);
        const own = scores.get(domain) || {};
        authorityScore = own.score ?? null;
        globalRank = own.globalRank ?? null;
        referringDomainsOpr = own.referringDomains ?? null;
      } catch (err) {
        console.warn(`Open PageRank lookup failed for ${domain}:`, err?.message || err);
      }
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
      where: { id: snapshotId },
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
      where: { id: snapshotId },
      data: {
        status: "error",
        errorMessage: err.message || "Site explorer fetch failed",
        finishedAt: new Date(),
      },
    });
  }
}

/** Fetch Common Crawl + OPR for one site and persist today's snapshot (cron / scripts). */
export async function runSiteExplorer(siteUrl, { includeReferring = true, includeCrawl = true } = {}) {
  const prep = await prepareSiteExplorerRefresh(siteUrl);
  if (!prep.started && prep.snapshotId) {
    const existing = await prisma.siteExplorerSnapshot.findUnique({ where: { id: prep.snapshotId } });
    if (existing) return existing;
  }
  if (!prep.snapshotId) throw new Error("Could not prepare site explorer refresh.");
  return executeSiteExplorerRefresh(siteUrl, prep.snapshotId, { includeReferring, includeCrawl });
}

/** Daily cron: refresh site explorer for every known website. */
export async function runSiteExplorerForAllSites(logger = console) {
  const urls = await listWebsiteUrls();
  let ok = 0;
  let failed = 0;

  for (const url of urls) {
    try {
      const snap = await runSiteExplorer(url, { includeReferring: true, includeCrawl: true });
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
