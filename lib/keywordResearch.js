/**
 * Keyword Research — merges Search Console performance with Google Ads Keyword Planner data.
 */
import {
  getTopQueries,
  getQueryPageMatrix,
  getStrikingDistanceQueries,
} from "./searchconsole.js";
import {
  getDateRangeForPresetId,
  clampSearchConsoleQueryRange,
} from "./searchConsoleDateRanges.js";
import { isGoogleAdsConfigured } from "./googleAds.js";
import {
  getHistoricalMetricsForSite,
  getKeywordIdeasForSite,
  getMetricsForKeyword,
  resolveGeoTarget,
  GEO_TARGETS,
} from "./keywordPlanner.js";
import { mergeQueryWithMetrics, topPageByQuery } from "./keywordResearchHelpers.js";

const RANKED_QUERY_LIMIT = 200;
const DISCOVER_IDEA_LIMIT = 80;

export { GEO_TARGETS };

export function isKeywordResearchConfigured() {
  return isGoogleAdsConfigured();
}

/**
 * Build ranked keyword list: GSC queries enriched with Planner volume/trend.
 */
export async function buildRankedKeywordResearch(siteUrl, range = "28d", geoKey = "us", { forceRefresh = false } = {}) {
  let { startDate, endDate } = getDateRangeForPresetId(range);
  ({ startDate, endDate } = clampSearchConsoleQueryRange(startDate, endDate));
  const geo = resolveGeoTarget(geoKey);

  const [queriesResult, matrixResult, strikingResult] = await Promise.all([
    getTopQueries(siteUrl, startDate, endDate, RANKED_QUERY_LIMIT).catch(() => ({ queries: [] })),
    getQueryPageMatrix(siteUrl, startDate, endDate, 500).catch(() => ({ pairs: [] })),
    getStrikingDistanceQueries(siteUrl, startDate, endDate, 50).catch(() => ({ opportunities: [] })),
  ]);

  const queries = queriesResult.queries || [];
  const pageMap = topPageByQuery(matrixResult.pairs || []);
  const keywordTexts = queries.map((q) => q.query).filter(Boolean);

  let metricsMap = new Map();
  let plannerMeta = { configured: isGoogleAdsConfigured(), fromCache: false, fetchedAt: null, error: null };

  if (plannerMeta.configured && keywordTexts.length) {
    try {
      const { metrics, fromCache, fetchedAt } = await getHistoricalMetricsForSite(siteUrl, keywordTexts, {
        geoTargetId: geo.id,
        forceRefresh,
      });
      metricsMap = metrics;
      plannerMeta = { ...plannerMeta, fromCache, fetchedAt };
    } catch (err) {
      plannerMeta.error = err.message || "Keyword Planner fetch failed";
    }
  }

  const rows = queries
    .map((q) => mergeQueryWithMetrics(q, metricsMap, pageMap))
    .sort((a, b) => b.priority - a.priority || b.impressions - a.impressions);

  const summary = {
    total: rows.length,
    withPlannerData: rows.filter((r) => r.plannerAvailable).length,
    worthFighting: rows.filter((r) => r.tags.includes("worth_fighting")).length,
    hiddenGems: rows.filter((r) => r.tags.includes("hidden_gem")).length,
    ctrFixes: rows.filter((r) => r.tags.includes("ctr_fix")).length,
  };

  return {
    siteUrl,
    view: "ranked",
    dateRange: { startDate, endDate, range },
    geo: { key: geoKey, ...geo },
    planner: plannerMeta,
    strikingDistance: strikingResult.opportunities || [],
    rows,
    summary,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Discover new topics via Keyword Planner ideas, excluding queries already ranking top 20.
 */
export async function buildDiscoverKeywordResearch(siteUrl, range = "28d", geoKey = "us", { forceRefresh = false } = {}) {
  let { startDate, endDate } = getDateRangeForPresetId(range);
  ({ startDate, endDate } = clampSearchConsoleQueryRange(startDate, endDate));
  const geo = resolveGeoTarget(geoKey);

  const [queriesResult, matrixResult] = await Promise.all([
    getTopQueries(siteUrl, startDate, endDate, 100).catch(() => ({ queries: [] })),
    getQueryPageMatrix(siteUrl, startDate, endDate, 300).catch(() => ({ pairs: [] })),
  ]);

  const existingQueries = new Map();
  for (const q of queriesResult.queries || []) {
    existingQueries.set(String(q.query).toLowerCase(), q.position || 99);
  }

  const seedKeywords = (queriesResult.queries || [])
    .slice(0, 5)
    .map((q) => q.query)
    .filter(Boolean);

  let ideas = [];
  let plannerMeta = { configured: isGoogleAdsConfigured(), fromCache: false, fetchedAt: null, error: null };

  if (plannerMeta.configured) {
    try {
      const result = await getKeywordIdeasForSite(siteUrl, seedKeywords, {
        geoTargetId: geo.id,
        forceRefresh,
      });
      ideas = result.ideas || [];
      plannerMeta = { ...plannerMeta, fromCache: result.fromCache, fetchedAt: result.fetchedAt };
    } catch (err) {
      plannerMeta.error = err.message || "Keyword ideas fetch failed";
    }
  }

  const filtered = ideas
    .filter((idea) => {
      const key = String(idea.keyword || "").toLowerCase();
      const pos = existingQueries.get(key);
      return pos == null || pos > 20;
    })
    .map((idea) => ({
      ...idea,
      isNewTopic: !existingQueries.has(String(idea.keyword || "").toLowerCase()),
      existingPosition: existingQueries.get(String(idea.keyword || "").toLowerCase()) ?? null,
    }))
    .sort((a, b) => (b.avgMonthlySearches || 0) - (a.avgMonthlySearches || 0))
    .slice(0, DISCOVER_IDEA_LIMIT);

  return {
    siteUrl,
    view: "discover",
    dateRange: { startDate, endDate, range },
    geo: { key: geoKey, ...geo },
    planner: plannerMeta,
    seedKeywords,
    ideas: filtered,
    summary: {
      total: filtered.length,
      newTopics: filtered.filter((i) => i.isNewTopic).length,
    },
    generatedAt: new Date().toISOString(),
  };
}

/** Validate a single focus keyword for blog/content use. */
export async function validateFocusKeyword(keyword, geoKey = "us") {
  const geo = resolveGeoTarget(geoKey);
  if (!isGoogleAdsConfigured()) {
    return { configured: false, keyword, geo: { key: geoKey, ...geo }, metrics: null };
  }

  try {
    const metrics = await getMetricsForKeyword(keyword, {
      siteUrl: "__focus_keyword__",
      geoTargetId: geo.id,
    });
    return {
      configured: true,
      keyword,
      geo: { key: geoKey, ...geo },
      metrics,
      suggestion:
        metrics?.avgMonthlySearches != null && metrics.avgMonthlySearches < 30
          ? "Very low search volume — consider a broader related term."
          : null,
    };
  } catch (err) {
    return {
      configured: true,
      keyword,
      geo: { key: geoKey, ...geo },
      metrics: null,
      error: err.message || "Validation failed",
    };
  }
}
