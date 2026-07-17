/**
 * Server-side report data fetch + PDF generation for client/approver reports.
 */
import prisma from "./prisma.js";
import { ROLES } from "./rbac.js";
import { normalizeSiteOrigin } from "./validation.js";
import { isMetaPageId, resolveSiteEquivalents } from "./siteAccess.js";
import {
  resolveSiteReportContext,
  sectionsForClientPack,
} from "./siteReportContext.js";
import {
  getSearchAnalytics,
  getTopQueries,
  getTopPages,
  getDeviceBreakdown,
  getSearchAppearanceBreakdown,
  getQueryPageMatrix,
  getSitemaps,
} from "./searchconsole.js";
import { buildSeoOpportunityPack } from "./seoOpportunities.js";
import { getInspectionMonitor } from "./urlInspectionJobs.js";
import { buildSitemapWarnings } from "./seoOpportunityHelpers.js";
import {
  getDateRangeForPresetId,
  clampSearchConsoleQueryRange,
} from "./searchConsoleDateRanges.js";
import {
  formatYearMonth,
  getCalendarMonthYmdBounds,
  humanMonthYear,
} from "./smmReportMonthRange.js";
import { buildUnifiedMarketingReportPdfBytes } from "./unifiedMarketingReportPdf.js";
import {
  buildUrlInspectionReportPdf,
  buildDeviceAppearanceReportPdf,
  buildQueryPageMatrixReportPdf,
  buildSitemapHealthReportPdf,
} from "./sectionReportPdf.js";

function normalizePlatformKey(value) {
  const p = String(value || "").trim().toLowerCase();
  if (p === "linkedin") return "";
  return p === "x" ? "tiktok" : p;
}

function siteFileSlug(url) {
  try {
    return new URL(url).hostname.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 48) || "site";
  } catch {
    return String(url || "site")
      .replace(/[^a-z0-9]+/gi, "-")
      .slice(0, 48);
  }
}

/** Fetch latest SMM baseline rows for a site key (same logic as /api/smm/baseline). */
export async function fetchSmmBaselines(siteKey) {
  const key = String(siteKey || "").trim();
  if (!key) return { siteUrl: null, baselines: [] };

  let resolvedSiteLink = key;
  const mappedSite = await prisma.site.findFirst({
    where: {
      OR: [{ facebookPageId: key }, { instagramUserId: key }, { siteUrl: key }],
    },
    select: { siteUrl: true },
  });
  if (mappedSite?.siteUrl) {
    resolvedSiteLink = mappedSite.siteUrl;
  } else {
    const mappedUser = await prisma.user.findFirst({
      where: { OR: [{ facebookPageId: key }, { instagramUserId: key }] },
      select: { siteLink: true },
    });
    if (mappedUser?.siteLink) resolvedSiteLink = mappedUser.siteLink;
  }

  const targetSiteNormalized = isMetaPageId(resolvedSiteLink)
    ? String(resolvedSiteLink).trim()
    : normalizeSiteOrigin(resolvedSiteLink);
  if (!targetSiteNormalized) return { siteUrl: null, baselines: [] };

  const equivalentSites = await resolveSiteEquivalents(prisma, key);
  if (!equivalentSites.includes(targetSiteNormalized)) equivalentSites.push(targetSiteNormalized);

  let ownerUser = await prisma.user.findFirst({
    where: {
      OR: [
        { siteLink: { in: equivalentSites } },
        { facebookPageId: { in: equivalentSites } },
        { instagramUserId: { in: equivalentSites } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!ownerUser) {
    const statOwner = await prisma.socialMediaDailyStat.findFirst({
      where: { siteLink: { in: equivalentSites } },
      orderBy: { statDate: "desc" },
      select: { userId: true },
    });
    ownerUser = statOwner?.userId ? { id: statOwner.userId } : null;
  }
  if (!ownerUser?.id) return { siteUrl: targetSiteNormalized, baselines: [] };

  const rawRows = await prisma.socialMediaDailyStat.findMany({
    where: { userId: ownerUser.id, siteLink: { in: equivalentSites } },
    orderBy: [{ statDate: "desc" }, { updatedAt: "desc" }],
  });

  const latestByPlatform = new Map();
  for (const row of rawRows) {
    const pk = normalizePlatformKey(row.platform);
    if (!pk) continue;
    const existing = latestByPlatform.get(pk);
    if (
      !existing ||
      new Date(row.statDate) > new Date(existing.statDate) ||
      Number(row.followers || 0) >= Number(existing.followers || 0)
    ) {
      latestByPlatform.set(pk, row);
    }
  }

  const baselines = Array.from(latestByPlatform.values()).map((row) => ({
    platform: row.platform,
    accountHandle: row.accountHandle || "",
    accountName: row.accountName || "",
    followers: Number(row.followers || 0),
  }));

  return { siteUrl: targetSiteNormalized, baselines };
}

async function fetchWebsiteStats(websiteUrl, reportMonth) {
  const bounds = getCalendarMonthYmdBounds(reportMonth);
  if (!bounds) return { errorNote: "Invalid month.", totals: null, topQueries: [], topPages: [] };

  try {
    const raw = await getSearchAnalytics(websiteUrl, bounds.startDate, bounds.endDate);
    const topQueries = await getTopQueries(websiteUrl, bounds.startDate, bounds.endDate, 50);
    const topPages = await getTopPages(websiteUrl, bounds.startDate, bounds.endDate, 50);
    return {
      periodLabel: `${bounds.startDate} → ${bounds.endDate}`,
      totals: {
        clicks: raw.totalClicks ?? 0,
        impressions: raw.totalImpressions ?? 0,
        averageCtr: raw.averageCtr ?? 0,
        averagePosition: raw.averagePosition ?? 0,
      },
      topQueries: topQueries?.queries || topQueries || [],
      topPages: topPages?.pages || topPages || [],
    };
  } catch (err) {
    return {
      periodLabel: `${bounds.startDate} → ${bounds.endDate}`,
      totals: null,
      topQueries: [],
      topPages: [],
      errorNote: err.message,
    };
  }
}

async function fetchSeoOpportunities(websiteUrl) {
  try {
    const pack = await buildSeoOpportunityPack(websiteUrl, "28d");
    return {
      strikingDistance: pack.strikingDistance || [],
      cannibalization: pack.cannibalization || [],
      decayingQueries: pack.decayingQueries || [],
      deviceGaps: pack.deviceGaps || null,
      sitemapWarnings: pack.sitemapWarnings || [],
    };
  } catch (err) {
    return { errorNote: err.message };
  }
}

async function fetchGscRangeData(websiteUrl, range = "28d") {
  let { startDate, endDate } = getDateRangeForPresetId(range);
  ({ startDate, endDate } = clampSearchConsoleQueryRange(startDate, endDate));
  const periodLabel = `${startDate} → ${endDate}`;
  const [devicesRes, appearancesRes, matrixData, sitemaps] = await Promise.all([
    getDeviceBreakdown(websiteUrl, startDate, endDate).catch(() => ({ devices: [] })),
    getSearchAppearanceBreakdown(websiteUrl, startDate, endDate).catch(() => ({ appearances: [] })),
    getQueryPageMatrix(websiteUrl, startDate, endDate, 100).catch(() => ({ pairs: [] })),
    getSitemaps(websiteUrl).catch(() => []),
  ]);
  const devices = devicesRes?.devices || devicesRes || [];
  const appearances = appearancesRes?.appearances || appearancesRes || [];
  const matrix = matrixData?.pairs || [];
  const warnings = buildSitemapWarnings(Array.isArray(sitemaps) ? sitemaps : sitemaps?.sitemaps || []);
  return { periodLabel, devices, appearances, matrix, sitemaps, warnings };
}

const SECTION_LABELS = {
  smm: "SMM statistics",
  website: "Website statistics",
  "seo-opportunities": "SEO opportunities",
  "url-inspection": "URL inspection",
  "sitemap-health": "Sitemap health",
  "device-appearance": "Device & appearance",
  "query-page-matrix": "Query × page matrix",
  full: "Full client report pack",
};

export function sectionLabel(section) {
  return SECTION_LABELS[section] || section;
}

/**
 * Build one PDF for a report section.
 * @param {string} section
 * @param {object} context - from resolveSiteReportContext
 * @param {object} [opts]
 */
export async function buildSectionReportPdf(section, context, opts = {}) {
  const reportMonth = opts.reportMonth || formatYearMonth(new Date());
  const propertyLabel = context.displayName || context.siteKey;
  const { baselines } = await fetchSmmBaselines(context.smmSiteKey);

  if (section === "smm") {
    return buildUnifiedMarketingReportPdfBytes({
      siteUrl: context.smmSiteKey,
      reportTitle: "SMM statistics report",
      smmPeriodLabel: humanMonthYear(reportMonth),
      smmPlatformCards: baselines,
      platformFilter: "all",
      websiteStats: null,
      seoOpportunities: null,
      includeSmm: true,
      includeWebsite: false,
      includeSeo: false,
    });
  }

  if (!context.includeWebsiteReports || !context.websiteUrl) {
    const err = new Error("Website reports are not available for this account (Meta-only without site/GTM link).");
    err.status = 400;
    throw err;
  }

  const websiteUrl = context.websiteUrl;

  if (section === "website") {
    const websiteStats = await fetchWebsiteStats(websiteUrl, reportMonth);
    return buildUnifiedMarketingReportPdfBytes({
      siteUrl: websiteUrl,
      reportTitle: "Website statistics report",
      smmPeriodLabel: humanMonthYear(reportMonth),
      smmPlatformCards: [],
      platformFilter: "all",
      websiteStats,
      seoOpportunities: null,
      includeSmm: false,
      includeWebsite: true,
      includeSeo: false,
    });
  }

  if (section === "seo-opportunities") {
    const seoOpportunities = await fetchSeoOpportunities(websiteUrl);
    return buildUnifiedMarketingReportPdfBytes({
      siteUrl: websiteUrl,
      reportTitle: "SEO opportunities report",
      smmPeriodLabel: "Last 28 days",
      smmPlatformCards: [],
      platformFilter: "all",
      websiteStats: null,
      seoOpportunities,
      includeSmm: false,
      includeWebsite: false,
      includeSeo: true,
    });
  }

  if (section === "url-inspection") {
    const monitor = await getInspectionMonitor(websiteUrl, null);
    return buildUrlInspectionReportPdf({ siteUrl: websiteUrl, monitor });
  }

  if (section === "device-appearance") {
    const { periodLabel, devices, appearances } = await fetchGscRangeData(websiteUrl);
    return buildDeviceAppearanceReportPdf({
      siteUrl: websiteUrl,
      periodLabel,
      devices: Array.isArray(devices) ? devices : devices?.devices || [],
      appearances: Array.isArray(appearances) ? appearances : appearances?.appearances || [],
    });
  }

  if (section === "query-page-matrix") {
    const { periodLabel, matrix } = await fetchGscRangeData(websiteUrl);
    return buildQueryPageMatrixReportPdf({
      siteUrl: websiteUrl,
      periodLabel,
      rows: matrix || [],
    });
  }

  if (section === "sitemap-health") {
    const { sitemaps, warnings } = await fetchGscRangeData(websiteUrl);
    return buildSitemapHealthReportPdf({ siteUrl: websiteUrl, sitemaps, warnings });
  }

  if (section === "full") {
    const websiteStats = await fetchWebsiteStats(websiteUrl, reportMonth);
    const seoOpportunities = await fetchSeoOpportunities(websiteUrl);
    return buildUnifiedMarketingReportPdfBytes({
      siteUrl: websiteUrl,
      reportTitle: "Client marketing report",
      smmPeriodLabel: humanMonthYear(reportMonth),
      smmPlatformCards: baselines,
      platformFilter: "all",
      websiteStats,
      seoOpportunities,
      includeSmm: true,
      includeWebsite: true,
      includeSeo: true,
    });
  }

  const err = new Error(`Unknown report section: ${section}`);
  err.status = 400;
  throw err;
}

/**
 * Build all PDF attachments for a client report pack.
 * @returns {Promise<{ filename: string, content: Buffer, section: string }[]>}
 */
export async function buildClientReportPack(siteKey, opts = {}) {
  const context = await resolveSiteReportContext(prisma, siteKey);
  const sections = opts.sections || sectionsForClientPack(context);
  const reportMonth = opts.reportMonth || formatYearMonth(new Date());
  const slug = siteFileSlug(context.websiteUrl || context.smmSiteKey);
  const attachments = [];

  for (const section of sections) {
    try {
      const bytes = await buildSectionReportPdf(section, context, { reportMonth });
      attachments.push({
        section,
        filename: `${section}-report-${slug}-${reportMonth}.pdf`,
        content: Buffer.from(bytes),
      });
    } catch (err) {
      if (section === "smm") throw err;
      attachments.push({
        section,
        filename: `${section}-report-${slug}-${reportMonth}.pdf`,
        error: err.message,
      });
    }
  }

  return { context, attachments, reportMonth };
}

/** Collect unique site keys assigned to active approvers. */
export async function listApproverReportTargets() {
  const approvers = await prisma.user.findMany({
    where: {
      role: ROLES.APPROVER,
      isActive: true,
      deletedAt: null,
      emailVerified: true,
    },
    select: {
      id: true,
      email: true,
      name: true,
      siteLink: true,
      facebookPageId: true,
      instagramUserId: true,
      accessibleSites: { select: { siteLink: true } },
    },
  });

  const targets = [];
  const seen = new Set();

  for (const approver of approvers) {
    if (!approver.email) continue;
    const siteKeys = new Set();
    if (approver.siteLink) siteKeys.add(approver.siteLink.trim());
    if (approver.facebookPageId) siteKeys.add(String(approver.facebookPageId).trim());
    if (approver.instagramUserId) siteKeys.add(String(approver.instagramUserId).trim());
    for (const s of approver.accessibleSites || []) {
      if (s.siteLink) siteKeys.add(s.siteLink.trim());
    }

    for (const siteKey of siteKeys) {
      const dedupe = `${approver.email}::${siteKey}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      targets.push({ approver, siteKey });
    }
  }

  return targets;
}

/** Find approver emails that should receive reports for a site key. */
export async function findApproversForSiteKey(siteKey) {
  const key = String(siteKey || "").trim();
  const equivalents = await resolveSiteEquivalents(prisma, key);
  if (!equivalents.includes(key)) equivalents.push(key);

  const approvers = await prisma.user.findMany({
    where: { role: ROLES.APPROVER, isActive: true, deletedAt: null, emailVerified: true },
    select: {
      email: true,
      name: true,
      siteLink: true,
      facebookPageId: true,
      instagramUserId: true,
      accessibleSites: { select: { siteLink: true } },
    },
  });

  const recipients = [];
  const seen = new Set();
  for (const a of approvers) {
    if (!a.email || seen.has(a.email)) continue;
    const keys = [
      a.siteLink,
      a.facebookPageId,
      a.instagramUserId,
      ...(a.accessibleSites || []).map((s) => s.siteLink),
    ]
      .map((k) => String(k || "").trim())
      .filter(Boolean);

    const match = keys.some((k) => equivalents.includes(k) || equivalents.some((e) => e === k));
    if (match) {
      seen.add(a.email);
      recipients.push({ email: a.email, name: a.name });
    }
  }
  return recipients;
}

export { siteFileSlug, sectionLabel as getSectionLabel };
