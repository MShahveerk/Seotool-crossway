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
import { discoverAutocompleteKeywords } from "./keywordAutocomplete.js";

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
  let plannerMeta = { configured: isGoogleAdsConfigured(), fromCache: false, fetchedAt: null, error: null, method: "planner" };

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

  // Fallback: free autocomplete when Planner is unavailable or returned nothing
  if (!ideas.length) {
    try {
      const fallbackSeeds =
        seedKeywords.length > 0
          ? seedKeywords
          : deriveSeedsFromSite(siteUrl, queriesResult.queries || []);
      if (fallbackSeeds.length) {
        const { keywords, meta } = await discoverAutocompleteKeywords(fallbackSeeds, { existingQueries, geoKey });
        ideas = keywords.map((k) => ({
          keyword: k.keyword,
          avgMonthlySearches: null,
          competition: null,
          monthlyTrend: [],
          sources: k.sources,
          priority: k.priority,
          tags: k.tags,
          isNewTopic: k.isNewTopic,
          existingPosition: k.existingPosition,
        }));
        plannerMeta = {
          ...plannerMeta,
          configured: false,
          method: "autocomplete",
          autocompleteMeta: meta,
          fetchedAt: new Date().toISOString(),
        };
      }
    } catch (err) {
      if (!plannerMeta.error) plannerMeta.error = err.message || "Autocomplete discovery failed";
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
      isNewTopic: idea.isNewTopic ?? !existingQueries.has(String(idea.keyword || "").toLowerCase()),
      existingPosition:
        idea.existingPosition ?? existingQueries.get(String(idea.keyword || "").toLowerCase()) ?? null,
    }))
    .sort((a, b) => (b.priority ?? b.avgMonthlySearches ?? 0) - (a.priority ?? a.avgMonthlySearches ?? 0))
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

/** Derive seed keywords from site URL hostname + top GSC queries. */
function deriveSeedsFromSite(siteUrl, gscQueries = []) {
  let brand = "";
  try {
    const host = new URL(siteUrl).hostname.replace(/^www\./, "");
    brand = host.split(".")[0].toLowerCase();
  } catch {
    /* ignore */
  }

  const navigational = /^(login|sign in|signin|password|contact|about|home|website|official site)\b/i;
  const isBadSeed = (query) => {
    const q = String(query || "").trim().toLowerCase();
    if (q.length < 4) return true;
    if (navigational.test(q)) return true;
    if (brand && brand.length > 2 && (q === brand || q === `${brand} login` || q === `${brand} website`)) return true;
    const tokens = q.split(/\s+/);
    if (brand && tokens.length === 1 && tokens[0] === brand) return true;
    if (brand && tokens.every((t) => t === brand || t.length <= 2)) return true;
    return false;
  };

  const fromGsc = (gscQueries || [])
    .filter((q) => q.query && !isBadSeed(q.query))
    .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
    .slice(0, 5)
    .map((q) => q.query)
    .filter(Boolean);

  if (fromGsc.length) return fromGsc;

  return [];
}

/**
 * Suggest keywords via free autocomplete (Google, Bing, YouTube).
 * Seeds come from the `seed` param and/or top GSC queries for the site.
 */
export async function buildSuggestKeywordResearch(siteUrl, range = "28d", geoKey = "us", { seed = "", forceRefresh = false } = {}) {
  let { startDate, endDate } = getDateRangeForPresetId(range);
  ({ startDate, endDate } = clampSearchConsoleQueryRange(startDate, endDate));
  const geo = resolveGeoTarget(geoKey);

  const queriesResult = await getTopQueries(siteUrl, startDate, endDate, 50).catch(() => ({ queries: [] }));

  const existingQueries = new Map();
  for (const q of queriesResult.queries || []) {
    existingQueries.set(String(q.query).toLowerCase(), q.position || 99);
  }

  const manualSeeds = String(seed || "")
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const seedKeywords =
    manualSeeds.length > 0
      ? manualSeeds.slice(0, 5)
      : deriveSeedsFromSite(siteUrl, queriesResult.queries || []);

  if (!seedKeywords.length) {
    const err = new Error(
      "Enter a topic seed keyword (e.g. \"dental implants\"). Auto-seeds from Search Console were skipped — they were mostly branded or navigational queries."
    );
    err.status = 400;
    throw err;
  }

  const { keywords, meta } = await discoverAutocompleteKeywords(seedKeywords, { existingQueries, geoKey });

  const summary = {
    total: keywords.length,
    newTopics: keywords.filter((k) => k.isNewTopic).length,
    multiSource: keywords.filter((k) => k.sources?.length >= 2).length,
    commercial: keywords.filter((k) => k.tags?.includes("commercial")).length,
    questions: keywords.filter((k) => k.tags?.includes("question")).length,
  };

  return {
    siteUrl,
    view: "suggest",
    dateRange: { startDate, endDate, range },
    geo: { key: geoKey, ...geo },
    method: "autocomplete",
    seedKeywords,
    keywords: keywords.slice(0, 120),
    summary,
    meta,
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
