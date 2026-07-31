/**
 * Gather GSC + SE Ranking + audit + countries for website slide decks.
 * Soft-fails each source so the deck still builds.
 */
import { getSearchAnalyticsTimeSeries, getTopQueries, getTopPages, getTopCountries } from "../searchconsole.js";
import { getDateRangeForPresetId } from "../searchConsoleDateRanges.js";
import { loadSeoOverview, loadBacklinks } from "../seranking/loadBundle.js";
import { getCachedSnapshot } from "../seranking/cache.js";
import { DATA_TYPES } from "../seranking/config.js";
import { normalizeAuditReport, normalizeBacklinksSummary } from "../seranking/normalize.js";
import { resolveSerankingTarget } from "../seranking/resolveTarget.js";
import { getLatestSiteAudit } from "../siteAuditJobs.js";
import { buildSeoOpportunityPack } from "../seoOpportunities.js";
import { isMetaPageId } from "../siteAccess.js";
import { normalizeSiteOrigin } from "../validation.js";

function ymd(d) {
  const x = d instanceof Date ? d : new Date(d);
  return x.toISOString().slice(0, 10);
}

/**
 * Prefer rolling 28d (app default) for current/incomplete months so maps & KPIs
 * aren't empty. Past calendar months use the full month window.
 */
function reportPeriod(reportMonth) {
  const now = new Date();
  const rolling = getDateRangeForPresetId("28d", now);
  const rollingLabel = `${rolling.startDate} to ${rolling.endDate}`;

  if (reportMonth && /^\d{4}-\d{2}$/.test(reportMonth)) {
    const [yy, mm] = reportMonth.split("-").map(Number);
    const isCurrent =
      yy === now.getUTCFullYear() && mm === now.getUTCMonth() + 1;
    if (!isCurrent) {
      const start = new Date(Date.UTC(yy, mm - 1, 1));
      const end = new Date(Date.UTC(yy, mm, 0));
      return {
        startDate: ymd(start),
        endDate: ymd(end),
        label: start.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }),
        mode: "calendar",
      };
    }
  }

  return {
    startDate: rolling.startDate,
    endDate: rolling.endDate,
    label: `Last 28 days (${rollingLabel})`,
    mode: "28d",
  };
}

function soft(label, promise) {
  return promise
    .then((data) => ({ ok: true, label, data }))
    .catch((err) => ({
      ok: false,
      label,
      error: err?.message || String(err),
      data: null,
    }));
}

function flattenSerankingIssues(normalized) {
  if (!normalized?.sections?.length) return [];
  const out = [];
  for (const sec of normalized.sections) {
    for (const chk of sec.checks || []) {
      const fix = Array.isArray(chk.fixSteps)
        ? chk.fixSteps.join(" ")
        : chk.fixSteps || "";
      out.push({
        title: chk.title || chk.name || chk.code || "Issue",
        severity: chk.type || chk.severity || "notice",
        count: chk.count,
        section: sec.name || chk.category || "",
        description: chk.description || chk.impact || "",
        fixSteps: fix,
      });
    }
  }
  const order = { error: 0, warning: 1, notice: 2 };
  return out.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
}

function normalizeInternalAudit(snapshot) {
  if (!snapshot) return null;
  const payload = snapshot.payload || {};
  const counts = payload.counts || {};
  const critical =
    snapshot.criticalCount ?? counts.critical ?? payload.criticalCount ?? 0;
  const warning =
    snapshot.warningCount ?? counts.warning ?? payload.warningCount ?? 0;
  const notice =
    snapshot.noticeCount ?? counts.notice ?? payload.noticeCount ?? 0;
  const issues = (payload.issues || []).map((iss) => ({
    title: iss.title || iss.name || "Issue",
    severity: iss.severity || "notice",
    count: iss.count ?? (Array.isArray(iss.pages) ? iss.pages.length : null),
    description: iss.description || "",
    fixSteps: Array.isArray(iss.fixSteps)
      ? iss.fixSteps.join(" ")
      : iss.fixSteps || "",
    pages: (iss.pages || []).slice(0, 3).map((p) => p.url || p).filter(Boolean),
  }));
  return {
    source: "internal",
    score: snapshot.healthScore ?? payload.healthScore ?? null,
    totalPages: snapshot.totalPages ?? payload.stats?.pagesCrawled ?? null,
    critical,
    warning,
    notice,
    passed: null,
    issues,
    stats: payload.stats || null,
  };
}

async function loadSerankingAuditCached(siteUrl) {
  let cacheSite = siteUrl;
  try {
    cacheSite = resolveSerankingTarget(siteUrl)?.cacheSite || siteUrl;
  } catch {
    /* keep siteUrl */
  }
  const cached = await getCachedSnapshot(cacheSite, DATA_TYPES.AUDIT_REPORT);
  if (!cached?.payload) return null;
  const normalized =
    cached.payload.normalized ||
    normalizeAuditReport(cached.payload.report || cached.payload);
  if (!normalized?.hasData && normalized?.score == null) return null;
  return {
    source: "seranking",
    score: normalized.score,
    totalPages: normalized.totalPages,
    critical: normalized.totalErrors,
    warning: normalized.totalWarnings,
    notice: normalized.totalNotices,
    passed: normalized.totalPassed,
    issues: flattenSerankingIssues(normalized),
    sections: normalized.sections || [],
    fetchedAt: cached.fetchedAt,
  };
}

export async function assembleWebsiteReportData(
  siteKey,
  { reportMonth = null, includeInternal = false } = {}
) {
  const key = String(siteKey || "").trim();
  const isMeta = isMetaPageId(key);
  const siteUrl = isMeta ? null : normalizeSiteOrigin(key) || key;
  const period = reportPeriod(reportMonth);

  const result = {
    siteKey: key,
    siteUrl,
    isMeta,
    period,
    gsc: null,
    countries: [],
    seranking: null,
    backlinks: null,
    audit: null,
    opportunities: null,
    errors: [],
  };

  if (!siteUrl || isMeta) {
    result.errors.push("Website reports require a website URL (not Meta-only).");
    return result;
  }

  const jobs = await Promise.all([
    soft(
      "gsc-series",
      getSearchAnalyticsTimeSeries(siteUrl, period.startDate, period.endDate)
    ),
    soft(
      "gsc-queries",
      getTopQueries(siteUrl, period.startDate, period.endDate, 25)
    ),
    soft(
      "gsc-pages",
      getTopPages(siteUrl, period.startDate, period.endDate, 20)
    ),
    soft(
      "gsc-countries",
      getTopCountries(siteUrl, period.startDate, period.endDate, 40)
    ),
    soft("seranking", loadSeoOverview(siteUrl).catch(() => null)),
    soft("backlinks", loadBacklinks(siteUrl, { allowManual: true }).catch(() => null)),
    soft("audit-internal", getLatestSiteAudit(siteUrl).catch(() => null)),
    soft("audit-seranking", loadSerankingAuditCached(siteUrl).catch(() => null)),
    includeInternal
      ? soft("opportunities", buildSeoOpportunityPack(siteUrl).catch(() => null))
      : Promise.resolve({ ok: true, label: "opportunities", data: null }),
  ]);

  const byLabel = Object.fromEntries(jobs.map((j) => [j.label, j]));

  for (const j of jobs) {
    if (!j.ok) result.errors.push(`${j.label}: ${j.error}`);
  }

  const series = byLabel["gsc-series"]?.ok ? byLabel["gsc-series"].data : null;
  const queries = byLabel["gsc-queries"]?.ok ? byLabel["gsc-queries"].data : null;
  const pages = byLabel["gsc-pages"]?.ok ? byLabel["gsc-pages"].data : null;
  let countries = byLabel["gsc-countries"]?.ok
    ? byLabel["gsc-countries"].data
    : null;

  if (series) {
    const clicks = Number(series?.totals?.clicks) || 0;
    const impressions = Number(series?.totals?.impressions) || 0;
    const ctr =
      Number(series?.totals?.averageCtr) ||
      (impressions > 0 ? clicks / impressions : 0);
    const position = Number(series?.totals?.averagePosition) || 0;
    result.gsc = {
      clicks,
      impressions,
      ctr,
      position,
      timeSeries: series?.timeSeries || [],
      topQueries: queries?.queries || [],
      topPages: pages?.pages || [],
    };
  }

  result.countries = countries?.countries || [];

  // Fallback: if calendar month yielded no country traffic, retry last 28d once
  if (!result.countries.length && period.mode === "calendar") {
    const rolling = getDateRangeForPresetId("28d", new Date());
    try {
      const retry = await getTopCountries(
        siteUrl,
        rolling.startDate,
        rolling.endDate,
        40
      );
      if (retry?.countries?.length) {
        result.countries = retry.countries;
        result.period = {
          ...rolling,
          label: `Last 28 days (${rolling.startDate} to ${rolling.endDate})`,
          mode: "28d-fallback",
        };
        if (!result.gsc) {
          const seriesRetry = await getSearchAnalyticsTimeSeries(
            siteUrl,
            rolling.startDate,
            rolling.endDate
          ).catch(() => null);
          if (seriesRetry) {
            const clicks = Number(seriesRetry?.totals?.clicks) || 0;
            const impressions = Number(seriesRetry?.totals?.impressions) || 0;
            result.gsc = {
              clicks,
              impressions,
              ctr:
                Number(seriesRetry?.totals?.averageCtr) ||
                (impressions > 0 ? clicks / impressions : 0),
              position: Number(seriesRetry?.totals?.averagePosition) || 0,
              timeSeries: seriesRetry?.timeSeries || [],
              topQueries: result.gsc?.topQueries || [],
              topPages: result.gsc?.topPages || [],
            };
          }
        }
      }
    } catch (err) {
      result.errors.push(`gsc-countries-fallback: ${err?.message || err}`);
    }
  }

  const seo = byLabel.seranking?.data;
  result.seranking = seo
    ? {
        overview: seo.overview || null,
        keywords: seo.keywords || [],
        competitors: seo.competitors || [],
      }
    : null;

  const blRaw = byLabel.backlinks?.data;
  result.backlinks =
    blRaw?.summary ||
    normalizeBacklinksSummary(blRaw?.data || blRaw) ||
    seo?.backlinks ||
    null;

  // Prefer SE Ranking audit (matches app primary UI); fall back to internal crawl
  const seAudit = byLabel["audit-seranking"]?.data || null;
  const internalSnap =
    byLabel["audit-internal"]?.data?.snapshot ||
    byLabel["audit-internal"]?.data ||
    null;
  result.audit = seAudit || normalizeInternalAudit(internalSnap);
  result.auditInternal = normalizeInternalAudit(internalSnap);
  result.opportunities = byLabel.opportunities?.data || null;

  return result;
}
