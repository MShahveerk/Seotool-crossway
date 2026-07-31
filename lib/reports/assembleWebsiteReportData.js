/**
 * Gather GSC + SE Ranking + audit + authority + PageSpeed for website decks.
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
import { getAuthorityScores, getAuthorityTrend, toDomain, toScore100 } from "../authority.js";
import { getPageSpeedSnapshot } from "../pagespeedJobs.js";
import { serankingCacheSiteForTarget } from "../seranking/domain.js";
import { isMetaPageId } from "../siteAccess.js";
import { normalizeSiteOrigin } from "../validation.js";
import prisma from "../prisma.js";
import { loadPublishedBlogsForReport } from "./loadPublishedBlogs.js";

function ymd(d) {
  const x = d instanceof Date ? d : new Date(d);
  return x.toISOString().slice(0, 10);
}

function formatYearMonthSafe(period) {
  if (period?.startDate && /^\d{4}-\d{2}/.test(period.startDate)) {
    return period.startDate.slice(0, 7);
  }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function reportPeriod(reportMonth) {
  const now = new Date();
  const rolling = getDateRangeForPresetId("28d", now);
  const rollingLabel = `${rolling.startDate} to ${rolling.endDate}`;

  if (reportMonth && /^\d{4}-\d{2}$/.test(reportMonth)) {
    const [yy, mm] = reportMonth.split("-").map(Number);
    const isCurrent = yy === now.getUTCFullYear() && mm === now.getUTCMonth() + 1;
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

function sectionTallies(normalized) {
  return (normalized?.sections || []).map((sec) => {
    let errors = 0;
    let warnings = 0;
    let notices = 0;
    for (const chk of sec.checks || []) {
      const t = chk.type || chk.severity;
      const n = Number(chk.count) || 1;
      if (t === "error") errors += n;
      else if (t === "warning") warnings += n;
      else notices += n;
    }
    return { name: sec.name || sec.uid || "Section", errors, warnings, notices };
  });
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
    section: iss.category || "",
  }));
  return {
    source: "internal",
    score: snapshot.healthScore ?? payload.healthScore ?? null,
    totalPages: snapshot.totalPages ?? payload.stats?.pagesCrawled ?? null,
    critical: Number(critical) || 0,
    warning: Number(warning) || 0,
    notice: Number(notice) || 0,
    passed: null,
    issues,
    sections: [],
    sectionTallies: [],
    stats: payload.stats || null,
    finishedAt: snapshot.finishedAt || null,
  };
}

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

function parseSerankingAuditPayload(payload, meta = {}) {
  if (!payload) return null;
  const normalized =
    payload.normalized ||
    normalizeAuditReport(payload.report || payload.data?.report || payload);
  if (!normalized) return null;
  const hasSignal =
    normalized.score != null ||
    normalized.totalErrors != null ||
    normalized.totalWarnings != null ||
    (normalized.sections || []).length > 0;
  if (!hasSignal) return null;
  return {
    source: "seranking",
    score: normalized.score,
    totalPages: normalized.totalPages,
    critical: normalized.totalErrors ?? 0,
    warning: normalized.totalWarnings ?? 0,
    notice: normalized.totalNotices ?? 0,
    passed: normalized.totalPassed,
    issues: flattenSerankingIssues(normalized),
    sections: normalized.sections || [],
    sectionTallies: sectionTallies(normalized),
    domainProps: normalized.domainProps || null,
    fetchedAt: meta.fetchedAt || payload.completedAt || null,
    stale: Boolean(meta.expired),
  };
}

async function loadSerankingAuditCached(siteUrl) {
  const variants = siteUrlVariants(siteUrl);
  for (const key of variants) {
    const cached = await getCachedSnapshot(key, DATA_TYPES.AUDIT_REPORT).catch(() => null);
    const parsed = parseSerankingAuditPayload(cached?.payload, cached || {});
    if (parsed) return parsed;
  }

  const domain = toDomain(siteUrl);
  if (domain) {
    const row = await prisma.serankingSnapshot
      .findFirst({
        where: {
          dataType: DATA_TYPES.AUDIT_REPORT,
          siteUrl: { contains: domain },
        },
        orderBy: { fetchedAt: "desc" },
      })
      .catch(() => null);
    const parsed = parseSerankingAuditPayload(row?.payload, row || {});
    if (parsed) return parsed;
  }

  // Successful audit job may hold the report even if snapshot key mismatched
  const job = await prisma.serankingAuditJob
    .findFirst({
      where: {
        status: "success",
        OR: [
          { siteUrl: { in: variants } },
          domain ? { domain } : undefined,
        ].filter(Boolean),
      },
      orderBy: [{ finishedAt: "desc" }, { startedAt: "desc" }],
    })
    .catch(() => null);
  return parseSerankingAuditPayload(job?.payload, {
    fetchedAt: job?.finishedAt || job?.startedAt,
  });
}

async function loadInternalAuditAny(siteUrl) {
  const variants = siteUrlVariants(siteUrl);
  for (const key of variants) {
    const pack = await getLatestSiteAudit(key).catch(() => null);
    if (pack?.snapshot) return normalizeInternalAudit(pack.snapshot);
  }
  const domain = toDomain(siteUrl);
  if (!domain) return null;
  const snap = await prisma.siteAuditSnapshot
    .findFirst({
      where: { status: "success", siteUrl: { contains: domain } },
      orderBy: { startedAt: "desc" },
    })
    .catch(() => null);
  return normalizeInternalAudit(snap);
}

function auditStrength(a) {
  if (!a) return 0;
  let s = 0;
  if (a.score != null) s += 3;
  if (a.issues?.length) s += Math.min(a.issues.length, 8);
  if (a.critical) s += 2;
  if (a.warning) s += 1;
  if (a.sectionTallies?.length) s += 2;
  if (a.stats) s += 1;
  return s;
}

function mergeAudits(se, internal) {
  if (!se && !internal) return null;
  if (!se) return internal;
  if (!internal) return se;
  const primary = auditStrength(se) >= auditStrength(internal) ? se : internal;
  const secondary = primary === se ? internal : se;
  const issues =
    primary.issues?.length > 0
      ? primary.issues
      : secondary.issues?.length
        ? secondary.issues
        : [];
  return {
    ...primary,
    issues,
    sectionTallies: primary.sectionTallies?.length
      ? primary.sectionTallies
      : secondary.sectionTallies || [],
    stats: primary.stats || secondary.stats,
    totalPages: primary.totalPages ?? secondary.totalPages,
    critical: primary.critical ?? secondary.critical ?? 0,
    warning: primary.warning ?? secondary.warning ?? 0,
    notice: primary.notice ?? secondary.notice ?? 0,
    score: primary.score ?? secondary.score,
    passed: primary.passed ?? secondary.passed,
    hybrid: true,
  };
}

function extractPageSpeed(bundle) {
  const p = bundle?.snapshot?.payload;
  if (!p?.scores) return null;
  const field = p.fieldData?.origin || p.fieldData?.page || null;
  const cwv = [];
  const cwvLabels = {
    LARGEST_CONTENTFUL_PAINT_MS: "LCP",
    CUMULATIVE_LAYOUT_SHIFT_SCORE: "CLS",
    INTERACTION_TO_NEXT_PAINT: "INP",
    FIRST_INPUT_DELAY_MS: "FID",
    EXPERIMENTAL_TIME_TO_FIRST_BYTE: "TTFB",
  };
  if (field?.metrics) {
    for (const [key, m] of Object.entries(field.metrics)) {
      const label = cwvLabels[key] || key.replace(/_/g, " ").slice(0, 18);
      let display = m.displayValue || null;
      if (display == null && m.percentile != null) {
        display =
          key.includes("SHIFT")
            ? String(m.percentile)
            : key.includes("MS") || key.includes("PAINT") || key.includes("DELAY")
              ? `${m.percentile} ms`
              : String(m.percentile);
      }
      cwv.push({
        id: label,
        category: m.category || null,
        percentile: m.percentile ?? null,
        displayValue: display,
      });
    }
  }
  return {
    scores: p.scores,
    labMetrics: (p.labMetrics || []).slice(0, 6),
    cwv: cwv.slice(0, 6),
    strategy: p.strategy || bundle.snapshot?.strategy,
    fetchedAt: bundle.snapshot?.fetchedAt,
    stale: Boolean(bundle.stale),
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
  const domain = siteUrl ? toDomain(siteUrl) : null;

  const result = {
    siteKey: key,
    siteUrl,
    isMeta,
    domain,
    period,
    gsc: null,
    countries: [],
    seranking: null,
    backlinks: null,
    audit: null,
    authority: null,
    pagespeed: null,
    blogs: [],
    blogsMonthLabel: "",
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
    soft("backlinks", loadBacklinks(siteUrl, { allowManual: true }).catch(() => null)),
    soft("audit-internal", loadInternalAuditAny(siteUrl).catch(() => null)),
    soft("audit-seranking", loadSerankingAuditCached(siteUrl).catch(() => null)),
    soft(
      "authority",
      domain
        ? getAuthorityScores([domain]).then((m) => m.get(domain) || null)
        : Promise.resolve(null)
    ),
    soft(
      "authority-trend",
      domain ? getAuthorityTrend(domain, 60).catch(() => []) : Promise.resolve([])
    ),
    soft(
      "ps-mobile",
      getPageSpeedSnapshot(siteUrl, "mobile", { forceRefresh: false }).catch(() => null)
    ),
    soft(
      "ps-desktop",
      getPageSpeedSnapshot(siteUrl, "desktop", { forceRefresh: false }).catch(() => null)
    ),
    soft(
      "blogs",
      loadPublishedBlogsForReport(
        key,
        reportMonth || formatYearMonthSafe(period),
        { limit: 6 }
      ).catch(() => ({ blogs: [], label: "" }))
    ),
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
  const countries = byLabel["gsc-countries"]?.ok ? byLabel["gsc-countries"].data : null;

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

  if (!result.countries.length && period.mode === "calendar") {
    const rolling = getDateRangeForPresetId("28d", new Date());
    try {
      const retry = await getTopCountries(siteUrl, rolling.startDate, rolling.endDate, 40);
      if (retry?.countries?.length) {
        result.countries = retry.countries;
        result.period = {
          ...rolling,
          label: `Last 28 days (${rolling.startDate} to ${rolling.endDate})`,
          mode: "28d-fallback",
        };
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

  const seAudit = byLabel["audit-seranking"]?.data || null;
  const internalAudit = byLabel["audit-internal"]?.data || null;
  result.audit = mergeAudits(seAudit, internalAudit);
  result.auditInternal = internalAudit;

  const opr = byLabel.authority?.data || null;
  const bl = result.backlinks;
  const inlink = bl?.domainInlinkRank ?? null;
  const score100 = opr?.score != null ? toScore100(opr.score) : null;
  result.authority = {
    score10: opr?.score ?? null,
    score100,
    globalRank: opr?.globalRank ?? null,
    referringDomains: bl?.refdomains ?? opr?.referringDomains ?? null,
    inlinkRank: inlink,
    homepageUr: bl?.inlinkRank ?? null,
    preferredScore: inlink != null ? inlink : score100,
    preferredLabel: inlink != null ? "InLink Rank" : "Authority (OPR)",
    trend: (byLabel["authority-trend"]?.data || []).slice(-12).map((t) => ({
      date: t.fetchedDate,
      score: t.score,
      score100: toScore100(t.score),
    })),
    found: Boolean(opr?.found || inlink != null),
  };

  result.pagespeed = {
    mobile: extractPageSpeed(byLabel["ps-mobile"]?.data),
    desktop: extractPageSpeed(byLabel["ps-desktop"]?.data),
  };

  const blogPack = byLabel.blogs?.data || { blogs: [], label: "" };
  result.blogs = blogPack.blogs || [];
  result.blogsMonthLabel = blogPack.label || "";
  result.opportunities = byLabel.opportunities?.data || null;
  return result;
}
