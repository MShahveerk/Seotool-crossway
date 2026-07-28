/**
 * SE Ranking keyword metrics — normalize export data, cache per keyword/country,
 * and build standalone metric blocks (separate from Google Ads).
 */
import crypto from "crypto";
import { expectedCtrForPosition } from "../keywordResearchHelpers.js";
import { getCachedSnapshot, saveSnapshot } from "./cache.js";
import {
  CREDIT_ESTIMATES,
  DATA_TYPES,
  geoToSerankingSource,
  isSerankingConfigured,
  SERANKING_COUNTRY_LABELS,
  volumeCountryCodes,
} from "./config.js";
import { serankingRequest } from "./client.js";

/** Cache bucket for AI keyword research (not tied to a GSC site). */
export const RESEARCH_CACHE_SITE = "__keyword_research__";

function normKeyword(k) {
  return String(k || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function hashKeywords(keywords) {
  const sorted = [...keywords].map(normKeyword).filter(Boolean).sort().join("|");
  return crypto.createHash("sha256").update(sorted).digest("hex").slice(0, 20);
}

export function historyTrendToMonthlyTrend(historyTrend) {
  if (!historyTrend || typeof historyTrend !== "object") return [];
  return Object.entries(historyTrend)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, searches]) => {
      const [year, month] = date.split("-");
      return {
        month,
        year,
        searches: searches != null ? Number(searches) : null,
      };
    })
    .filter((t) => t.searches != null);
}

export function competitionLevelFromFloat(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0.33) return "LOW";
  if (n > 0.66) return "HIGH";
  return "MEDIUM";
}

export function formatSerankingCpc(cpc) {
  const n = Number(cpc);
  if (!Number.isFinite(n)) return null;
  return `$${n.toFixed(2)}`;
}

export function normalizeSerankingExportRow(row, source) {
  if (!row || row.is_data_found === false) return null;
  const keyword = String(row.keyword || "").trim();
  if (!keyword) return null;

  const volume = row.volume != null ? Number(row.volume) : null;
  const difficulty = row.difficulty != null ? Number(row.difficulty) : null;
  const cpc = row.cpc != null ? Number(row.cpc) : null;
  const competition = row.competition != null ? Number(row.competition) : null;

  return {
    keyword,
    source,
    volume,
    difficulty,
    cpc,
    competition,
    competitionLevel: competitionLevelFromFloat(competition),
    monthlyTrend: historyTrendToMonthlyTrend(row.history_trend),
    intents: Array.isArray(row.intents) ? row.intents : [],
    isDataFound: true,
  };
}

export function assembleVolumeByCountry(primarySource, primaryVolume, cachedEntries = []) {
  const entries = [...(cachedEntries || [])];
  if (primaryVolume != null && primarySource) {
    const label = SERANKING_COUNTRY_LABELS[primarySource] || primarySource.toUpperCase();
    const idx = entries.findIndex((e) => e.source === primarySource);
    if (idx >= 0) entries[idx] = { ...entries[idx], volume: primaryVolume };
    else entries.unshift({ source: primarySource, label, volume: primaryVolume });
  }
  return entries.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
}

async function safeGetCachedSnapshot(siteUrl, dataType, sourceKey) {
  try {
    return await getCachedSnapshot(siteUrl, dataType, sourceKey);
  } catch (error) {
    console.warn("SE Ranking cache read failed:", error.message);
    return null;
  }
}

async function safeSaveSnapshot(args) {
  try {
    await saveSnapshot(args);
  } catch (error) {
    console.warn("SE Ranking cache write failed:", error.message);
  }
}

export function computeTrafficPotential(row) {
  const vol = Number(row.avgMonthlySearches ?? row.volume ?? row.volumeEstimate) || 0;
  if (vol <= 0) return null;

  let targetPos;
  if (row.existingPosition != null && row.existingPosition > 0) {
    targetPos = Math.max(1, Math.min(10, Math.round(row.existingPosition) - 2));
  } else {
    const kd = Number(row.keywordDifficulty ?? row.difficulty) || 50;
    targetPos = Math.max(3, Math.min(15, 3 + Math.round(kd / 8)));
  }

  return Math.round(vol * expectedCtrForPosition(targetPos));
}

async function cacheKeywordMetrics(siteUrl, rows, source) {
  if (!siteUrl) return;
  for (const row of rows) {
    if (!row?.keyword) continue;
    await safeSaveSnapshot({
      siteUrl,
      dataType: DATA_TYPES.KEYWORD_METRIC,
      sourceKey: `${source}:${normKeyword(row.keyword)}`,
      payload: row,
      creditsSpent: 0,
    });
  }
}

async function readCachedKeywordMetric(siteUrl, keyword, source) {
  if (!siteUrl || !keyword) return null;
  const cached = await safeGetCachedSnapshot(
    siteUrl,
    DATA_TYPES.KEYWORD_METRIC,
    `${source}:${normKeyword(keyword)}`
  );
  if (!cached?.payload || cached.expired) return null;
  return cached.payload;
}

export async function loadVolumeByCountry(siteUrl, keyword, { primarySource, extraSources = null } = {}) {
  const cacheSite = siteUrl || RESEARCH_CACHE_SITE;
  const sources = [
    primarySource,
    ...(extraSources || volumeCountryCodes()).filter((s) => s !== primarySource),
  ];
  const seen = new Set();
  const entries = [];

  for (const source of sources) {
    if (!source || seen.has(source)) continue;
    seen.add(source);
    const cached = await readCachedKeywordMetric(cacheSite, keyword, source);
    const volume = cached?.volume;
    if (volume == null) continue;
    entries.push({
      source,
      label: SERANKING_COUNTRY_LABELS[source] || source.toUpperCase(),
      volume,
    });
  }

  return entries.sort((a, b) => b.volume - a.volume);
}

/**
 * Export keyword metrics for a batch (100 credits per request).
 * Returns Map<normalizedKeyword, normalizedRow>.
 */
export async function fetchSerankingMetricsMap(
  keywords,
  geoKey = "us",
  siteUrl = "",
  { allowManual = true, force = false, seedKeyword = null } = {}
) {
  const map = new Map();
  if (!isSerankingConfigured()) {
    return { metricsMap: map, creditsSpent: 0, fromCache: false, configured: false, error: null };
  }

  const source = geoToSerankingSource(geoKey);
  const cacheSite = siteUrl || RESEARCH_CACHE_SITE;
  const rawList = (keywords || []).map((k) => String(k || "").trim()).filter(Boolean);
  const seed = String(seedKeyword || rawList[0] || "").trim();
  const list = [...new Set(seed ? [seed, ...rawList] : rawList)].slice(0, 50);
  if (!list.length) {
    return { metricsMap: map, creditsSpent: 0, fromCache: false, configured: true, error: null };
  }

  const batchKey = hashKeywords(list);
  const cacheSourceKey = `${source}:${batchKey}`;
  let creditsSpent = 0;

  if (!force) {
    const cached = await safeGetCachedSnapshot(cacheSite, DATA_TYPES.KEYWORD_EXPORT, cacheSourceKey);
    if (cached?.payload?.rows && !cached.expired) {
      for (const row of cached.payload.rows) {
        map.set(normKeyword(row.keyword), row);
      }
      return { metricsMap: map, creditsSpent: 0, fromCache: true, configured: true, source, error: null };
    }
  }

  try {
    const estimate = CREDIT_ESTIMATES.keywords_export_request;
    const data = await serankingRequest({
      method: "POST",
      path: "/keywords/export",
      query: { source },
      body: { keywords: list, sort: "volume", sort_order: "desc" },
      creditEstimate: estimate,
      creditsOnSuccess: estimate,
      siteUrl: cacheSite,
      allowManual,
      endpointLabel: "keywords/export",
    });

    creditsSpent = estimate;
    const rows = (Array.isArray(data) ? data : [])
      .map((row) => normalizeSerankingExportRow(row, source))
      .filter(Boolean);

    for (const row of rows) {
      map.set(normKeyword(row.keyword), row);
    }

    await safeSaveSnapshot({
      siteUrl: cacheSite,
      dataType: DATA_TYPES.KEYWORD_EXPORT,
      sourceKey: cacheSourceKey,
      payload: { rows, keywords: list, source },
      creditsSpent: estimate,
    });
    await cacheKeywordMetrics(cacheSite, rows, source);

    // Seed missing from batch — retry single-keyword export once.
    if (seed && !map.has(normKeyword(seed))) {
      const retry = await serankingRequest({
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
      creditsSpent += estimate;
      const retryRows = (Array.isArray(retry) ? retry : [])
        .map((row) => normalizeSerankingExportRow(row, source))
        .filter(Boolean);
      for (const row of retryRows) {
        map.set(normKeyword(row.keyword), row);
      }
      await cacheKeywordMetrics(cacheSite, retryRows, source);
    }

    return { metricsMap: map, creditsSpent, fromCache: false, configured: true, source, error: null };
  } catch (error) {
    return {
      metricsMap: map,
      creditsSpent,
      fromCache: false,
      configured: true,
      source,
      error: error.message || "SE Ranking keyword export failed.",
    };
  }
}

export function buildSerankingMetrics(serankingRow, { volumeByCountry = [], existingPosition = null, primarySource = null } = {}) {
  if (!serankingRow) return null;

  const block = {
    available: true,
    source: serankingRow.source || primarySource,
    volume: serankingRow.volume ?? null,
    difficulty: serankingRow.difficulty ?? null,
    cpc: serankingRow.cpc ?? null,
    cpcFormatted: formatSerankingCpc(serankingRow.cpc),
    competition: serankingRow.competition ?? null,
    competitionLevel: serankingRow.competitionLevel ?? null,
    monthlyTrend: serankingRow.monthlyTrend || [],
    volumeByCountry: assembleVolumeByCountry(
      serankingRow.source || primarySource,
      serankingRow.volume,
      volumeByCountry
    ),
    intents: serankingRow.intents || [],
  };

  block.trafficPotential = computeTrafficPotential({
    volume: block.volume,
    difficulty: block.difficulty,
    existingPosition,
  });

  return block;
}
