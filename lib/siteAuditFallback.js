/**
 * Supplemental Site Audit when the external HTTP crawler is blocked or incomplete.
 * Pulls homepage SEO from PageSpeed (Google fetch) + indexing/sitemap signals from GSC.
 */
import { getPageSpeedSnapshot } from "./pagespeedJobs.js";
import { getActionSteps } from "./pagespeedActionGuides.js";
import { getSitemaps } from "./searchconsole.js";
import { getInspectionMonitor } from "./urlInspectionJobs.js";
import { buildSitemapWarnings } from "./seoOpportunityHelpers.js";

const MAX_GSC_URLS = 30;

export function shouldUseSupplementalAudit(snapshot) {
  if (!snapshot) return true;
  const q = snapshot.stats?.crawlQuality;
  if (q === "blocked" || q === "incomplete") return true;
  if (q === "partial" && (snapshot.totalPages || 0) <= 3) return true;
  return false;
}

function stripMarkdown(text) {
  return String(text || "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function psiSeverity(audit) {
  if (audit.score == null) return "notice";
  if (audit.score < 0.5) return "critical";
  if (audit.score < 0.9) return "warning";
  return "notice";
}

function issuesFromPageSpeed(payload, fetchedAt) {
  if (!payload?.categories?.seo) return { seoScore: null, finalUrl: null, fetchedAt, issues: [] };

  const cat = payload.categories.seo;
  const audits = payload.audits || {};
  const ids = [...new Set([...(cat.diagnostics || []), ...(cat.opportunities || [])])];
  const pageUrl = payload.finalUrl || payload.analyzedUrl;
  const issues = [];

  for (const id of ids) {
    const audit = audits[id];
    if (!audit || audit.scoreDisplayMode === "notApplicable") continue;
    if (audit.score != null && audit.score >= 0.9) continue;

    issues.push({
      id: `psi-${id}`,
      severity: psiSeverity(audit),
      title: audit.title || id,
      description: stripMarkdown(audit.description) || "Failed Lighthouse SEO check on the homepage (Google PageSpeed).",
      fixSteps: getActionSteps(id) || [
        "Open PageSpeed Insights in this dashboard for full audit details.",
        "Fix the flagged element on the homepage, then re-run PageSpeed.",
      ],
      count: 1,
      pages: [{ url: pageUrl, detail: audit.displayValue || null }],
      source: "pagespeed",
    });
  }

  return {
    seoScore: payload.scores?.seo ?? cat.score ?? null,
    finalUrl: pageUrl,
    fetchedAt,
    issues,
  };
}

const GSC_SITEMAP_FIX = {
  missing: [
    "Confirm the live sitemap at /sitemap.xml or /wp-sitemap.xml returns HTTP 200.",
    "In Google Search Console → Sitemaps, submit the full sitemap URL for this property.",
    "Use Sitemap Health in this dashboard to resubmit after it appears in GSC.",
  ],
  pending: [
    "Open Sitemap Health and confirm the sitemap URL loads without redirects or 403.",
    "Wait 24–48 hours — pending usually clears once Google finishes reading the feed.",
  ],
  stale: [
    "Regenerate the sitemap in WordPress/your CMS after recent publishes.",
    "Resubmit the sitemap in Search Console or via Sitemap Health in this dashboard.",
  ],
};

function issuesFromGsc(sitemapsResult, monitor) {
  const issues = [];
  const sitemaps = sitemapsResult?.sitemaps || [];

  if (sitemapsResult?.error) {
    issues.push({
      id: "gsc-unavailable",
      severity: "notice",
      title: "Search Console data unavailable",
      description: sitemapsResult.error,
      fixSteps: [
        "Ensure this site is added to Google Search Console and the service account has access.",
        "Use the same property URL format (https vs sc-domain) as in GSC.",
      ],
      count: 1,
      pages: [],
      source: "gsc",
    });
    return { sitemaps: [], inspection: null, issues };
  }

  for (const w of buildSitemapWarnings(sitemaps)) {
    issues.push({
      id: `gsc-sitemap-${w.type}`,
      severity: w.severity === "high" ? "critical" : "warning",
      title:
        w.type === "missing"
          ? "No sitemap submitted in Search Console"
          : w.type === "pending"
            ? "Sitemap pending in Google"
            : "Sitemap submission is stale",
      description: w.message,
      fixSteps: GSC_SITEMAP_FIX[w.type] || [],
      count: 1,
      pages: [],
      source: "gsc",
    });
  }

  const snap = monitor?.snapshot;
  const notIndexed = monitor?.notIndexed || [];
  if (notIndexed.length) {
    issues.push({
      id: "gsc-not-indexed",
      severity: "critical",
      title: "URLs not indexed (Search Console sample)",
      description: `${notIndexed.length} URL(s) from your latest Google URL Inspection batch are not indexed. This reflects Google's view, not a full crawl of every page.`,
      fixSteps: [
        "Open URL Inspection in this dashboard and review each URL's coverage reason.",
        "Fix noindex tags, robots.txt blocks, canonical mistakes, or soft-404 content.",
        "After fixing, use URL Inspection → Request indexing on priority pages.",
        "Enable daily URL Inspection (SEO_URL_INSPECT_DAILY) for ongoing monitoring.",
      ],
      count: notIndexed.length,
      pages: notIndexed.slice(0, MAX_GSC_URLS).map((r) => ({
        url: r.url,
        detail: r.cause || r.coverageState || r.verdict,
      })),
      source: "gsc",
    });
  }

  const errors = monitor?.errors || [];
  if (errors.length) {
    issues.push({
      id: "gsc-inspection-errors",
      severity: "warning",
      title: "URL Inspection errors",
      description: `${errors.length} URL(s) could not be inspected by Google in the latest daily batch.`,
      fixSteps: ["Check URL Inspection monitor for details and retry after fixing fetch/block issues."],
      count: errors.length,
      pages: errors.slice(0, MAX_GSC_URLS).map((r) => ({
        url: r.url,
        detail: r.errorMessage || r.cause,
      })),
      source: "gsc",
    });
  }

  return {
    sitemaps: sitemaps.map((s) => ({
      path: s.path,
      isPending: s.isPending,
      lastSubmitted: s.lastSubmitted,
      contentsCount: s.contentsCount,
    })),
    inspection: snap
      ? {
          runDate: snap.runDate,
          totalUrls: snap.totalUrls,
          indexedCount: snap.indexedCount,
          notIndexedCount: snap.notIndexedCount,
          unknownCount: snap.unknownCount,
          errorCount: snap.errorCount,
        }
      : null,
    issues,
  };
}

/**
 * Build supplemental audit payload for API + UI.
 */
export async function buildSupplementalAudit(siteUrl) {
  const errors = [];
  let pagespeed = null;
  let gsc = null;

  if (process.env.PAGESPEED_API_KEY?.trim()) {
    try {
      const { snapshot } = await getPageSpeedSnapshot(siteUrl, "mobile", { forceRefresh: false });
      pagespeed = issuesFromPageSpeed(snapshot.payload, snapshot.fetchedAt);
    } catch (err) {
      errors.push({ source: "pagespeed", message: err.message || "PageSpeed fetch failed" });
    }
  } else {
    errors.push({ source: "pagespeed", message: "PAGESPEED_API_KEY is not configured." });
  }

  try {
    const [sitemapsResult, monitor] = await Promise.all([
      getSitemaps(siteUrl)
        .then((data) => ({ sitemaps: data.sitemaps || [] }))
        .catch((err) => ({ sitemaps: [], error: err.message || "Search Console sitemap fetch failed" })),
      getInspectionMonitor(siteUrl).catch((err) => ({
        snapshot: null,
        indexed: [],
        notIndexed: [],
        unknown: [],
        errors: [],
        error: err.message,
      })),
    ]);

    if (monitor.error) {
      errors.push({ source: "gsc-inspection", message: monitor.error });
    }
    gsc = issuesFromGsc(sitemapsResult, monitor);
  } catch (err) {
    errors.push({ source: "gsc", message: err.message || "Search Console fetch failed" });
    gsc = { sitemaps: [], inspection: null, issues: [] };
  }

  const issues = [...(pagespeed?.issues || []), ...(gsc?.issues || [])];
  const counts = { critical: 0, warning: 0, notice: 0 };
  for (const issue of issues) {
    counts[issue.severity] += issue.count || 1;
  }

  return {
    mode: "supplemental",
    label: "Supplemental audit — Google PageSpeed + Search Console",
    description:
      "Full external crawl was blocked or incomplete. These results use Google's homepage fetch (PageSpeed) and Search Console indexing data — not a sitewide HTML crawl.",
    generatedAt: new Date().toISOString(),
    pagespeed: pagespeed
      ? {
          seoScore: pagespeed.seoScore,
          finalUrl: pagespeed.finalUrl,
          fetchedAt: pagespeed.fetchedAt,
          issueCount: pagespeed.issues.length,
        }
      : null,
    gsc,
    issues,
    counts,
    errors,
    available: Boolean(pagespeed?.issues?.length || gsc?.issues?.length || gsc?.inspection || gsc?.sitemaps?.length),
  };
}
