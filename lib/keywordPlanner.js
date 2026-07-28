/**
 * Google Ads Keyword Planner — historical metrics and keyword ideas.
 */
import prisma from "./prisma.js";
import { googleAdsPost, isGoogleAdsConfigured } from "./googleAds.js";

export const GEO_TARGETS = {
  us: { id: 2840, label: "United States" },
  uk: { id: 2826, label: "United Kingdom" },
  pk: { id: 2364, label: "Pakistan" },
  ca: { id: 2124, label: "Canada" },
  au: { id: 2036, label: "Australia" },
};

export const DEFAULT_LANGUAGE_ID = 1000;
export const METRICS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const IDEAS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function normKeyword(k) {
  return String(k || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function resolveGeoTarget(geoKey) {
  const key = String(geoKey || "us").toLowerCase();
  return GEO_TARGETS[key] || GEO_TARGETS.us;
}

export function normalizeCompetition(value) {
  if (value == null) return null;
  const s = String(value)
    .replace(/^COMPETITION_/, "")
    .replace(/_LEVEL_/g, "_")
    .replace(/^LEVEL_/, "");
  if (s.includes("LOW")) return "LOW";
  if (s.includes("HIGH")) return "HIGH";
  if (s.includes("MEDIUM")) return "MEDIUM";
  return s.replace(/_/g, " ") || null;
}

export function formatBidMicros(micros) {
  if (micros == null || micros === "") return null;
  const n = Number(micros);
  if (!Number.isFinite(n)) return null;
  return `$${(n / 1_000_000).toFixed(2)}`;
}

function parseMetricsResult(result) {
  const m = result.keywordMetrics || result.keywordIdeaMetrics || {};
  return {
    keyword: result.text || "",
    closeVariants: result.closeVariants || [],
    avgMonthlySearches: m.avgMonthlySearches != null ? Number(m.avgMonthlySearches) : null,
    competition: normalizeCompetition(m.competition),
    competitionIndex: m.competitionIndex != null ? Number(m.competitionIndex) : null,
    lowTopOfPageBid: formatBidMicros(m.lowTopOfPageBidMicros),
    highTopOfPageBid: formatBidMicros(m.highTopOfPageBidMicros),
    monthlyTrend: (m.monthlySearchVolumes || []).map((v) => ({
      month: v.month,
      year: v.year,
      searches: v.monthlySearches != null ? Number(v.monthlySearches) : null,
    })),
  };
}

function metricsMapToObject(map) {
  const out = {};
  for (const [k, v] of map.entries()) out[k] = v;
  return out;
}

function objectToMetricsMap(obj) {
  const map = new Map();
  if (!obj || typeof obj !== "object") return map;
  for (const [k, v] of Object.entries(obj)) map.set(k, v);
  return map;
}

async function readCache(siteUrl, cacheType, geoTargetId, languageId) {
  return prisma.keywordPlannerCache.findUnique({
    where: {
      siteUrl_cacheType_geoTargetId_languageId: {
        siteUrl,
        cacheType,
        geoTargetId,
        languageId,
      },
    },
  });
}

async function writeCache(siteUrl, cacheType, geoTargetId, languageId, payload) {
  const now = new Date();
  return prisma.keywordPlannerCache.upsert({
    where: {
      siteUrl_cacheType_geoTargetId_languageId: {
        siteUrl,
        cacheType,
        geoTargetId,
        languageId,
      },
    },
    create: { siteUrl, cacheType, geoTargetId, languageId, payload, fetchedAt: now },
    update: { payload, fetchedAt: now },
  });
}

/**
 * Batch historical metrics for up to 10,000 keywords (1 API operation).
 */
export async function fetchHistoricalMetrics(keywords, { geoTargetId = 2840, languageId = DEFAULT_LANGUAGE_ID } = {}) {
  const unique = [...new Set(keywords.map((k) => String(k || "").trim()).filter(Boolean))].slice(0, 10_000);
  if (!unique.length) return new Map();
  if (!isGoogleAdsConfigured()) {
    throw new Error("Google Ads Keyword Planner is not configured.");
  }

  const data = await googleAdsPost("generateKeywordHistoricalMetrics", {
    keywords: unique,
    geoTargetConstants: [`geoTargetConstants/${geoTargetId}`],
    language: `languageConstants/${languageId}`,
    keywordPlanNetwork: "GOOGLE_SEARCH",
    includeAdultKeywords: false,
  });

  const out = new Map();
  for (const result of data.results || []) {
    const parsed = parseMetricsResult(result);
    if (!parsed.keyword) continue;
    const primaryKey = normKeyword(parsed.keyword);
    out.set(primaryKey, parsed);
    for (const variant of parsed.closeVariants || []) {
      const variantKey = normKeyword(variant);
      if (variantKey && !out.has(variantKey)) out.set(variantKey, parsed);
    }
  }
  return out;
}

/**
 * Cached historical metrics for a site's keyword list.
 */
export async function getHistoricalMetricsForSite(
  siteUrl,
  keywords,
  { geoTargetId, languageId = DEFAULT_LANGUAGE_ID, forceRefresh = false } = {}
) {
  const geo = geoTargetId ?? resolveGeoTarget("us").id;
  const unique = [...new Set(keywords.map((k) => String(k || "").trim()).filter(Boolean))];
  if (!unique.length) return { metrics: new Map(), fromCache: false, fetchedAt: null };

  if (!forceRefresh) {
    const cached = await readCache(siteUrl, "historical_metrics", geo, languageId);
    if (cached?.payload && Date.now() - new Date(cached.fetchedAt).getTime() < METRICS_TTL_MS) {
      return {
        metrics: objectToMetricsMap(cached.payload),
        fromCache: true,
        fetchedAt: cached.fetchedAt,
      };
    }
  }

  const live = await fetchHistoricalMetrics(unique, { geoTargetId: geo, languageId });
  await writeCache(siteUrl, "historical_metrics", geo, languageId, metricsMapToObject(live));
  return { metrics: live, fromCache: false, fetchedAt: new Date() };
}

/**
 * Discover keyword ideas from URL + optional seed keywords.
 */
export async function fetchKeywordIdeas(siteUrl, seedKeywords = [], { geoTargetId, languageId = DEFAULT_LANGUAGE_ID } = {}) {
  if (!isGoogleAdsConfigured()) {
    throw new Error("Google Ads Keyword Planner is not configured.");
  }

  const geo = geoTargetId ?? resolveGeoTarget("us").id;
  const seeds = [...new Set(seedKeywords.map((k) => String(k || "").trim()).filter(Boolean))].slice(0, 10);

  const body = {
    geoTargetConstants: [`geoTargetConstants/${geo}`],
    language: `languageConstants/${languageId}`,
    keywordPlanNetwork: "GOOGLE_SEARCH",
    includeAdultKeywords: false,
  };

  if (siteUrl && seeds.length) {
    body.keywordAndUrlSeed = { url: siteUrl, keywords: seeds };
  } else if (siteUrl) {
    body.urlSeed = { url: siteUrl };
  } else if (seeds.length) {
    body.keywordSeed = { keywords: seeds };
  } else {
    throw new Error("Need a site URL or seed keywords for discovery.");
  }

  const data = await googleAdsPost("generateKeywordIdeas", body);
  return (data.results || []).map(parseMetricsResult).filter((r) => r.keyword);
}

export async function getKeywordIdeasForSite(
  siteUrl,
  seedKeywords = [],
  { geoTargetId, languageId = DEFAULT_LANGUAGE_ID, forceRefresh = false } = {}
) {
  const geo = geoTargetId ?? resolveGeoTarget("us").id;

  if (!forceRefresh) {
    const cached = await readCache(siteUrl, "keyword_ideas", geo, languageId);
    if (cached?.payload && Date.now() - new Date(cached.fetchedAt).getTime() < IDEAS_TTL_MS) {
      return {
        ideas: Array.isArray(cached.payload) ? cached.payload : [],
        fromCache: true,
        fetchedAt: cached.fetchedAt,
      };
    }
  }

  const ideas = await fetchKeywordIdeas(siteUrl, seedKeywords, { geoTargetId: geo, languageId });
  await writeCache(siteUrl, "keyword_ideas", geo, languageId, ideas);
  return { ideas, fromCache: false, fetchedAt: new Date() };
}

/** Lookup metrics for a single keyword (uses cache when present). */
export async function getMetricsForKeyword(keyword, { siteUrl = "__global__", geoTargetId, languageId, forceRefresh } = {}) {
  const { metrics } = await getHistoricalMetricsForSite(
    siteUrl,
    [keyword],
    { geoTargetId, languageId, forceRefresh }
  );
  return metrics.get(normKeyword(keyword)) || null;
}
