import { serankingRequest } from "./client.js";
import {
  CREDIT_ESTIMATES,
  DEFAULT_SOURCE,
  auditMaxPages,
  seedKeywordCount,
  DATA_TYPES,
} from "./config.js";
import { toSerankingDomain } from "./domain.js";
import { getCachedSnapshot, saveSnapshot } from "./cache.js";
import { SerankingApiError } from "./client.js";
import { normalizeKeywordResearchList, normalizeAuditReport } from "./normalize.js";

const KEYWORD_RESEARCH_PATHS = {
  similar: "/keywords/similar",
  related: "/keywords/related",
  questions: "/keywords/questions",
  longtail: "/keywords/longtail",
};

export async function fetchBacklinksSummary(siteUrl, domain, { allowManual = false, force = false } = {}) {
  const cached = await getCachedSnapshot(siteUrl, DATA_TYPES.BACKLINKS_SUMMARY);
  if (!force && cached?.payload && !cached.expired) {
    return { data: cached.payload, fromCache: true, fetchedAt: cached.fetchedAt, creditsSpent: 0 };
  }

  // GET with query params — POST requires target as a JSON array and still 400s with a plain string.
  const data = await serankingRequest({
    method: "GET",
    path: "/backlinks/summary",
    query: { target: domain, mode: "domain", output: "json" },
    creditEstimate: CREDIT_ESTIMATES.backlinks_summary,
    creditsOnSuccess: CREDIT_ESTIMATES.backlinks_summary,
    siteUrl,
    allowManual,
    endpointLabel: "backlinks/summary",
  });

  await saveSnapshot({
    siteUrl,
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
  { limit = 25, allowManual = true, siteUrl = null, source = DEFAULT_SOURCE, sort = "volume", sortOrder = "desc" } = {}
) {
  const path = KEYWORD_RESEARCH_PATHS[type];
  if (!path) throw new SerankingApiError(`Unknown keyword research type: ${type}`, { status: 400 });

  const seed = String(keyword || "").trim();
  if (!seed) throw new SerankingApiError("Keyword is required.", { status: 400 });

  const capped = Math.min(50, Math.max(5, limit));
  const estimate = capped * CREDIT_ESTIMATES.keywords_similar_per_kw;

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
    siteUrl,
    allowManual,
    endpointLabel: `keywords/${type}`,
  });

  return {
    data: normalizeKeywordResearchList(data, source),
    creditsSpent: estimate,
    type,
    source,
    keyword: seed,
  };
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
  if (!domain) throw new SerankingApiError("Invalid website URL for SE Ranking.", { status: 400 });
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
