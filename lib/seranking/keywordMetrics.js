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
    await saveSnapshot({
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
  const cached = await getCachedSnapshot(
    siteUrl,
    DATA_TYPES.KEYWORD_METRIC,
    `${source}:${normKeyword(keyword)}`
  );
  if (!cached?.payload || cached.expired) return null;
  return cached.payload;
}

export async function loadVolumeByCountry(siteUrl, keyword, { primarySource, extraSources = null } = {}) {
  const sources = [
    primarySource,
    ...(extraSources || volumeCountryCodes()).filter((s) => s !== primarySource),
  ];
  const seen = new Set();
  const entries = [];

  for (const source of sources) {
    if (!source || seen.has(source)) continue;
    seen.add(source);
    const cached = await readCachedKeywordMetric(siteUrl, keyword, source);
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
  { allowManual = true, force = false } = {}
) {
  const map = new Map();
  if (!isSerankingConfigured()) {
    return { metricsMap: map, creditsSpent: 0, fromCache: false, configured: false };
  }

  const source = geoToSerankingSource(geoKey);
  const list = [...new Set((keywords || []).map((k) => String(k || "").trim()).filter(Boolean))].slice(0, 50);
  if (!list.length) {
    return { metricsMap: map, creditsSpent: 0, fromCache: false, configured: true };
  }

  const batchKey = hashKeywords(list);
  const cacheSourceKey = `${source}:${batchKey}`;

  if (!force && siteUrl) {
    const cached = await getCachedSnapshot(siteUrl, DATA_TYPES.KEYWORD_EXPORT, cacheSourceKey);
    if (cached?.payload?.rows && !cached.expired) {
      for (const row of cached.payload.rows) {
        map.set(normKeyword(row.keyword), row);
      }
      return { metricsMap: map, creditsSpent: 0, fromCache: true, configured: true, source };
    }
  }

  const estimate = CREDIT_ESTIMATES.keywords_export_request;
  const data = await serankingRequest({
    method: "POST",
    path: "/keywords/export",
    query: { source },
    body: { keywords: list, sort: "volume", sort_order: "desc" },
    creditEstimate: estimate,
    creditsOnSuccess: estimate,
    siteUrl: siteUrl || null,
    allowManual,
    endpointLabel: "keywords/export",
  });

  const rows = (Array.isArray(data) ? data : [])
    .map((row) => normalizeSerankingExportRow(row, source))
    .filter(Boolean);

  for (const row of rows) {
    map.set(normKeyword(row.keyword), row);
  }

  if (siteUrl) {
    await saveSnapshot({
      siteUrl,
      dataType: DATA_TYPES.KEYWORD_EXPORT,
      sourceKey: cacheSourceKey,
      payload: { rows, keywords: list, source },
      creditsSpent: estimate,
    });
    await cacheKeywordMetrics(siteUrl, rows, source);
  }

  return { metricsMap: map, creditsSpent: estimate, fromCache: false, configured: true, source };
}

export function buildSerankingMetrics(serankingRow, { volumeByCountry = [], existingPosition = null } = {}) {
  if (!serankingRow) return null;

  const block = {
    available: true,
    source: serankingRow.source,
    volume: serankingRow.volume ?? null,
    difficulty: serankingRow.difficulty ?? null,
    cpc: serankingRow.cpc ?? null,
    cpcFormatted: formatSerankingCpc(serankingRow.cpc),
    competition: serankingRow.competition ?? null,
    competitionLevel: serankingRow.competitionLevel ?? null,
    monthlyTrend: serankingRow.monthlyTrend || [],
    volumeByCountry: volumeByCountry.length ? volumeByCountry : [],
    intents: serankingRow.intents || [],
  };

  block.trafficPotential = computeTrafficPotential({
    volume: block.volume,
    difficulty: block.difficulty,
    existingPosition,
  });

  return block;
}
