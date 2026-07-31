/**
 * Gather GSC + SE Ranking + audit + countries for website slide decks.
 * Soft-fails each source so the deck still builds.
 */
import { getSearchAnalyticsTimeSeries, getTopQueries, getTopPages, getTopCountries } from "../searchconsole.js";
import { loadSeoOverview, loadBacklinks } from "../seranking/loadBundle.js";
import { getLatestSiteAudit } from "../siteAuditJobs.js";
import { buildSeoOpportunityPack } from "../seoOpportunities.js";
import { isMetaPageId } from "../siteAccess.js";
import { normalizeSiteOrigin } from "../validation.js";

function ymd(d) {
  const x = d instanceof Date ? d : new Date(d);
  return x.toISOString().slice(0, 10);
}

function monthBounds(reportMonth) {
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth();
  if (reportMonth && /^\d{4}-\d{2}$/.test(reportMonth)) {
    const [yy, mm] = reportMonth.split("-").map(Number);
    y = yy;
    m = mm - 1;
  }
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 0));
  return { startDate: ymd(start), endDate: ymd(end), label: start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) };
}

function soft(label, promise) {
  return promise
    .then((data) => ({ ok: true, label, data }))
    .catch((err) => ({ ok: false, label, error: err?.message || String(err), data: null }));
}

export async function assembleWebsiteReportData(siteKey, { reportMonth = null, includeInternal = false } = {}) {
  const key = String(siteKey || "").trim();
  const isMeta = isMetaPageId(key);
  const siteUrl = isMeta ? null : normalizeSiteOrigin(key) || key;
  const period = monthBounds(reportMonth);

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
    soft("gsc-series", getSearchAnalyticsTimeSeries(siteUrl, period.startDate, period.endDate)),
    soft("gsc-queries", getTopQueries(siteUrl, period.startDate, period.endDate, 25)),
    soft("gsc-pages", getTopPages(siteUrl, period.startDate, period.endDate, 20)),
    soft("gsc-countries", getTopCountries(siteUrl, period.startDate, period.endDate, 40)),
    soft("seranking", loadSeoOverview(siteUrl).catch(() => null)),
    soft("backlinks", loadBacklinks(siteUrl).catch(() => null)),
    soft("audit", getLatestSiteAudit(siteUrl).catch(() => null)),
    includeInternal
      ? soft("opportunities", buildSeoOpportunityPack(siteUrl).catch(() => null))
      : Promise.resolve({ ok: true, label: "opportunities", data: null }),
  ]);

  const byLabel = Object.fromEntries(jobs.map((j) => [j.label, j]));

  for (const j of jobs) {
    if (!j.ok) result.errors.push(`${j.label}: ${j.error}`);
  }

  const series = byLabel["gsc-series"]?.data;
  const queries = byLabel["gsc-queries"]?.data;
  const pages = byLabel["gsc-pages"]?.data;
  const countries = byLabel["gsc-countries"]?.data;

  const clicks = Number(series?.totals?.clicks) || 0;
  const impressions = Number(series?.totals?.impressions) || 0;
  const ctr = Number(series?.totals?.averageCtr) || (impressions > 0 ? clicks / impressions : 0);
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
  result.countries = countries?.countries || [];

  const seo = byLabel.seranking?.data;
  result.seranking = seo
    ? {
        overview: seo.overview || null,
        keywords: seo.keywords || [],
        competitors: seo.competitors || [],
      }
    : null;
  result.backlinks =
    byLabel.backlinks?.data?.summary || seo?.backlinks || byLabel.backlinks?.data || null;
  result.audit = byLabel.audit?.data?.snapshot || byLabel.audit?.data || null;
  result.opportunities = byLabel.opportunities?.data || null;

  return result;
}
