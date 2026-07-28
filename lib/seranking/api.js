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
    query: { domain, with_subdomains: "true" },
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
    query: { domain, source: DEFAULT_SOURCE, limit: 20 },
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
    query: { domain, source: DEFAULT_SOURCE, limit: 50, order_field: "traffic", order_type: "desc" },
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

export async function fetchSimilarKeywords(keyword, { limit = 15, allowManual = true, siteUrl = null } = {}) {
  const seed = String(keyword || "").trim();
  if (!seed) throw new SerankingApiError("Keyword is required.", { status: 400 });

  const capped = Math.min(25, Math.max(5, limit));
  const estimate = capped * CREDIT_ESTIMATES.keywords_similar_per_kw;

  const data = await serankingRequest({
    method: "GET",
    path: "/keywords/similar",
    query: { source: DEFAULT_SOURCE, keyword: seed, limit: capped, offset: 0 },
    creditEstimate: estimate,
    creditsOnSuccess: estimate,
    siteUrl,
    allowManual,
    endpointLabel: "keywords/similar",
  });

  return { data, creditsSpent: estimate };
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

export async function finalizeAuditReport(siteUrl, auditId, creditsSpent = 0) {
  const report = await getAuditReport(auditId);
  await saveSnapshot({
    siteUrl,
    dataType: DATA_TYPES.AUDIT_REPORT,
    payload: { auditId, report, completedAt: new Date().toISOString() },
    creditsSpent,
  });
  return report;
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
