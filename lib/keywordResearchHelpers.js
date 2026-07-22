/**
 * Keyword research scoring and tagging (GSC performance × Planner market data).
 */

export function expectedCtrForPosition(position) {
  const p = Number(position) || 20;
  if (p <= 1) return 0.28;
  if (p <= 3) return 0.15;
  if (p <= 5) return 0.08;
  if (p <= 10) return 0.04;
  if (p <= 15) return 0.025;
  return 0.015;
}

export function computePriority(row) {
  const pos = Number(row.position) || 20;
  const impr = Number(row.impressions) || 0;
  const vol = Number(row.avgMonthlySearches) || 0;
  const gap = Math.max(0, 16 - pos);
  const volFactor = vol > 0 ? Math.log10(vol + 1) : 0.6;
  const comp = String(row.competition || "").toUpperCase();
  const competitionWeight = comp === "LOW" ? 1.15 : comp === "HIGH" ? 0.85 : 1;
  return Math.round(impr * gap * volFactor * competitionWeight);
}

export function tagKeywordRow(row) {
  const tags = [];
  const pos = Number(row.position) || 0;
  const vol = Number(row.avgMonthlySearches) || 0;
  const impr = Number(row.impressions) || 0;
  const ctr = Number(row.ctr) || 0;
  const expected = expectedCtrForPosition(pos);

  if (pos >= 8 && pos <= 15 && vol >= 100) tags.push("worth_fighting");
  if (pos > 15 && vol >= 300 && row.competition !== "HIGH") tags.push("hidden_gem");
  if (pos <= 10 && impr >= 50 && ctr < expected * 0.65) tags.push("ctr_fix");
  if (pos <= 5 && vol > 0 && vol < 50) tags.push("low_volume");
  if (pos <= 3 && vol >= 500) tags.push("defend");

  return tags;
}

export const TAG_META = {
  worth_fighting: { label: "Worth fighting for", chip: "bg-emerald-100 text-emerald-800" },
  hidden_gem: { label: "Hidden gem", chip: "bg-sky-100 text-sky-800" },
  ctr_fix: { label: "Fix CTR", chip: "bg-amber-100 text-amber-800" },
  low_volume: { label: "Low market volume", chip: "bg-gray-100 text-gray-600" },
  defend: { label: "Defend", chip: "bg-lime-100 text-lime-800" },
};

export function topPageByQuery(pairs) {
  const map = new Map();
  for (const row of pairs || []) {
    const q = String(row.query || "").trim().toLowerCase();
    if (!q) continue;
    const existing = map.get(q);
    if (!existing || (row.clicks || 0) > (existing.clicks || 0)) {
      map.set(q, row);
    }
  }
  return map;
}

export function mergeQueryWithMetrics(gscRow, metricsMap, pageMap) {
  const key = String(gscRow.query || "").trim().toLowerCase();
  const metrics = metricsMap.get(key) || null;
  const pageRow = pageMap.get(key);

  const merged = {
    query: gscRow.query,
    page: pageRow?.page || "",
    clicks: gscRow.clicks || 0,
    impressions: gscRow.impressions || 0,
    ctr: gscRow.ctr || 0,
    position: gscRow.position || 0,
    avgMonthlySearches: metrics?.avgMonthlySearches ?? null,
    competition: metrics?.competition ?? null,
    competitionIndex: metrics?.competitionIndex ?? null,
    lowTopOfPageBid: metrics?.lowTopOfPageBid ?? null,
    highTopOfPageBid: metrics?.highTopOfPageBid ?? null,
    monthlyTrend: metrics?.monthlyTrend || [],
    plannerAvailable: Boolean(metrics),
  };

  merged.priority = computePriority(merged);
  merged.tags = tagKeywordRow(merged);
  return merged;
}
