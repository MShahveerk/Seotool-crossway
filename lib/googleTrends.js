/**
 * Score Google Trends against a project's keyword harvest.
 * Trends cannot be queried by domain — we intersect trend strings with the
 * Phase 1 universe / services / topic names.
 *
 * When SerpAPI is missing, the Decider uses a closed list from the last
 * Research library (harvest-only) or GSC queries ∩ harvest.
 */
import prisma from "./prisma.js";
import { fetchTrendingNow, fetchTrendsRelatedQueries } from "./serpapi.js";
import { getTopQueries } from "./searchconsole.js";
import { getDateRangeForPresetId } from "./searchConsoleDateRanges.js";
import { normalizeSiteOrigin } from "./validation.js";

const MARKET_GEO = {
  us: "US",
  uk: "GB",
  gb: "GB",
  ca: "CA",
  au: "AU",
  pk: "PK",
};

function cacheKey(kind, parts) {
  return `trends_cache:${kind}:${parts.filter(Boolean).join(":")}`;
}

async function readCache(key, ttlMs) {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } });
    if (!row?.value) return null;
    const parsed = JSON.parse(row.value);
    const at = parsed?.at ? new Date(parsed.at).getTime() : 0;
    if (!at || Date.now() - at > ttlMs) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

async function writeCache(key, data) {
  try {
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value: JSON.stringify({ at: new Date().toISOString(), data }) },
      update: { value: JSON.stringify({ at: new Date().toISOString(), data }) },
    });
  } catch {
    /* cache is best-effort */
  }
}

function tokens(s) {
  return new Set(
    String(s || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2)
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

function harvestTokenSet(harvest) {
  const parts = [];
  const brief = harvest?.brief || {};
  for (const s of brief.services || []) parts.push(s.name || s);
  for (const s of brief.seeds || []) parts.push(s.phrase || s);
  for (const t of harvest?.topics || []) {
    parts.push(t.name, t.primary, ...(t.featured || []).slice(0, 4));
  }
  const uni = (harvest?.universe || []).slice(0, 80).map((r) => r.keyword);
  parts.push(...uni);
  return tokens(parts.join(" "));
}

export function marketToTrendsGeo(market) {
  const id = String(market || "us").toLowerCase();
  return MARKET_GEO[id] || "US";
}

/**
 * Closed list of topic candidates: overlapping Trends + harvest topic names.
 */
export async function collectTrendCandidates(harvest, { market = "us" } = {}) {
  const geo = marketToTrendsGeo(market || harvest?.market);
  const harvestTok = harvestTokenSet(harvest);
  const byQuery = new Map();

  const add = (query, extra = {}) => {
    const q = String(query || "").trim();
    if (!q || q.length < 3) return;
    const score = jaccard(tokens(q), harvestTok);
    if (score < 0.08 && extra.source !== "harvest") return;
    const key = q.toLowerCase();
    const prev = byQuery.get(key);
    const next = {
      id: key.replace(/[^a-z0-9]+/g, "-").slice(0, 48) || `c-${byQuery.size}`,
      query: q,
      score: Math.max(score, prev?.score || 0),
      source: extra.source || prev?.source || "trends",
      volume: extra.volume ?? prev?.volume ?? null,
      increase: extra.increase ?? prev?.increase ?? null,
    };
    if (!prev || next.score > prev.score || (next.volume || 0) > (prev.volume || 0)) {
      byQuery.set(key, next);
    }
  };

  const nowKey = cacheKey("now", [geo, "24"]);
  let trending = await readCache(nowKey, 60 * 60 * 1000);
  if (!trending) {
    try {
      trending = await fetchTrendingNow({ geo, hours: 24 });
      await writeCache(nowKey, trending);
    } catch (err) {
      trending = [];
      trending.error = err.message;
    }
  }
  for (const row of trending || []) {
    add(row.query, { source: "trending_now", volume: row.volume, increase: row.increase });
    for (const b of row.breakdown || []) add(b, { source: "trending_now", volume: row.volume });
  }

  const seeds = [
    ...new Set(
      [
        ...(harvest?.brief?.seeds || []).map((s) => s.phrase || s),
        ...(harvest?.brief?.services || []).map((s) => s.name || s),
      ]
        .map((s) => String(s || "").trim())
        .filter(Boolean)
    ),
  ].slice(0, 8);

  const relatedErrors = [];
  for (const seed of seeds) {
    const relKey = cacheKey("related", [geo, seed.toLowerCase().slice(0, 80)]);
    let related = await readCache(relKey, 18 * 60 * 60 * 1000);
    if (!related) {
      try {
        related = await fetchTrendsRelatedQueries(seed, { geo });
        await writeCache(relKey, related);
      } catch (err) {
        relatedErrors.push(`${seed}: ${err.message}`);
        related = { rising: [], top: [] };
      }
    }
    for (const r of related.rising || []) add(r.query, { source: "rising", increase: r.value });
    for (const r of (related.top || []).slice(0, 10)) add(r.query, { source: "related", volume: r.value });
  }

  for (const t of harvest?.topics || []) {
    if (t.name) add(t.name, { source: "harvest" });
    if (t.primary) add(t.primary, { source: "harvest" });
  }

  const candidates = [...byQuery.values()].sort(
    (a, b) =>
      (b.source === "trending_now" || b.source === "rising" ? 1 : 0) -
        (a.source === "trending_now" || a.source === "rising" ? 1 : 0) ||
      b.score - a.score ||
      (Number(b.increase) || 0) - (Number(a.increase) || 0)
  );

  return {
    geo,
    source: "trends",
    candidates: candidates.slice(0, 40),
    trendingCount: Array.isArray(trending) ? trending.length : 0,
    seedCount: seeds.length,
    errors: relatedErrors.slice(0, 6),
  };
}

const POSTURE_RANK = { gap: 4, strike: 3, ask: 2, defend: 1 };
const TREND_RANK = { rising: 3, up: 3, stable: 1, declining: 0 };

function siteOrigin(siteLink) {
  const raw = String(siteLink || "").trim();
  if (!raw) return "";
  if (raw.startsWith("sc-domain:")) return `https://${raw.slice("sc-domain:".length)}`;
  return normalizeSiteOrigin(raw) || (raw.startsWith("http") ? raw : `https://${raw}`);
}

function candidateId(query, i) {
  const slug = String(query || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 48);
  return slug || `c-${i}`;
}

function normalizeTrend(value) {
  const t = String(value || "").toLowerCase().trim();
  if (t === "rising" || t === "up" || t === "positive") return "rising";
  if (t === "declining" || t === "down" || t === "negative") return "declining";
  if (t === "stable" || t === "flat") return "stable";
  return t || null;
}

function topicPosture(topic) {
  const counts = { gap: 0, strike: 0, ask: 0, defend: 0 };
  for (const row of topic?.keywords || []) {
    const p = row.posture || "gap";
    if (counts[p] != null) counts[p] += 1;
  }
  if (counts.gap + counts.strike >= Math.max(1, counts.defend + counts.ask)) {
    return counts.gap >= counts.strike ? "gap" : "strike";
  }
  let best = "gap";
  let n = -1;
  for (const [k, v] of Object.entries(counts)) {
    if (v > n) {
      n = v;
      best = k;
    }
  }
  return best;
}

function topicVolume(topic) {
  let max = 0;
  for (const row of topic?.keywords || []) {
    const v = Number(row.volume);
    if (Number.isFinite(v) && v > max) max = v;
  }
  return max;
}

function topicKd(topic) {
  if (topic?.easiestKd != null && Number.isFinite(Number(topic.easiestKd))) {
    return Number(topic.easiestKd);
  }
  let min = null;
  for (const row of topic?.keywords || []) {
    if (row.difficulty == null) continue;
    const d = Number(row.difficulty);
    if (!Number.isFinite(d)) continue;
    if (min == null || d < min) min = d;
  }
  return min;
}

function topicTrend(topic) {
  const primaryKey = String(topic?.primary || "").toLowerCase();
  let fromPrimary = null;
  const seen = { rising: 0, stable: 0, declining: 0 };
  for (const row of topic?.keywords || []) {
    const dir = normalizeTrend(row.trendDirection);
    if (!dir) continue;
    if (dir === "rising" || dir === "stable" || dir === "declining") seen[dir] += 1;
    if (String(row.keyword || "").toLowerCase() === primaryKey) fromPrimary = dir;
  }
  if (seen.rising > 0) return "rising";
  if (fromPrimary) return fromPrimary;
  if (seen.declining > 0 && seen.stable === 0) return "declining";
  if (seen.stable > 0) return "stable";
  return fromPrimary;
}

function harvestScore({ posture, kd, volume, trendDirection }) {
  const kdScore = kd == null ? 40 : Math.max(0, 100 - Number(kd));
  return (
    (POSTURE_RANK[posture] || 0) * 100000 +
    (TREND_RANK[trendDirection] || 0) * 10000 +
    Math.min(Number(volume) || 0, 50000) +
    kdScore
  );
}

function sortHarvestCandidates(a, b) {
  return (
    (POSTURE_RANK[b.posture] || 0) - (POSTURE_RANK[a.posture] || 0) ||
    (TREND_RANK[b.trendDirection] || 0) - (TREND_RANK[a.trendDirection] || 0) ||
    (Number(b.volume) || 0) - (Number(a.volume) || 0) ||
    (a.kd == null ? 99 : Number(a.kd)) - (b.kd == null ? 99 : Number(b.kd))
  );
}

/**
 * Closed list from Research topics only — never invents phrases.
 * Prefers gap/strike, rising SE Ranking trend, real volume, then low KD.
 */
export function collectHarvestCandidates(harvest) {
  const byQuery = new Map();
  let i = 0;
  for (const topic of harvest?.topics || []) {
    const phrases = [topic.name, topic.primary]
      .map((s) => String(s || "").trim())
      .filter((s) => s.length >= 3);
    const posture = topicPosture(topic);
    const kd = topicKd(topic);
    const volume = topicVolume(topic);
    const trend = topicTrend(topic);
    for (const query of phrases) {
      const key = query.toLowerCase();
      if (byQuery.has(key)) continue;
      const row = {
        id: candidateId(query, i++),
        query,
        source: "harvest",
        score: harvestScore({ posture, kd, volume, trendDirection: trend }),
        posture,
        kd,
        volume: volume || null,
        trendDirection: trend,
        cluster: topic.name || null,
      };
      byQuery.set(key, row);
    }
  }
  const candidates = [...byQuery.values()].sort(sortHarvestCandidates);
  return {
    geo: marketToTrendsGeo(harvest?.market),
    source: "harvest",
    candidates: candidates.slice(0, 40),
    gscStatus: null,
  };
}

function gscOverlap(phrase, queries) {
  const p = String(phrase || "").toLowerCase().trim();
  if (!p) return null;
  const pTok = tokens(p);
  let best = null;
  for (const row of queries) {
    const q = String(row.query || "").toLowerCase().trim();
    if (!q || q === "unknown") continue;
    let kind = null;
    if (q === p) kind = "exact";
    else if (q.includes(p) || p.includes(q)) kind = "contains";
    else if (jaccard(pTok, tokens(q)) >= 0.45) kind = "overlap";
    if (!kind) continue;
    const impressions = Number(row.impressions) || 0;
    const clicks = Number(row.clicks) || 0;
    const rank = (kind === "exact" ? 3 : kind === "contains" ? 2 : 1) * 1e9 + impressions * 10 + clicks;
    if (!best || rank > best.rank) {
      best = {
        gscQuery: row.query,
        gscImpressions: impressions,
        gscClicks: clicks,
        gscMatch: kind,
        rank,
      };
    }
  }
  return best;
}

function topicGscHit(topic, queries) {
  const phrases = [
    topic.name,
    topic.primary,
    ...(topic.featured || []).slice(0, 8),
    ...(topic.keywords || []).slice(0, 12).map((k) => k.keyword),
  ];
  let best = null;
  for (const phrase of phrases) {
    const hit = gscOverlap(phrase, queries);
    if (hit && (!best || hit.rank > best.rank)) best = hit;
  }
  return best;
}

/**
 * Rank harvest topics that also appear in Search Console queries.
 * If GSC is missing or returns nothing, degrades to harvest-only (silent).
 */
export async function collectGscHarvestCandidates(harvest, siteLink) {
  const base = collectHarvestCandidates(harvest);
  const origin = siteOrigin(siteLink);
  if (!origin) return { ...base, gscStatus: "unavailable" };

  let queries = [];
  try {
    const { startDate, endDate } = getDateRangeForPresetId("28d");
    const res = await getTopQueries(origin, startDate, endDate, 50);
    queries = Array.isArray(res?.queries) ? res.queries : [];
  } catch {
    return { ...base, gscStatus: "unavailable" };
  }
  if (!queries.length) return { ...base, gscStatus: "empty" };

  const matched = [];
  for (const c of base.candidates) {
    const topic = (harvest?.topics || []).find(
      (t) =>
        String(t.name || "").toLowerCase() === c.query.toLowerCase() ||
        String(t.primary || "").toLowerCase() === c.query.toLowerCase()
    );
    const hit = topic ? topicGscHit(topic, queries) : gscOverlap(c.query, queries);
    if (!hit) continue;
    matched.push({
      ...c,
      source: "gsc",
      gscQuery: hit.gscQuery,
      gscImpressions: hit.gscImpressions,
      gscClicks: hit.gscClicks,
      gscMatch: hit.gscMatch,
      score: c.score + Math.min(hit.gscImpressions, 50000) + hit.gscClicks * 20,
    });
  }

  if (!matched.length) return { ...base, gscStatus: "no-overlap" };

  matched.sort(
    (a, b) =>
      (Number(b.gscImpressions) || 0) - (Number(a.gscImpressions) || 0) ||
      (Number(b.gscClicks) || 0) - (Number(a.gscClicks) || 0) ||
      sortHarvestCandidates(a, b)
  );

  return {
    geo: base.geo,
    source: "gsc",
    candidates: matched.slice(0, 40),
    gscStatus: "matched",
    gscQueryCount: queries.length,
  };
}

/**
 * Closed candidate list for the Topic Decider.
 * Trends when SerpAPI is ready; otherwise harvest-only or GSC ∩ harvest.
 */
export async function collectDeciderPack(harvest, { siteLink, useTrends = false, fallback = "harvest" } = {}) {
  if (useTrends) {
    return collectTrendCandidates(harvest, { market: harvest?.market });
  }
  if (fallback === "gsc") {
    return collectGscHarvestCandidates(harvest, siteLink);
  }
  return collectHarvestCandidates(harvest);
}
