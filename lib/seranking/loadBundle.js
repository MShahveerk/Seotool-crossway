/**
 * On-demand SE Ranking loaders — fetch live when cache is missing or expired.
 */
import { getCachedSnapshot } from "./cache.js";
import { DEFAULT_SOURCE, DATA_TYPES } from "./config.js";
import {
  fetchBacklinksSummary,
  fetchDomainOverview,
  fetchDomainCompetitors,
  fetchDomainKeywords,
  fetchSeedKeywords,
  fetchAiSearchAggregated,
  fetchAiSearchByEngine,
  resolveDomainFromSite,
} from "./api.js";
import {
  normalizeDomainOverview,
  normalizeDomainCompetitors,
  normalizeDomainKeywordsList,
  normalizeBacklinksSummary,
  normalizeAiSearchOverview,
  normalizeAiSearchByEngine,
} from "./normalize.js";
import { getTopQueries } from "../searchconsole.js";
import { getDateRangeForPresetId, clampSearchConsoleQueryRange } from "../searchConsoleDateRanges.js";
import { seedKeywordCount } from "./config.js";

export const SERANKING_SCHEDULES = [
  { id: "seranking", label: "SE Ranking snapshots", cron: "45 4 * * *", when: "Daily 04:45", note: "Backlinks, domain, keywords, seeds, audit rotation (~600 cr/day cap)" },
  { id: "authority", label: "Domain authority (Open PageRank)", cron: "30 4 * * *", when: "Daily 04:30" },
  { id: "site-audit", label: "Internal site crawl audit", cron: "30 3 * * *", when: "Daily 03:30" },
  { id: "site-explorer", label: "Common Crawl site explorer", cron: "0 5 * * *", when: "Daily 05:00" },
  { id: "pagespeed", label: "PageSpeed snapshots", cron: "10 */2 * * *", when: "Every 2 hours" },
  { id: "keyword-planner", label: "Google Keyword Planner cache", cron: "30 6 * * 1", when: "Mondays 06:30" },
  { id: "seo-weekly", label: "Sitemap resubmit + SEO digest", cron: "0 6 * * 1", when: "Mondays 06:00" },
  { id: "client-reports", label: "Weekly client reports", cron: "0 7 * * 1", when: "Mondays 07:00" },
  { id: "wordpress-pull", label: "WordPress draft pull", cron: "0 * * * *", when: "Hourly" },
  { id: "url-inspect", label: "URL inspection monitor", cron: "0 5 * * *", when: "Daily 05:00 (opt-in)" },
];

async function gscSeedQueries(siteUrl) {
  try {
    let { startDate, endDate } = getDateRangeForPresetId("28d");
    ({ startDate, endDate } = clampSearchConsoleQueryRange(startDate, endDate));
    const res = await getTopQueries(siteUrl, startDate, endDate, seedKeywordCount());
    return (res.queries || []).map((q) => q.query).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Return cached payload or fetch live. User-facing routes use allowManual: true.
 */
export async function ensureSerankingSnapshot(
  siteUrl,
  dataType,
  sourceKey,
  fetchLive,
  { allowManual = true, force = false } = {}
) {
  if (!force) {
    try {
      const cached = await getCachedSnapshot(siteUrl, dataType, sourceKey || "");
      if (cached?.payload && !cached.expired) {
        return {
          data: cached.payload,
          fromCache: true,
          fetchedAt: cached.fetchedAt,
          expiresAt: cached.expiresAt,
          creditsSpent: 0,
        };
      }
    } catch (error) {
      console.warn(`SE Ranking cache read (${dataType}):`, error.message);
    }
  }

  const result = await fetchLive({ allowManual, force: true });
  return {
    data: result.data,
    fromCache: Boolean(result.fromCache),
    creditsSpent: result.creditsSpent ?? 0,
    fetchedAt: new Date().toISOString(),
  };
}

export async function loadDomainIntelligence(siteUrl, { allowManual = true, force = false } = {}) {
  const domain = resolveDomainFromSite(siteUrl);
  let creditsSpent = 0;

  const [overview, competitors, keywords] = await Promise.all([
    ensureSerankingSnapshot(siteUrl, DATA_TYPES.DOMAIN_OVERVIEW, "", () => fetchDomainOverview(siteUrl, domain, { allowManual, force: true }), {
      allowManual,
      force,
    }),
    ensureSerankingSnapshot(siteUrl, DATA_TYPES.DOMAIN_COMPETITORS, "", () => fetchDomainCompetitors(siteUrl, domain, { allowManual, force: true }), {
      allowManual,
      force,
    }),
    ensureSerankingSnapshot(
      siteUrl,
      DATA_TYPES.DOMAIN_KEYWORDS,
      DEFAULT_SOURCE,
      () => fetchDomainKeywords(siteUrl, domain, { allowManual, force: true }),
      { allowManual, force }
    ),
  ]);

  creditsSpent += (overview.creditsSpent || 0) + (competitors.creditsSpent || 0) + (keywords.creditsSpent || 0);

  return {
    siteUrl,
    domain,
    overview: normalizeDomainOverview(overview.data),
    overviewRaw: overview.data,
    competitors: normalizeDomainCompetitors(competitors.data),
    keywords: normalizeDomainKeywordsList(keywords.data),
    fromCache: overview.fromCache && competitors.fromCache && keywords.fromCache,
    creditsSpent,
  };
}

/** Combined SEO performance snapshot — domain, backlinks, optional AI visibility. */
export async function loadSeoOverview(siteUrl, { allowManual = true, force = false, includeAi = false } = {}) {
  const domain = resolveDomainFromSite(siteUrl);
  let creditsSpent = 0;

  const [overviewRes, backlinksRes, competitorsRes, keywordsRes] = await Promise.all([
    ensureSerankingSnapshot(siteUrl, DATA_TYPES.DOMAIN_OVERVIEW, "", () => fetchDomainOverview(siteUrl, domain, { allowManual, force: true }), {
      allowManual,
      force,
    }),
    ensureSerankingSnapshot(siteUrl, DATA_TYPES.BACKLINKS_SUMMARY, "", () => fetchBacklinksSummary(siteUrl, domain, { allowManual, force: true }), {
      allowManual,
      force,
    }),
    ensureSerankingSnapshot(siteUrl, DATA_TYPES.DOMAIN_COMPETITORS, "", () => fetchDomainCompetitors(siteUrl, domain, { allowManual, force: true }), {
      allowManual,
      force,
    }),
    ensureSerankingSnapshot(
      siteUrl,
      DATA_TYPES.DOMAIN_KEYWORDS,
      DEFAULT_SOURCE,
      () => fetchDomainKeywords(siteUrl, domain, { allowManual, force: true }),
      { allowManual, force }
    ),
  ]);

  creditsSpent +=
    (overviewRes.creditsSpent || 0) +
    (backlinksRes.creditsSpent || 0) +
    (competitorsRes.creditsSpent || 0) +
    (keywordsRes.creditsSpent || 0);

  let aiOverview = null;
  let aiEngines = null;

  if (includeAi) {
    const aiRes = await ensureSerankingSnapshot(
      siteUrl,
      DATA_TYPES.AI_SEARCH_OVERVIEW,
      DEFAULT_SOURCE,
      () => fetchAiSearchAggregated(siteUrl, domain, { allowManual, force: true, source: DEFAULT_SOURCE }),
      { allowManual, force }
    );
    creditsSpent += aiRes.creditsSpent || 0;
    aiOverview = normalizeAiSearchOverview(aiRes.data);

    const engineResults = await Promise.allSettled([
      fetchAiSearchByEngine(siteUrl, domain, "chatgpt", { allowManual, source: DEFAULT_SOURCE }),
      fetchAiSearchByEngine(siteUrl, domain, "ai-mode", { allowManual, source: DEFAULT_SOURCE }),
    ]);
    aiEngines = {};
    for (const r of engineResults) {
      if (r.status === "fulfilled") {
        creditsSpent += r.value.creditsSpent || 0;
        aiEngines[r.value.engine] = normalizeAiSearchByEngine(r.value.data, r.value.engine);
      }
    }
  } else {
    try {
      const cachedAi = await getCachedSnapshot(siteUrl, DATA_TYPES.AI_SEARCH_OVERVIEW, DEFAULT_SOURCE);
      if (cachedAi?.payload && !cachedAi.expired) {
        aiOverview = normalizeAiSearchOverview(cachedAi.payload);
      }
    } catch {
      /* optional */
    }
  }

  const overview = normalizeDomainOverview(overviewRes.data);
  const backlinks = normalizeBacklinksSummary(backlinksRes.data);

  return {
    siteUrl,
    domain,
    overview,
    backlinks,
    competitors: normalizeDomainCompetitors(competitorsRes.data),
    keywords: normalizeDomainKeywordsList(keywordsRes.data),
    ai: aiOverview,
    aiEngines,
    fromCache:
      overviewRes.fromCache && backlinksRes.fromCache && competitorsRes.fromCache && keywordsRes.fromCache,
    creditsSpent,
  };
}

/** Cached SE Ranking metrics for Site Health (no live fetch unless refresh=1). */
export async function loadSerankingMetrics(siteUrl, { allowManual = true, force = false } = {}) {
  const domain = resolveDomainFromSite(siteUrl);

  const fetchIfNeeded = async (dataType, sourceKey, fetchLive) => {
    if (!force) {
      const cached = await getCachedSnapshot(siteUrl, dataType, sourceKey || "").catch(() => null);
      if (cached?.payload && !cached.expired) {
        return { data: cached.payload, fromCache: true, creditsSpent: 0 };
      }
    }
    if (!allowManual && !force) {
      const cached = await getCachedSnapshot(siteUrl, dataType, sourceKey || "").catch(() => null);
      return { data: cached?.payload || null, fromCache: true, creditsSpent: 0, stale: true };
    }
    return fetchLive({ allowManual, force: true });
  };

  const [overviewRes, backlinksRes] = await Promise.all([
    fetchIfNeeded(DATA_TYPES.DOMAIN_OVERVIEW, "", () => fetchDomainOverview(siteUrl, domain, { allowManual, force: true })),
    fetchIfNeeded(DATA_TYPES.BACKLINKS_SUMMARY, "", () => fetchBacklinksSummary(siteUrl, domain, { allowManual, force: true })),
  ]);

  return {
    siteUrl,
    domain,
    overview: normalizeDomainOverview(overviewRes.data),
    backlinks: normalizeBacklinksSummary(backlinksRes.data),
    creditsSpent: (overviewRes.creditsSpent || 0) + (backlinksRes.creditsSpent || 0),
    fromCache: Boolean(overviewRes.fromCache && backlinksRes.fromCache),
  };
}

export async function loadBacklinks(siteUrl, { allowManual = true, force = false } = {}) {
  const domain = resolveDomainFromSite(siteUrl);
  const result = await ensureSerankingSnapshot(
    siteUrl,
    DATA_TYPES.BACKLINKS_SUMMARY,
    "",
    () => fetchBacklinksSummary(siteUrl, domain, { allowManual, force: true }),
    { allowManual, force }
  );
  return {
    siteUrl,
    domain,
    data: result.data,
    summary: normalizeBacklinksSummary(result.data),
    fromCache: result.fromCache,
    fetchedAt: result.fetchedAt,
    expiresAt: result.expiresAt,
    creditsSpent: result.creditsSpent,
  };
}

export async function loadKeywordSeeds(siteUrl, { allowManual = true, force = false } = {}) {
  const domain = resolveDomainFromSite(siteUrl);
  let creditsSpent = 0;

  const seedsResult = await (async () => {
    const seedList = await gscSeedQueries(siteUrl);
    if (!seedList.length) {
      const cached = await getCachedSnapshot(siteUrl, DATA_TYPES.KEYWORDS_SEEDS, DEFAULT_SOURCE).catch(() => null);
      return { data: cached?.payload || [], fromCache: true, creditsSpent: 0, fetchedAt: cached?.fetchedAt };
    }
    return ensureSerankingSnapshot(
      siteUrl,
      DATA_TYPES.KEYWORDS_SEEDS,
      DEFAULT_SOURCE,
      () => fetchSeedKeywords(siteUrl, seedList, { allowManual, force: true }),
      { allowManual, force }
    );
  })();

  const domainKwResult = await ensureSerankingSnapshot(
    siteUrl,
    DATA_TYPES.DOMAIN_KEYWORDS,
    DEFAULT_SOURCE,
    () => fetchDomainKeywords(siteUrl, domain, { allowManual, force: true }),
    { allowManual, force }
  );

  creditsSpent = (seedsResult.creditsSpent || 0) + (domainKwResult.creditsSpent || 0);

  return {
    siteUrl,
    domain,
    seeds: seedsResult.data || [],
    domainKeywords: domainKwResult.data || null,
    seedsFetchedAt: seedsResult.fetchedAt,
    domainKeywordsFetchedAt: domainKwResult.fetchedAt,
    creditsSpent,
    fromCache: Boolean(seedsResult.fromCache && domainKwResult.fromCache),
  };
}
