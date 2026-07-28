import { serankingRequest } from "./client.js";
import {
  CREDIT_ESTIMATES,
  DEFAULT_SOURCE,
  auditMaxPages,
  seedKeywordCount,
  DATA_TYPES,
} from "./config.js";
import { toSerankingDomain, resolveBacklinkTarget } from "./domain.js";
import { normalizeBacklinksSummary } from "./normalize.js";
import { getCachedSnapshot, saveSnapshot } from "./cache.js";
import { SerankingApiError } from "./client.js";
import { normalizeKeywordResearchList, normalizeAuditReport, normalizeKeywordResearchRow } from "./normalize.js";
import { RESEARCH_CACHE_SITE, normKeyword, finalizeKeywordRow, fetchSerankingMetricsMap } from "./keywordMetrics.js";

const KEYWORD_RESEARCH_PATHS = {
  similar: "/keywords/similar",
  related: "/keywords/related",
  questions: "/keywords/questions",
  longtail: "/keywords/longtail",
};

function keywordResearchCacheKey(type, keyword, source, limit, sort, sortOrder) {
  return `${source}:${type}:${normKeyword(keyword)}:${limit}:${sort}:${sortOrder}`;
}

export function isBacklinksPayloadUsable(data) {
  const s = normalizeBacklinksSummary(data);
  if (!s) return false;
  return (
    (s.backlinks != null && s.backlinks > 0) ||
    (s.refdomains != null && s.refdomains > 0) ||
    (s.topAnchors?.length > 0) ||
    (s.topPages?.length > 0)
  );
}

async function requestBacklinksSummary(siteUrl, domain, { allowManual }) {
  const { target, mode } = resolveBacklinkTarget(siteUrl, domain);
  const estimate = CREDIT_ESTIMATES.backlinks_summary;

  const data = await serankingRequest({
    method: "GET",
    path: "/backlinks/summary",
    query: { target, mode, output: "json" },
    creditEstimate: estimate,
    creditsOnSuccess: estimate,
    siteUrl,
    allowManual,
    endpointLabel: "backlinks/summary",
  });

  if (isBacklinksPayloadUsable(data)) return data;

  // POST batch format fallback when GET returns an empty shell.
  return serankingRequest({
    method: "POST",
    path: "/backlinks/summary",
    query: { output: "json" },
    body: { target: [target], mode },
    creditEstimate: 0,
    creditsOnSuccess: 0,
    siteUrl,
    allowManual,
    skipBudget: true,
    endpointLabel: "backlinks/summary/post",
  });
}

export async function fetchBacklinksSummary(
  cacheSiteUrl,
  domain,
  { allowManual = false, force = false, siteUrlForApi } = {}
) {
  const apiSiteUrl = siteUrlForApi || cacheSiteUrl;
  const cached = await getCachedSnapshot(cacheSiteUrl, DATA_TYPES.BACKLINKS_SUMMARY);
  if (!force && cached?.payload && !cached.expired && isBacklinksPayloadUsable(cached.payload)) {
    return { data: cached.payload, fromCache: true, fetchedAt: cached.fetchedAt, creditsSpent: 0 };
  }

  const data = await requestBacklinksSummary(apiSiteUrl, domain, { allowManual });

  await saveSnapshot({
    siteUrl: cacheSiteUrl,
    dataType: DATA_TYPES.BACKLINKS_SUMMARY,
    payload: data,
    creditsSpent: CREDIT_ESTIMATES.backlinks_summary,
  });

  return { data, fromCache: false, creditsSpent: CREDIT_ESTIMATES.backlinks_summary };
}

export async function fetchDomainOverview(siteUrl, domain, { allowManual = false, force = false } = {}) {
  const cached = await getCachedSnapshot(siteUrl, DATA_TYPES.DOMAIN_OVERVIEW);
  if (!force && cached?.payload && !cached.expired) {
    return { data: cached.payload, fromCache: true, fetchedAt: cached.fetchedAt, creditsSpent: 0 };
  }

  const data = await serankingRequest({
    method: "GET",
    path: "/domain/overview/worldwide",
    query: {
      domain,
      with_subdomains: "true",
      show_zones_list: "1",
      fields: "price,traffic,keywords,positions_diff,positions_tops",
    },
    creditEstimate: CREDIT_ESTIMATES.domain_overview,
    creditsOnSuccess: CREDIT_ESTIMATES.domain_overview,
    siteUrl,
    allowManual,
    endpointLabel: "domain/overview/worldwide",
  });

  await saveSnapshot({
    siteUrl,
    dataType: DATA_TYPES.DOMAIN_OVERVIEW,
    payload: data,
    creditsSpent: CREDIT_ESTIMATES.domain_overview,
  });

  return { data, fromCache: false, creditsSpent: CREDIT_ESTIMATES.domain_overview };
}

export async function fetchDomainCompetitors(siteUrl, domain, { allowManual = false, force = false } = {}) {
  const cached = await getCachedSnapshot(siteUrl, DATA_TYPES.DOMAIN_COMPETITORS);
  if (!force && cached?.payload && !cached.expired) {
    return { data: cached.payload, fromCache: true, fetchedAt: cached.fetchedAt, creditsSpent: 0 };
  }

  const data = await serankingRequest({
    method: "GET",
    path: "/domain/competitors",
    query: { domain, source: DEFAULT_SOURCE, type: "organic", limit: 20, stats: "1" },
    creditEstimate: CREDIT_ESTIMATES.domain_competitors,
    creditsOnSuccess: CREDIT_ESTIMATES.domain_competitors,
    siteUrl,
    allowManual,
    endpointLabel: "domain/competitors",
  });

  await saveSnapshot({
    siteUrl,
    dataType: DATA_TYPES.DOMAIN_COMPETITORS,
    payload: data,
    creditsSpent: CREDIT_ESTIMATES.domain_competitors,
  });

  return { data, fromCache: false, creditsSpent: CREDIT_ESTIMATES.domain_competitors };
}

export async function fetchDomainKeywords(siteUrl, domain, { allowManual = false, force = false } = {}) {
  const sourceKey = DEFAULT_SOURCE;
  const cached = await getCachedSnapshot(siteUrl, DATA_TYPES.DOMAIN_KEYWORDS, sourceKey);
  if (!force && cached?.payload && !cached.expired) {
    return { data: cached.payload, fromCache: true, fetchedAt: cached.fetchedAt, creditsSpent: 0 };
  }

  const data = await serankingRequest({
    method: "GET",
    path: "/domain/keywords",
    query: {
      domain,
      source: DEFAULT_SOURCE,
      type: "organic",
      limit: 50,
      order_field: "traffic",
      order_type: "desc",
    },
    creditEstimate: CREDIT_ESTIMATES.domain_keywords,
    creditsOnSuccess: CREDIT_ESTIMATES.domain_keywords,
    siteUrl,
    allowManual,
    endpointLabel: "domain/keywords",
  });

  await saveSnapshot({
    siteUrl,
    dataType: DATA_TYPES.DOMAIN_KEYWORDS,
    sourceKey,
    payload: data,
    creditsSpent: CREDIT_ESTIMATES.domain_keywords,
  });

  return { data, fromCache: false, creditsSpent: CREDIT_ESTIMATES.domain_keywords };
}

export async function fetchSeedKeywords(siteUrl, keywords, { allowManual = false, force = false } = {}) {
  const sourceKey = DEFAULT_SOURCE;
  const list = [...new Set((keywords || []).map((k) => String(k || "").trim()).filter(Boolean))].slice(
    0,
    seedKeywordCount()
  );
  if (!list.length) {
    return { data: [], fromCache: true, creditsSpent: 0, skipped: true };
  }

  const cached = await getCachedSnapshot(siteUrl, DATA_TYPES.KEYWORDS_SEEDS, sourceKey);
  if (!force && cached?.payload && !cached.expired) {
    return { data: cached.payload, fromCache: true, fetchedAt: cached.fetchedAt, creditsSpent: 0 };
  }

  const estimate = CREDIT_ESTIMATES.keywords_export_request;
  const data = await serankingRequest({
    method: "POST",
    path: "/keywords/export",
    query: { source: DEFAULT_SOURCE },
    body: { keywords: list, sort: "volume", sort_order: "desc" },
    creditEstimate: estimate,
    creditsOnSuccess: estimate,
    siteUrl,
    allowManual,
    endpointLabel: "keywords/export",
  });

  await saveSnapshot({
    siteUrl,
    dataType: DATA_TYPES.KEYWORDS_SEEDS,
    sourceKey,
    payload: data,
    creditsSpent: estimate,
  });

  return { data, fromCache: false, creditsSpent: estimate };
}

export async function fetchSimilarKeywords(keyword, { limit = 15, allowManual = true, siteUrl = null, source = DEFAULT_SOURCE } = {}) {
  return fetchKeywordResearch("similar", keyword, { limit, allowManual, siteUrl, source });
}

export async function fetchKeywordResearch(
  type,
  keyword,
  {
    limit = 25,
    allowManual = true,
    siteUrl = null,
    source = DEFAULT_SOURCE,
    sort = "volume",
    sortOrder = "desc",
    force = false,
  } = {}
) {
  const path = KEYWORD_RESEARCH_PATHS[type];
  if (!path) throw new SerankingApiError(`Unknown keyword research type: ${type}`, { status: 400 });

  const seed = String(keyword || "").trim();
  if (!seed) throw new SerankingApiError("Keyword is required.", { status: 400 });

  const capped = Math.min(50, Math.max(5, limit));
  const estimate = capped * CREDIT_ESTIMATES.keywords_similar_per_kw;
  const cacheSite = siteUrl || RESEARCH_CACHE_SITE;
  const sourceKey = keywordResearchCacheKey(type, seed, source, capped, sort, sortOrder);

  if (!force) {
    const cached = await getCachedSnapshot(cacheSite, DATA_TYPES.KEYWORD_RESEARCH, sourceKey);
    if (cached?.payload?.data && !cached.expired) {
      return {
        data: cached.payload.data.map((row) => finalizeKeywordRow(row, source)),
        creditsSpent: 0,
        fromCache: true,
        fetchedAt: cached.fetchedAt,
        expiresAt: cached.expiresAt,
        type,
        source,
        keyword: seed,
      };
    }
  }

  const data = await serankingRequest({
    method: "GET",
    path,
    query: {
      source,
      keyword: seed,
      limit: capped,
      offset: 0,
      sort,
      sort_order: sortOrder,
      history_trend: "true",
    },
    creditEstimate: estimate,
    creditsOnSuccess: estimate,
    siteUrl: cacheSite,
    allowManual,
    endpointLabel: `keywords/${type}`,
  });

  const normalized = normalizeKeywordResearchList(data, source);

  await saveSnapshot({
    siteUrl: cacheSite,
    dataType: DATA_TYPES.KEYWORD_RESEARCH,
    sourceKey,
    payload: { data: normalized, keyword: seed, type, source, limit: capped, sort, sortOrder },
    creditsSpent: estimate,
  });

  return {
    data: normalized,
    creditsSpent: estimate,
    fromCache: false,
    fetchedAt: new Date().toISOString(),
    expiresAt: null,
    type,
    source,
    keyword: seed,
  };
}

/** Full metrics for the seed keyword the user searched (volume, KD, CPC, trends, etc.). */
export async function loadSeedKeywordMetrics(
  keyword,
  { source = DEFAULT_SOURCE, siteUrl = null, allowManual = true, force = false } = {}
) {
  const seed = String(keyword || "").trim();
  if (!seed) throw new SerankingApiError("Keyword is required.", { status: 400 });

  const cacheSite = siteUrl || RESEARCH_CACHE_SITE;
  const metricKey = `${source}:${normKeyword(seed)}`;

  if (!force) {
    const cached = await getCachedSnapshot(cacheSite, DATA_TYPES.KEYWORD_METRIC, metricKey);
    if (cached?.payload && !cached.expired) {
      return {
        metrics: finalizeKeywordRow(
          cached.payload.volume != null || cached.payload.difficulty != null
            ? cached.payload
            : normalizeKeywordResearchRow(cached.payload, source),
          source
        ),
        fromCache: true,
        fetchedAt: cached.fetchedAt,
        expiresAt: cached.expiresAt,
        creditsSpent: 0,
      };
    }
  }

  const estimate = CREDIT_ESTIMATES.keywords_export_request;
  const data = await serankingRequest({
    method: "POST",
    path: "/keywords/export",
    query: { source },
    body: { keywords: [seed], sort: "volume", sort_order: "desc" },
    creditEstimate: estimate,
    creditsOnSuccess: estimate,
    siteUrl: cacheSite,
    allowManual,
    endpointLabel: "keywords/export/seed",
  });

  const rows = (Array.isArray(data) ? data : [])
    .map((row) => normalizeKeywordResearchRow(row, source))
    .filter(Boolean);
  const metrics = rows.find((r) => normKeyword(r.keyword) === normKeyword(seed)) || rows[0] || null;

  if (metrics) {
    await saveSnapshot({
      siteUrl: cacheSite,
      dataType: DATA_TYPES.KEYWORD_METRIC,
      sourceKey: metricKey,
      payload: metrics,
      creditsSpent: estimate,
    });
  }

  return {
    metrics,
    fromCache: false,
    fetchedAt: new Date().toISOString(),
    expiresAt: null,
    creditsSpent: estimate,
  };
}

/** Fill missing CPC / traffic potential via bulk export when discovery endpoints omit fields. */
export async function enrichKeywordRowsFromExport(
  rows,
  { source = DEFAULT_SOURCE, siteUrl = null, allowManual = true, force = false } = {}
) {
  const finalized = (rows || []).map((row) => finalizeKeywordRow(row, source)).filter(Boolean);
  const needsExport = finalized.some(
    (row) =>
      row.isDataFound !== false &&
      row.keyword &&
      (row.cpc == null || row.cpcFormatted == null)
  );
  if (!needsExport) return { data: finalized, creditsSpent: 0, fromCache: true };

  const keywords = [...new Set(finalized.map((row) => row.keyword).filter(Boolean))].slice(0, 50);
  const { metricsMap, creditsSpent, fromCache } = await fetchSerankingMetricsMap(keywords, source, siteUrl, {
    allowManual,
    force,
  });

  const merged = finalized.map((row) => {
    const exported = metricsMap.get(normKeyword(row.keyword));
    if (!exported) return row;
    return finalizeKeywordRow({ ...row, ...exported, keyword: row.keyword }, source);
  });

  return { data: merged, creditsSpent: creditsSpent || 0, fromCache: Boolean(fromCache) };
}

export async function fetchKeywordExport(keywords, { source = DEFAULT_SOURCE, allowManual = true, siteUrl = null } = {}) {
  const list = [...new Set((keywords || []).map((k) => String(k || "").trim()).filter(Boolean))].slice(0, 100);
  if (!list.length) throw new SerankingApiError("At least one keyword is required.", { status: 400 });

  const estimate = CREDIT_ESTIMATES.keywords_export_request;
  const data = await serankingRequest({
    method: "POST",
    path: "/keywords/export",
    query: { source },
    body: { keywords: list, sort: "volume", sort_order: "desc" },
    creditEstimate: estimate,
    creditsOnSuccess: estimate,
    siteUrl,
    allowManual,
    endpointLabel: "keywords/export",
  });

  return {
    data: normalizeKeywordResearchList(data, source),
    creditsSpent: estimate,
    source,
  };
}

export async function createStandardAudit(siteUrl, domain, { allowManual = false } = {}) {
  const maxPages = auditMaxPages();
  const estimate = maxPages * CREDIT_ESTIMATES.audit_standard_per_page;

  const created = await serankingRequest({
    method: "POST",
    path: "/site-audit/audits/standard",
    body: {
      domain,
      title: `Crossway audit — ${domain}`,
      settings: { max_pages: maxPages, max_depth: 5, send_report: 0 },
    },
    creditEstimate: estimate,
    creditsOnSuccess: estimate,
    siteUrl,
    allowManual,
    endpointLabel: "site-audit/audits/standard",
  });

  return { auditId: created?.id ?? created?.audit_id, creditsSpent: estimate, maxPages };
}

export async function getAuditStatus(auditId) {
  return serankingRequest({
    method: "GET",
    path: "/site-audit/audits/status",
    query: { audit_id: auditId },
    skipBudget: true,
    creditEstimate: 0,
    endpointLabel: "site-audit/audits/status",
  });
}

export async function getAuditReport(auditId) {
  return serankingRequest({
    method: "GET",
    path: "/site-audit/audits/report",
    query: { audit_id: auditId },
    skipBudget: true,
    creditEstimate: 0,
    endpointLabel: "site-audit/audits/report",
  });
}

export async function getAuditPages(auditId, { limit = 50, offset = 0 } = {}) {
  return serankingRequest({
    method: "GET",
    path: "/site-audit/audits/pages",
    query: { audit_id: auditId, limit, offset },
    skipBudget: true,
    creditEstimate: 0,
    endpointLabel: "site-audit/audits/pages",
  });
}

export async function getAuditIssuePages(auditId, code, { limit = 100, offset = 0 } = {}) {
  return serankingRequest({
    method: "GET",
    path: "/site-audit/audits/issue-pages",
    query: { audit_id: auditId, code, limit, offset },
    skipBudget: true,
    creditEstimate: 0,
    endpointLabel: "site-audit/audits/issue-pages",
  });
}

export async function getAuditPageIssues(auditId, { urlId = null, url = null } = {}) {
  const query = { audit_id: auditId };
  if (urlId != null) query.url_id = urlId;
  else if (url) query.url = url;
  return serankingRequest({
    method: "GET",
    path: "/site-audit/audits/issues",
    query,
    skipBudget: true,
    creditEstimate: 0,
    endpointLabel: "site-audit/audits/issues",
  });
}

export async function fetchDomainPages(siteUrl, domain, { allowManual = false, force = false, source = DEFAULT_SOURCE } = {}) {
  const cached = await getCachedSnapshot(siteUrl, DATA_TYPES.DOMAIN_PAGES, source);
  if (!force && cached?.payload && !cached.expired) {
    return { data: cached.payload, fromCache: true, fetchedAt: cached.fetchedAt, creditsSpent: 0 };
  }

  const estimate = CREDIT_ESTIMATES.domain_pages;
  const data = await serankingRequest({
    method: "GET",
    path: "/domain/pages",
    query: {
      target: domain,
      scope: "base_domain",
      source,
      type: "organic",
      order_field: "traffic",
      order_type: "desc",
      limit: 50,
      offset: 0,
    },
    creditEstimate: estimate,
    creditsOnSuccess: estimate,
    siteUrl,
    allowManual,
    endpointLabel: "domain/pages",
  });

  await saveSnapshot({
    siteUrl,
    dataType: DATA_TYPES.DOMAIN_PAGES,
    sourceKey: source,
    payload: data,
    creditsSpent: estimate,
  });

  return { data, fromCache: false, creditsSpent: estimate };
}

export async function loadOrRefreshAudit(siteUrl, domain, { allowManual = false, force = false } = {}) {
  const cached = await getCachedSnapshot(siteUrl, DATA_TYPES.AUDIT_REPORT);
  if (!force && cached?.payload && !cached.expired) {
    return { data: cached.payload, fromCache: true, fetchedAt: cached.fetchedAt };
  }

  const { auditId, creditsSpent } = await createStandardAudit(siteUrl, domain, { allowManual });
  if (!auditId) throw new SerankingApiError("Audit creation did not return an ID.", { status: 502 });

  return { auditId, status: "running", creditsSpent, pending: true };
}

export async function fetchAiSearchAggregated(siteUrl, domain, { allowManual = false, force = false, source = DEFAULT_SOURCE } = {}) {
  const cached = await getCachedSnapshot(siteUrl, DATA_TYPES.AI_SEARCH_OVERVIEW, source);
  if (!force && cached?.payload && !cached.expired) {
    return { data: cached.payload, fromCache: true, fetchedAt: cached.fetchedAt, creditsSpent: 0 };
  }

  const estimate = CREDIT_ESTIMATES.ai_search_aggregated;
  const data = await serankingRequest({
    method: "GET",
    path: "/ai-search/overview/aggregated/time-series",
    query: { target: domain, source, scope: "base_domain" },
    creditEstimate: estimate,
    creditsOnSuccess: estimate,
    siteUrl,
    allowManual,
    endpointLabel: "ai-search/overview/aggregated",
  });

  await saveSnapshot({
    siteUrl,
    dataType: DATA_TYPES.AI_SEARCH_OVERVIEW,
    sourceKey: source,
    payload: data,
    creditsSpent: estimate,
  });

  return { data, fromCache: false, creditsSpent: estimate };
}

export async function fetchAiSearchByEngine(siteUrl, domain, engine, { source = DEFAULT_SOURCE, allowManual = false } = {}) {
  const estimate = CREDIT_ESTIMATES.ai_search_by_engine;
  const data = await serankingRequest({
    method: "GET",
    path: "/ai-search/overview/by-engine/time-series",
    query: { target: domain, source, engine, scope: "base_domain" },
    creditEstimate: estimate,
    creditsOnSuccess: estimate,
    siteUrl,
    allowManual,
    endpointLabel: `ai-search/overview/${engine}`,
  });
  return { data, creditsSpent: estimate, engine };
}

export async function finalizeAuditReport(siteUrl, auditId, creditsSpent = 0) {
  const report = await getAuditReport(auditId);
  const normalized = normalizeAuditReport(report);
  await saveSnapshot({
    siteUrl,
    dataType: DATA_TYPES.AUDIT_REPORT,
    payload: { auditId, report, normalized, completedAt: new Date().toISOString() },
    creditsSpent,
  });
  return { report, normalized };
}

export function resolveDomainFromSite(siteUrl) {
  const domain = toSerankingDomain(siteUrl);
  if (!domain) throw new SerankingApiError("Invalid website URL.", { status: 400 });
  return domain;
}

export async function getBundleForSite(siteUrl, { allowManual = false } = {}) {
  const domain = resolveDomainFromSite(siteUrl);
  const [backlinks, overview, competitors, keywords] = await Promise.all([
    getCachedSnapshot(siteUrl, DATA_TYPES.BACKLINKS_SUMMARY),
    getCachedSnapshot(siteUrl, DATA_TYPES.DOMAIN_OVERVIEW),
    getCachedSnapshot(siteUrl, DATA_TYPES.DOMAIN_COMPETITORS),
    getCachedSnapshot(siteUrl, DATA_TYPES.DOMAIN_KEYWORDS, DEFAULT_SOURCE),
  ]);
  const seeds = await getCachedSnapshot(siteUrl, DATA_TYPES.KEYWORDS_SEEDS, DEFAULT_SOURCE);
  const audit = await getCachedSnapshot(siteUrl, DATA_TYPES.AUDIT_REPORT);

  return {
    siteUrl,
    domain,
    backlinks: backlinks?.payload ?? null,
    overview: overview?.payload ?? null,
    competitors: competitors?.payload ?? null,
    keywords: keywords?.payload ?? null,
    seedKeywords: seeds?.payload ?? null,
    audit: audit?.payload ?? null,
    meta: {
      backlinksFetchedAt: backlinks?.fetchedAt,
      overviewFetchedAt: overview?.fetchedAt,
      competitorsFetchedAt: competitors?.fetchedAt,
      keywordsFetchedAt: keywords?.fetchedAt,
      seedsFetchedAt: seeds?.fetchedAt,
      auditFetchedAt: audit?.fetchedAt,
    },
  };
}
