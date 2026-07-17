/**
 * Pure SEO opportunity helpers (safe for client + server).
 */

function pctChange(curr, prev) {
  const c = Number(curr || 0);
  const p = Number(prev || 0);
  if (p <= 0) return c > 0 ? 100 : 0;
  return ((c - p) / p) * 100;
}

/**
 * Queries that appear on 2+ pages (keyword cannibalization).
 */
export function buildCannibalization(pairs, limit = 50) {
  const byQuery = new Map();
  for (const row of pairs || []) {
    const q = String(row.query || "").trim();
    if (!q) continue;
    if (!byQuery.has(q)) byQuery.set(q, []);
    byQuery.get(q).push(row);
  }
  const out = [];
  for (const [query, rows] of byQuery.entries()) {
    const uniquePages = Array.from(new Set(rows.map((r) => r.page).filter(Boolean)));
    if (uniquePages.length < 2) continue;
    const sorted = [...rows].sort((a, b) => (b.clicks || 0) - (a.clicks || 0));
    const totalClicks = rows.reduce((s, r) => s + (r.clicks || 0), 0);
    const totalImpr = rows.reduce((s, r) => s + (r.impressions || 0), 0);
    out.push({
      query,
      pageCount: uniquePages.length,
      totalClicks,
      totalImpressions: totalImpr,
      primaryPage: sorted[0]?.page || "",
      competingPages: uniquePages.slice(0, 5),
    });
  }
  return out
    .sort((a, b) => b.totalImpressions - a.totalImpressions || b.pageCount - a.pageCount)
    .slice(0, limit);
}

/**
 * Pages/queries that lost clicks vs previous equal-length period.
 */
export function buildDecayList(currentRows, previousRows, { keyField, limit = 40 } = {}) {
  const prevMap = new Map();
  for (const r of previousRows || []) {
    prevMap.set(String(r[keyField] || ""), r);
  }
  const decay = [];
  for (const curr of currentRows || []) {
    const key = String(curr[keyField] || "");
    if (!key) continue;
    const prev = prevMap.get(key);
    if (!prev) continue;
    const clickDelta = (curr.clicks || 0) - (prev.clicks || 0);
    // Decay: meaningful prior traffic and clear click loss
    if ((prev.clicks || 0) < 5 && (prev.impressions || 0) < 80) continue;
    if (clickDelta >= -2 && pctChange(curr.clicks, prev.clicks) > -15) continue;
    decay.push({
      [keyField]: key,
      clicks: curr.clicks || 0,
      previousClicks: prev.clicks || 0,
      clickChangePct: pctChange(curr.clicks, prev.clicks),
      impressions: curr.impressions || 0,
      previousImpressions: prev.impressions || 0,
      impressionChangePct: pctChange(curr.impressions, prev.impressions),
      position: curr.position || 0,
      previousPosition: prev.position || 0,
      ctr: curr.ctr || 0,
    });
  }
  return decay
    .sort((a, b) => a.clickChangePct - b.clickChangePct || (b.previousClicks || 0) - (a.previousClicks || 0))
    .slice(0, limit);
}

/**
 * Mobile vs desktop performance gaps.
 */
export function buildDeviceGaps(devices) {
  const by = Object.fromEntries((devices || []).map((d) => [d.device, d]));
  const desktop = by.DESKTOP;
  const mobile = by.MOBILE;
  if (!desktop || !mobile) {
    return { hasGap: false, gaps: [], desktop, mobile, tablet: by.TABLET || null };
  }
  const gaps = [];
  const ctrGap = (desktop.ctr || 0) - (mobile.ctr || 0);
  const posGap = (mobile.position || 0) - (desktop.position || 0);
  if (ctrGap >= 0.02) {
    gaps.push({
      type: "ctr",
      severity: ctrGap >= 0.05 ? "high" : "medium",
      message: `Mobile CTR is ${(ctrGap * 100).toFixed(1)} pts lower than desktop — check mobile snippets and page experience.`,
    });
  }
  if (posGap >= 1.5) {
    gaps.push({
      type: "position",
      severity: posGap >= 3 ? "high" : "medium",
      message: `Mobile average position is ${posGap.toFixed(1)} worse than desktop — prioritize mobile usability / CWV.`,
    });
  }
  const mobileShare =
    (mobile.clicks || 0) / Math.max((desktop.clicks || 0) + (mobile.clicks || 0) + ((by.TABLET?.clicks) || 0), 1);
  if (mobileShare >= 0.55 && (mobile.ctr || 0) < (desktop.ctr || 0) * 0.75) {
    gaps.push({
      type: "mobile_dominant",
      severity: "high",
      message: "Mobile drives most clicks but underperforms on CTR — mobile SEO should be the priority.",
    });
  }
  return { hasGap: gaps.length > 0, gaps, desktop, mobile, tablet: by.TABLET || null };
}

/**
 * Sitemap health warnings from GSC list.
 */
export function buildSitemapWarnings(sitemaps) {
  const list = sitemaps || [];
  const warnings = [];
  if (list.length === 0) {
    warnings.push({
      type: "missing",
      severity: "high",
      message: "No sitemaps are submitted in Search Console for this property.",
    });
    return warnings;
  }
  const pending = list.filter((s) => s.isPending);
  if (pending.length) {
    warnings.push({
      type: "pending",
      severity: "medium",
      message: `${pending.length} sitemap(s) still pending processing in Google.`,
    });
  }
  const staleDays = 45;
  const now = Date.now();
  const stale = list.filter((s) => {
    if (!s.lastSubmitted) return true;
    const t = new Date(s.lastSubmitted).getTime();
    return Number.isFinite(t) && now - t > staleDays * 24 * 60 * 60 * 1000;
  });
  if (stale.length) {
    warnings.push({
      type: "stale",
      severity: "medium",
      message: `${stale.length} sitemap(s) have not been (re)submitted in ${staleDays}+ days.`,
    });
  }
  return warnings;
}
