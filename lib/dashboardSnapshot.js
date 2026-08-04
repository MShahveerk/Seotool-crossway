/**
 * Aggregated dashboard snapshot — one server round-trip for overview UI.
 */
import prisma from "./prisma.js";
import { ROLES } from "./rbac.js";
import { isValidUrl, normalizeSiteOrigin } from "./validation.js";
import { resolveSiteEquivalents, sessionCanAccessSiteAsync, isMetaPageId } from "./siteAccess.js";
import { classifyError } from "./errorHandling.js";
import {
  getSearchAnalyticsTimeSeries,
  getTopQueries,
  getTopPages,
} from "./searchconsole.js";
import {
  getDateRangeForPresetId,
  previousBlockEqualLength,
  densifyTimeSeries,
  clampSearchConsoleQueryRange,
} from "./searchConsoleDateRanges.js";
import { getLatestSiteAudit } from "./siteAuditJobs.js";
import { getPageSpeedSnapshot } from "./pagespeedJobs.js";
import { getAuthorityScores, toDomain, toScore100 } from "./authority.js";
import { getLatestSiteExplorer } from "./siteExplorerJobs.js";
import { buildSeoOpportunityPack } from "./seoOpportunities.js";
import { buildGuidedSeoTasks } from "./seoOpportunityGuides.js";
import { getCachedSnapshot } from "./seranking/cache.js";
import { DATA_TYPES } from "./seranking/config.js";
import { normalizeAuditReport, normalizeBacklinksSummary } from "./seranking/normalize.js";
import { serankingCacheSiteForTarget } from "./seranking/domain.js";
import { resolveSerankingTarget } from "./seranking/resolveTarget.js";
import { loadSerankingMetrics } from "./seranking/loadBundle.js";

function siteUrlVariants(siteUrl) {
  const domain = toDomain(siteUrl);
  const origin = normalizeSiteOrigin(siteUrl) || siteUrl;
  const out = new Set([siteUrl, origin].filter(Boolean));
  if (domain) {
    out.add(`https://${domain}`);
    out.add(`https://www.${domain}`);
    out.add(`http://${domain}`);
    out.add(`http://www.${domain}`);
    out.add(domain);
    const targetKey = serankingCacheSiteForTarget(domain);
    if (targetKey) out.add(targetKey);
  }
  try {
    const resolved = resolveSerankingTarget(siteUrl);
    if (resolved?.cacheSite) out.add(resolved.cacheSite);
    if (resolved?.siteUrlForApi) out.add(resolved.siteUrlForApi);
  } catch {
    /* ignore */
  }
  return [...out];
}

function emptyAudit() {
  return { score: null, critical: null, warning: null, running: false, finishedAt: null, error: null };
}

function auditFromInternalSnapshot(snap, { running = false, lastError = null } = {}) {
  if (!snap) return null;
  const score = snap.healthScore ?? snap.payload?.healthScore ?? null;
  return {
    score: score != null && Number.isFinite(Number(score)) ? Math.round(Number(score)) : null,
    critical: snap.criticalCount ?? snap.payload?.counts?.critical ?? null,
    warning: snap.warningCount ?? snap.payload?.counts?.warning ?? null,
    running: Boolean(running),
    finishedAt: snap.finishedAt?.toISOString?.() || snap.finishedAt || null,
    error: lastError,
  };
}

async function resolveDashboardAudit(websiteUrl) {
  const variants = siteUrlVariants(websiteUrl);
  let running = false;
  let lastError = null;

  for (const key of variants) {
    const pack = await getLatestSiteAudit(key).catch(() => null);
    if (pack?.running) running = true;
    if (pack?.lastError) lastError = pack.lastError;
    const mapped = auditFromInternalSnapshot(pack?.snapshot, {
      running: pack?.running,
      lastError: pack?.lastError,
    });
    if (mapped && (mapped.score != null || mapped.critical != null)) {
      return { ...mapped, running: mapped.running || running };
    }
  }

  const domain = toDomain(websiteUrl);
  if (domain) {
    const snap = await prisma.siteAuditSnapshot
      .findFirst({
        where: { status: "success", siteUrl: { contains: domain } },
        orderBy: { startedAt: "desc" },
      })
      .catch(() => null);
    const mapped = auditFromInternalSnapshot(snap, { running, lastError });
    if (mapped && (mapped.score != null || mapped.critical != null)) return mapped;
  }

  for (const key of variants) {
    const cached = await getCachedSnapshot(key, DATA_TYPES.AUDIT_REPORT).catch(() => null);
    if (!cached?.payload) continue;
    const normalized =
      cached.payload.normalized ||
      normalizeAuditReport(cached.payload.report || cached.payload.data?.report || cached.payload);
    if (!normalized || (normalized.score == null && normalized.totalErrors == null)) continue;
    return {
      score: normalized.score != null ? Math.round(Number(normalized.score)) : null,
      critical: normalized.totalErrors ?? null,
      warning: normalized.totalWarnings ?? null,
      running,
      finishedAt: cached.fetchedAt?.toISOString?.() || cached.fetchedAt || null,
      error: null,
    };
  }

  return { ...emptyAudit(), running, error: lastError };
}

async function resolveCachedBacklinks(websiteUrl) {
  const variants = siteUrlVariants(websiteUrl);
  for (const key of variants) {
    const cached = await getCachedSnapshot(key, DATA_TYPES.BACKLINKS_SUMMARY).catch(() => null);
    const summary = normalizeBacklinksSummary(cached?.payload);
    if (summary?.refdomains != null || summary?.backlinks != null) return summary;
  }
  try {
    const metrics = await loadSerankingMetrics(websiteUrl, { allowManual: false, force: false });
    if (metrics?.backlinks?.refdomains != null || metrics?.backlinks?.backlinks != null) {
      return metrics.backlinks;
    }
  } catch {
    /* optional */
  }
  return null;
}

function normalizePlatformKey(value) {
  const p = String(value || "").trim().toLowerCase();
  if (p === "linkedin") return "";
  return p === "x" ? "tiktok" : p;
}

function pctChange(current, previous) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (p === 0) return c > 0 ? 100 : 0;
  return ((c - p) / p) * 100;
}

function lighthouseScore100(payload) {
  if (!payload) return null;
  const raw = payload?.categories?.performance?.score ?? payload?.scores?.performance;
  if (raw == null || !Number.isFinite(Number(raw))) return null;
  const n = Number(raw);
  return n <= 1 ? Math.round(n * 100) : Math.round(n);
}

function taskNavigateTo(task) {
  const group = String(task.group || "").toLowerCase();
  if (group === "sitemap") return "website-statistics";
  if (group.includes("device")) return "website-statistics";
  if (group.includes("striking") || group.includes("keyword")) return "keyword-research";
  return "website-statistics";
}

const SEV_WEIGHT = { high: 0, medium: 1, low: 2 };

async function resolveTargetSite(session, urlParam) {
  const role = session.user.role || ROLES.USER;
  const hasGlobalAccess = role === ROLES.SUPER_ADMIN || role === ROLES.SMM;
  const fallbackSite =
    session.user.siteLink ||
    (Array.isArray(session.user.accessibleSites) && session.user.accessibleSites.length
      ? session.user.accessibleSites[0]
      : "");

  let targetSite = hasGlobalAccess ? urlParam || fallbackSite || "" : fallbackSite;
  if (!targetSite) {
    return { role, hasGlobalAccess, targetSiteNormalized: null, siteEquivalents: [], websiteUrl: null };
  }

  let resolvedSiteLink = targetSite;
  const mappedSite = await prisma.site.findFirst({
    where: {
      OR: [{ facebookPageId: targetSite }, { instagramUserId: targetSite }, { siteUrl: targetSite }],
    },
    select: { siteUrl: true },
  });
  if (mappedSite?.siteUrl) resolvedSiteLink = mappedSite.siteUrl;
  else {
    const mappedUser = await prisma.user.findFirst({
      where: { OR: [{ facebookPageId: targetSite }, { instagramUserId: targetSite }] },
      select: { siteLink: true },
    });
    if (mappedUser?.siteLink) resolvedSiteLink = mappedUser.siteLink;
  }

  const targetSiteNormalized = isMetaPageId(resolvedSiteLink)
    ? String(resolvedSiteLink).trim()
    : normalizeSiteOrigin(resolvedSiteLink);

  const siteEquivalents = await resolveSiteEquivalents(prisma, targetSite || targetSiteNormalized);
  if (targetSiteNormalized && !siteEquivalents.includes(targetSiteNormalized)) {
    siteEquivalents.push(targetSiteNormalized);
  }

  if (role === ROLES.USER) {
    const ownSite = normalizeSiteOrigin(session.user.siteLink || "");
    const ownOk =
      ownSite &&
      (ownSite === targetSiteNormalized ||
        siteEquivalents.some((k) => normalizeSiteOrigin(k) === ownSite || k === ownSite));
    if (!ownOk) {
      const err = new Error("Access denied for selected site.");
      err.status = 403;
      throw err;
    }
  }

  if (role === ROLES.VIEWER || role === ROLES.SMM) {
    if (!(await sessionCanAccessSiteAsync(prisma, session.user, siteEquivalents))) {
      const err = new Error("Access denied for selected site.");
      err.status = 403;
      throw err;
    }
  }

  const websiteUrl =
    targetSiteNormalized && isValidUrl(targetSiteNormalized) ? targetSiteNormalized : null;

  return { role, hasGlobalAccess, targetSiteNormalized, siteEquivalents, websiteUrl };
}

async function fetchSmmBaseline(siteEquivalents, targetSiteNormalized) {
  if (!targetSiteNormalized) {
    return { baselines: [], totalFollowers: 0, latestDate: null, message: "No site selected." };
  }

  const equivalentSites = [...siteEquivalents];
  const linkedSite = await prisma.site.findFirst({
    where: {
      OR: [
        { siteUrl: targetSiteNormalized },
        { facebookPageId: targetSiteNormalized },
        { instagramUserId: targetSiteNormalized },
      ],
    },
  });
  if (linkedSite) {
    if (linkedSite.siteUrl) equivalentSites.push(linkedSite.siteUrl);
    if (linkedSite.facebookPageId) equivalentSites.push(linkedSite.facebookPageId);
    if (linkedSite.instagramUserId) equivalentSites.push(linkedSite.instagramUserId);
  }

  const linkedUsers = await prisma.user.findMany({
    where: {
      OR: [
        { siteLink: targetSiteNormalized },
        { facebookPageId: targetSiteNormalized },
        { instagramUserId: targetSiteNormalized },
      ],
    },
  });
  for (const u of linkedUsers) {
    if (u.siteLink) equivalentSites.push(u.siteLink);
    if (u.facebookPageId) equivalentSites.push(u.facebookPageId);
    if (u.instagramUserId) equivalentSites.push(u.instagramUserId);
  }

  const uniqueEquivalents = Array.from(
    new Set(
      equivalentSites
        .map((s) => (/^\d+$/.test(String(s).trim()) ? String(s).trim() : normalizeSiteOrigin(s)))
        .filter(Boolean)
    )
  );

  let ownerUser = await prisma.user.findFirst({
    where: {
      OR: [
        { siteLink: { in: uniqueEquivalents } },
        { facebookPageId: { in: uniqueEquivalents } },
        { instagramUserId: { in: uniqueEquivalents } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!ownerUser) {
    const statOwner = await prisma.socialMediaDailyStat.findFirst({
      where: { siteLink: { in: uniqueEquivalents } },
      orderBy: { statDate: "desc" },
      select: { userId: true },
    });
    ownerUser = statOwner?.userId ? { id: statOwner.userId } : null;
  }

  if (!ownerUser?.id) {
    return {
      baselines: [],
      totalFollowers: 0,
      latestDate: null,
      message: "No user or baseline rows found for this site yet.",
    };
  }

  const rawRows = await prisma.socialMediaDailyStat.findMany({
    where: { userId: ownerUser.id, siteLink: { in: uniqueEquivalents } },
    orderBy: [{ statDate: "desc" }, { updatedAt: "desc" }],
  });
  const rows = rawRows.filter((r) => String(r.platform || "").toLowerCase() !== "linkedin");

  const latestByPlatform = new Map();
  for (const row of rows) {
    const key = normalizePlatformKey(row.platform);
    if (!key) continue;
    const existing = latestByPlatform.get(key);
    if (
      !existing ||
      new Date(row.statDate) > new Date(existing.statDate) ||
      (new Date(row.statDate).getTime() === new Date(existing.statDate).getTime() &&
        Number(row.followers || 0) >= Number(existing.followers || 0))
    ) {
      latestByPlatform.set(key, { ...row, platform: key });
    }
  }

  const baselines = Array.from(latestByPlatform.values()).map((row) => ({
    platform: row.platform,
    accountHandle: row.accountHandle || "",
    accountName: row.accountName || "",
    followers: Number(row.followers || 0),
    source: row.source || null,
    statDate: row.statDate ? row.statDate.toISOString().slice(0, 10) : null,
  }));

  const totalFollowers = baselines.reduce((sum, b) => sum + b.followers, 0);
  const dates = baselines.map((b) => b.statDate).filter(Boolean).sort();
  const latestDate = dates.length ? dates[dates.length - 1] : null;

  return { baselines, totalFollowers, latestDate, message: null };
}

async function fetchGscBlock(websiteUrl) {
  let { startDate, endDate } = getDateRangeForPresetId("28d");
  ({ startDate, endDate } = clampSearchConsoleQueryRange(startDate, endDate));
  const prev = previousBlockEqualLength(startDate, endDate);
  const prevClamped = clampSearchConsoleQueryRange(prev.startDate, prev.endDate);

  const [timeSeriesData, compareData, topQueriesData, topPagesData] = await Promise.all([
    getSearchAnalyticsTimeSeries(websiteUrl, startDate, endDate),
    getSearchAnalyticsTimeSeries(websiteUrl, prevClamped.startDate, prevClamped.endDate),
    getTopQueries(websiteUrl, startDate, endDate, 5),
    getTopPages(websiteUrl, startDate, endDate, 5),
  ]);

  const timeSeries = densifyTimeSeries(startDate, endDate, timeSeriesData.timeSeries);
  const totals = timeSeriesData.totals;
  const compareTotals = compareData.totals;

  return {
    available: true,
    error: null,
    totals,
    compareTotals,
    deltas: {
      clicksPct: pctChange(totals.clicks, compareTotals.clicks),
      impressionsPct: pctChange(totals.impressions, compareTotals.impressions),
      ctrPts:
        Number.isFinite(Number(totals.averageCtr)) && Number.isFinite(Number(compareTotals.averageCtr))
          ? (Number(totals.averageCtr) - Number(compareTotals.averageCtr)) * 100
          : null,
      positionDelta:
        Number.isFinite(Number(totals.averagePosition)) && Number.isFinite(Number(compareTotals.averagePosition))
          ? Number(totals.averagePosition) - Number(compareTotals.averagePosition)
          : null,
    },
    timeSeries: timeSeries.map((d) => ({
      date: d.date,
      clicks: d.clicks,
      impressions: d.impressions,
    })),
    topQueries: (topQueriesData.queries || []).slice(0, 5),
    topPages: (topPagesData.pages || []).slice(0, 5),
    dateRange: { startDate, endDate, range: "28d" },
    compareDateRange: { startDate: prevClamped.startDate, endDate: prevClamped.endDate },
  };
}

async function fetchHealthBlock(websiteUrl) {
  const domain = toDomain(websiteUrl);
  const [audit, pageSpeedMobile, pageSpeedDesktop, explorerResult, authorityMap, seBacklinks] =
    await Promise.all([
      resolveDashboardAudit(websiteUrl).catch(() => emptyAudit()),
      getPageSpeedSnapshot(websiteUrl, "mobile", { forceRefresh: false }).catch(() => null),
      getPageSpeedSnapshot(websiteUrl, "desktop", { forceRefresh: false }).catch(() => null),
      domain ? getLatestSiteExplorer(domain).catch(() => null) : Promise.resolve(null),
      domain ? getAuthorityScores([domain]).catch(() => new Map()) : Promise.resolve(new Map()),
      resolveCachedBacklinks(websiteUrl).catch(() => null),
    ]);

  const authority = domain ? authorityMap.get(domain) : null;
  const explorer = explorerResult?.latest;
  const explorerIndexed =
    explorer?.indexedUrls ??
    explorer?.payload?.overview?.indexedUrls ??
    null;
  const referringDomains =
    seBacklinks?.refdomains ??
    explorer?.referringDomainsOpr ??
    authority?.referringDomains ??
    explorer?.referringDomainsCount ??
    explorer?.payload?.overview?.referringDomains ??
    null;

  return {
    audit,
    authority: {
      score100: authority?.score != null ? toScore100(authority.score) : null,
      score10: authority?.score ?? null,
      globalRank: authority?.globalRank ?? null,
    },
    pageSpeed: {
      mobile: lighthouseScore100(pageSpeedMobile?.snapshot?.payload),
      desktop: lighthouseScore100(pageSpeedDesktop?.snapshot?.payload),
      stale: Boolean(pageSpeedMobile?.stale || pageSpeedDesktop?.stale),
    },
    indexedUrls: explorerIndexed != null ? Number(explorerIndexed) : null,
    referringDomains: referringDomains != null ? Number(referringDomains) : null,
  };
}

async function fetchActionsBlock(websiteUrl, siteEquivalents, role) {
  const actions = [];

  try {
    const pack = await buildSeoOpportunityPack(websiteUrl, "28d");
    const tasks = buildGuidedSeoTasks(pack)
      .sort((a, b) => (SEV_WEIGHT[a.severity] ?? 9) - (SEV_WEIGHT[b.severity] ?? 9))
      .slice(0, 5)
      .map((t) => ({
        id: t.id,
        label: t.label,
        severity: t.severity || "medium",
        group: t.group || "SEO",
        navigateTo: taskNavigateTo(t),
      }));
    actions.push(...tasks);
  } catch {
    /* GSC opportunities optional */
  }

  const blogWhere = {
    siteLink: { in: siteEquivalents.filter(Boolean) },
    status: "pending",
    hiddenFromAssignee: false,
  };
  const pendingBlogs = await prisma.blogPost.count({ where: blogWhere }).catch(() => 0);
  if (pendingBlogs > 0) {
    actions.push({
      id: "blogs-pending",
      label: `${pendingBlogs} blog post${pendingBlogs === 1 ? "" : "s"} awaiting review`,
      severity: "medium",
      group: "Blogs",
      navigateTo: role === ROLES.SUPER_ADMIN ? "admin-blogs" : "my-blog-approvals",
    });
  }

  return { items: actions.slice(0, 6), pendingBlogs };
}

/**
 * @param {import("next-auth").Session} session
 * @param {string | null | undefined} urlParam
 */
export async function buildDashboardSnapshot(session, urlParam) {
  const { targetSiteNormalized, siteEquivalents, websiteUrl, role } = await resolveTargetSite(
    session,
    urlParam
  );

  const [social, gscResult, healthResult, actionsResult] = await Promise.all([
    fetchSmmBaseline(siteEquivalents, targetSiteNormalized),
    websiteUrl
      ? fetchGscBlock(websiteUrl).catch((err) => ({
          available: false,
          error: classifyError(err)?.userMessage || err?.message || "Search Console unavailable.",
        }))
      : Promise.resolve({
          available: false,
          error: "Select a website URL (not a Meta-only page) for Search Console data.",
        }),
    websiteUrl
      ? fetchHealthBlock(websiteUrl).catch(() => ({
          audit: { score: null, critical: null, warning: null, running: false, finishedAt: null, error: null },
          authority: { score100: null, score10: null, globalRank: null },
          pageSpeed: { mobile: null, desktop: null, stale: false },
          indexedUrls: null,
          referringDomains: null,
        }))
      : Promise.resolve(null),
    websiteUrl
      ? fetchActionsBlock(websiteUrl, siteEquivalents, role)
      : Promise.resolve({ items: [], pendingBlogs: 0 }),
  ]);

  let host = "";
  if (targetSiteNormalized) {
    try {
      host = isValidUrl(targetSiteNormalized)
        ? new URL(targetSiteNormalized).hostname.replace(/^www\./, "")
        : String(targetSiteNormalized);
    } catch {
      host = String(targetSiteNormalized);
    }
  }

  return {
    siteUrl: websiteUrl || targetSiteNormalized,
    host,
    generatedAt: new Date().toISOString(),
    gsc: gscResult,
    health: healthResult,
    actions: actionsResult.items,
    pendingBlogs: actionsResult.pendingBlogs,
    social,
  };
}
