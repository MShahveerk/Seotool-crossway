/**
 * Google Search Console indexing data for Site Explorer (sitemaps, inspection, performance).
 */
import { getSitemaps, getTopPages } from "./searchconsole.js";
import { getInspectionMonitor } from "./urlInspectionJobs.js";
import { getDateRangeForPresetId } from "./searchConsoleDateRanges.js";
import { normalizeSiteOrigin } from "./validation.js";

function normalizePageUrl(url) {
  try {
    return new URL(String(url)).href.replace(/\/$/, "").toLowerCase();
  } catch {
    return String(url || "").toLowerCase();
  }
}

function formatCaptureDate(value) {
  if (!value) return null;
  try {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

export async function fetchGscIndexingData(siteUrl) {
  const normalized = normalizeSiteOrigin(siteUrl) || siteUrl;
  const { startDate, endDate } = getDateRangeForPresetId("28d");

  const [sitemapsResult, monitor, topPagesResult] = await Promise.all([
    getSitemaps(normalized).catch((err) => ({ sitemaps: [], error: err.message })),
    getInspectionMonitor(normalized).catch((err) => ({
      snapshot: null,
      indexed: [],
      notIndexed: [],
      unknown: [],
      errors: [],
      error: err.message,
    })),
    getTopPages(normalized, startDate, endDate, 1000).catch((err) => ({ pages: [], error: err.message })),
  ]);

  return { siteUrl: normalized, sitemapsResult, monitor, topPagesResult };
}

function buildPagesFromGsc({ monitor, topPagesResult }) {
  const byUrl = new Map();

  for (const row of [
    ...(monitor.indexed || []),
    ...(monitor.notIndexed || []),
    ...(monitor.unknown || []),
  ]) {
    const key = normalizePageUrl(row.url);
    byUrl.set(key, {
      url: row.url,
      status: row.category === "indexed" ? "Indexed" : row.coverageState || row.category,
      coverageState: row.coverageState,
      pageFetchState: row.pageFetchState,
      captured: formatCaptureDate(row.lastCrawlTime),
      timestamp: row.lastCrawlTime,
      source: "gsc-inspection",
      indexed: row.category === "indexed",
    });
  }

  for (const p of topPagesResult.pages || []) {
    const key = normalizePageUrl(p.page);
    const existing = byUrl.get(key);
    if (existing) {
      existing.clicks = p.clicks;
      existing.impressions = p.impressions;
      existing.position = p.position;
    } else {
      byUrl.set(key, {
        url: p.page,
        status: "In search results",
        captured: null,
        source: "gsc-performance",
        clicks: p.clicks,
        impressions: p.impressions,
        position: p.position,
        indexed: null,
      });
    }
  }

  const pages = Array.from(byUrl.values());
  pages.sort((a, b) => {
    if (a.indexed && !b.indexed) return -1;
    if (!a.indexed && b.indexed) return 1;
    return (b.impressions || 0) - (a.impressions || 0);
  });

  return pages;
}

export function buildOverviewFromGsc({ sitemapsResult, monitor, topPagesResult, pages }) {
  const sitemaps = sitemapsResult.sitemaps || [];
  const sitemapUrlCount = sitemaps.reduce((sum, s) => sum + (s.contentsCount || 0), 0);
  const snap = monitor.snapshot;

  const inspectionResults = [
    ...(monitor.indexed || []),
    ...(monitor.notIndexed || []),
    ...(monitor.unknown || []),
    ...(monitor.errors || []),
  ];

  const withFetch = inspectionResults.filter((r) => r.pageFetchState);
  const fetchOk = withFetch.filter((r) => String(r.pageFetchState).toUpperCase() === "SUCCESSFUL").length;
  const http200Rate = withFetch.length ? fetchOk / withFetch.length : null;

  const coverageBreakdown = {};
  for (const r of inspectionResults) {
    const key = r.coverageState || r.category || "Unknown";
    coverageBreakdown[key] = (coverageBreakdown[key] || 0) + 1;
  }

  const pagesInSearch = (topPagesResult.pages || []).length;
  const indexedUrls =
    sitemapUrlCount ||
    snap?.indexedCount ||
    pages.filter((p) => p.indexed).length ||
    pagesInSearch;

  const lastSubmitted = sitemaps
    .map((s) => s.lastSubmitted)
    .filter(Boolean)
    .sort()
    .reverse()[0];
  const lastCapture = snap?.finishedAt || lastSubmitted;

  return {
    indexedUrls,
    sitemapUrlCount,
    pagesInSearch,
    inspectionIndexed: snap?.indexedCount ?? null,
    inspectionTotal: snap?.totalUrls ?? null,
    http200Rate,
    statusBreakdown: coverageBreakdown,
    mimeBreakdown: {},
    lastCapture: formatCaptureDate(lastCapture),
    source: "gsc",
  };
}

/**
 * Merge GSC indexing into a site-explorer API payload (overview + pages tab).
 */
export async function enrichSiteExplorerWithGsc(payload, siteUrl, { view, page = 1, pageSize = 50 } = {}) {
  if (!siteUrl) return payload;

  try {
    const gscData = await fetchGscIndexingData(siteUrl);
    const { sitemapsResult, monitor, topPagesResult } = gscData;

    const hasAnyData =
      (sitemapsResult.sitemaps || []).length > 0 ||
      monitor.snapshot ||
      (monitor.indexed || []).length > 0 ||
      (topPagesResult.pages || []).length > 0;

    if (!hasAnyData && sitemapsResult.error && monitor.error && topPagesResult.error) {
      payload.gsc = {
        available: false,
        error: sitemapsResult.error || monitor.error || topPagesResult.error,
      };
      return payload;
    }

    const allPages = buildPagesFromGsc({ monitor, topPagesResult });
    const gscOverview = buildOverviewFromGsc({ sitemapsResult, monitor, topPagesResult, pages: allPages });

    const ccIndexed = payload.overview?.indexedUrls || 0;
    const ccHasPages = (payload.items || []).length > 0;

    if (!payload.overview) payload.overview = {};
    if (gscOverview.indexedUrls > 0 || !ccIndexed) {
      payload.overview = { ...payload.overview, ...gscOverview };
    }

    payload.gsc = {
      available: true,
      siteUrl: gscData.siteUrl,
      sitemapCount: (sitemapsResult.sitemaps || []).length,
      sitemapUrlCount: gscOverview.sitemapUrlCount,
      inspectionRunDate: monitor.snapshot?.runDate,
      pagesInSearch: gscOverview.pagesInSearch,
      inspectionIndexed: gscOverview.inspectionIndexed,
      inspectionTotal: gscOverview.inspectionTotal,
    };

    if (view === "pages" && (allPages.length > 0 && (!ccHasPages || !ccIndexed || allPages.length >= ccHasPages))) {
      const start = (page - 1) * pageSize;
      payload.items = allPages.slice(start, start + pageSize);
      payload.totalPages = allPages.length;
      payload.pageSource = "gsc";
    }

    const notes = [...(payload.notes || [])];
    if (!notes.some((n) => n.includes("Search Console"))) {
      notes.unshift(
        "Indexed pages and coverage from Google Search Console (sitemaps, URL inspection, and search performance)."
      );
    }
    payload.notes = notes;
  } catch (err) {
    console.warn("GSC site explorer enrich failed:", err?.message || err);
    payload.gsc = { available: false, error: err.message || String(err) };
  }

  return payload;
}
