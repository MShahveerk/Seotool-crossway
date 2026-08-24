/**
 * Score Google Trends against a project's keyword harvest.
 * The Decider prefers relevant world trends, then overlap (library×trend or
 * Search Console ∩ library), then the keyword library. Closed list only.
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

function brandTokenSet(harvest) {
  const brief = harvest?.brief || {};
  const parts = [brief.category, brief.brandName];
  for (const s of brief.services || []) parts.push(s.name || s);
  for (const s of brief.seeds || []) parts.push(s.phrase || s);
  return tokens(parts.filter(Boolean).join(" "));
}

const GENERIC_DUMP =
  /^(how much (does|do) .{0,48} (cost|make|earn)|what is the (average )?salary|everything you need to know|complete guide|ultimate guide)/i;
const WORLD_NOISE =
  /\b(taylor swift|beyonce|kardashian|nfl|nba|mlb|premier league|ufc|trump|biden|celebrity|onlyfans)\b/i;

function isQualityPhrase(q) {
  const s = String(q || "").trim();
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 10) return false;
  if (s.length < 8 || s.length > 80) return false;
  if (WORLD_NOISE.test(s)) return false;
  return true;
}

function dumpPenalty(q) {
  return GENERIC_DUMP.test(String(q || "")) ? 400000 : 0;
}

function relevanceScore(query, harvestTok, brandTok) {
  const t = tokens(query);
  const harvest = jaccard(t, harvestTok);
  if (harvest >= 0.08) return harvest;
  let brandHits = 0;
  for (const x of t) if (brandTok.has(x) && x.length >= 4) brandHits += 1;
  if (brandHits >= 1) return 0.05 + brandHits * 0.03;
  return 0;
}

export function marketToTrendsGeo(market) {
  const id = String(market || "us").toLowerCase();
  return MARKET_GEO[id] || "US";
}

/**
 * Relevant world trends for this brand. The Decider may pick these as the seed.
 */
export async function collectTrendCandidates(harvest, { market = "us" } = {}) {
  const geo = marketToTrendsGeo(market || harvest?.market);
  const harvestTok = harvestTokenSet(harvest);
  const byQuery = new Map();

  const brandTok = brandTokenSet(harvest);
  const add = (query, extra = {}) => {
    const q = String(query || "").trim();
    if (!q || q.length < 3) return;
    if (WORLD_NOISE.test(q)) return;
    const score = relevanceScore(q, harvestTok, brandTok);
    if (score < 0.05 && extra.source !== "related" && extra.source !== "rising") return;
    const key = q.toLowerCase();
    const prev = byQuery.get(key);
    const next = {
      id: key.replace(/[^a-z0-9]+/g, "-").slice(0, 48) || `c-${byQuery.size}`,
      query: q,
      score: Math.max(score, prev?.score || 0),
      source: extra.source || prev?.source || "trends",
      lane: "world",
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

  const featured = (harvest?.topics || [])
    .flatMap((t) => t.featured || [])
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .slice(0, 4);
  const seeds = [
    ...new Set(
      [
        harvest?.brief?.category,
        harvest?.brief?.brandName,
        ...(harvest?.brief?.seeds || []).map((s) => s.phrase || s),
        ...(harvest?.brief?.services || []).map((s) => s.name || s),
        ...featured,
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
 * Closed list from Research — featured + universe keywords, not dump cluster titles.
 * Prefers gap/strike, real volume, mid/low KD, 3–7 word phrases.
 */
export function collectHarvestCandidates(harvest) {
  const byQuery = new Map();
  let i = 0;

  const consider = (query, extra = {}) => {
    const q = String(query || "").trim();
    if (!isQualityPhrase(q)) return;
    const key = q.toLowerCase();
    const words = q.split(/\s+/).length;
    const wordBonus = words >= 3 && words <= 7 ? 8000 : 0;
    const featuredBonus = extra.featured ? 20000 : 0;
    const score =
      harvestScore({
        posture: extra.posture,
        kd: extra.kd,
        volume: extra.volume,
        trendDirection: extra.trendDirection,
      }) +
      wordBonus +
      featuredBonus -
      dumpPenalty(q);
    const prev = byQuery.get(key);
    if (prev && prev.score >= score) return;
    byQuery.set(key, {
      id: candidateId(q, i++),
      query: q,
      source: "harvest",
      lane: "library",
      score,
      posture: extra.posture || "gap",
      kd: extra.kd ?? null,
      volume: extra.volume || null,
      trendDirection: extra.trendDirection || null,
      cluster: extra.cluster || null,
    });
  };

  for (const topic of harvest?.topics || []) {
    const posture = topicPosture(topic);
    const trend = topicTrend(topic);
    const featuredSet = new Set((topic.featured || []).map((k) => String(k).toLowerCase()));
    for (const phrase of topic.featured || []) {
      consider(phrase, {
        featured: true,
        posture,
        trendDirection: trend,
        cluster: topic.name,
        kd: topicKd(topic),
        volume: topicVolume(topic),
      });
    }
    const rows = [...(topic.keywords || [])].sort((a, b) => {
      const ad = a.difficulty == null ? 99 : Number(a.difficulty);
      const bd = b.difficulty == null ? 99 : Number(b.difficulty);
      return ad - bd || (Number(b.volume) || 0) - (Number(a.volume) || 0);
    });
    for (const row of rows) {
      const kd = row.difficulty == null ? null : Number(row.difficulty);
      const volume = Number(row.volume) || 0;
      if (kd != null && kd > 58 && volume < 80) continue;
      if (volume < 10 && !featuredSet.has(String(row.keyword || "").toLowerCase())) continue;
      consider(row.keyword, {
        featured: featuredSet.has(String(row.keyword || "").toLowerCase()),
        posture: row.posture || posture,
        kd,
        volume,
        trendDirection: row.trendDirection || trend,
        cluster: topic.name,
      });
    }
    if (![...byQuery.values()].some((c) => c.cluster === topic.name)) {
      consider(topic.primary || topic.name, {
        posture,
        kd: topicKd(topic),
        volume: topicVolume(topic),
        trendDirection: trend,
        cluster: topic.name,
      });
    }
  }

  if (byQuery.size < 12 && Array.isArray(harvest?.universe)) {
    for (const row of harvest.universe) {
      const kd = row.difficulty == null ? null : Number(row.difficulty);
      const volume = Number(row.volume) || 0;
      if (volume < 20) continue;
      if (kd != null && kd > 50) continue;
      consider(row.keyword, {
        posture: row.posture || "gap",
        kd,
        volume,
        trendDirection: row.trendDirection,
        cluster: "universe",
      });
      if (byQuery.size >= 40) break;
    }
  }

  const ranked = [...byQuery.values()].sort((a, b) => b.score - a.score);
  const preferred = ranked.filter((c) => dumpPenalty(c.query) === 0);
  const dumps = ranked.filter((c) => dumpPenalty(c.query) > 0);
  const candidates = [...preferred, ...dumps.slice(0, preferred.length ? 2 : 6)].slice(0, 40);
  return {
    geo: marketToTrendsGeo(harvest?.market),
    source: "harvest",
    candidates,
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
    const hit = gscOverlap(c.query, queries);
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

function trendId(t, key) {
  const raw = String(t?.id || key || "");
  return raw.startsWith("trend-") ? raw.slice(0, 56) : `trend-${raw}`.slice(0, 56);
}

/**
 * Closed-list order for the Decider:
 * 1. Relevant world trends (already filtered to this brand)
 * 2. Better-than-library overlap (library×trend, Search Console ∩ library)
 * 3. Plain keyword library
 */
function mergeLibraryAndTrends(library, trends) {
  const lib = Array.isArray(library?.candidates) ? library.candidates : [];
  const world = (Array.isArray(trends?.candidates) ? trends.candidates : []).filter(
    (c) => c && c.source !== "harvest"
  );
  const seen = new Set();
  const worldLane = [];
  const overlapLane = [];
  const libraryLane = [];

  for (const t of world) {
    const key = String(t.query || "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    worldLane.push({
      ...t,
      id: trendId(t, key),
      lane: "world",
      score: Number(t.score || 0) + 80000,
    });
  }

  for (const c of lib) {
    const key = String(c.query || "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const hook = world.find(
      (t) =>
        jaccard(tokens(c.query), tokens(t.query)) >= 0.22 ||
        [...tokens(c.query)].some((w) => w.length >= 4 && tokens(t.query).has(w))
    );
    const gscHit = Number(c.gscImpressions) > 0 || library?.source === "gsc";
    const item = {
      ...c,
      lane: hook ? "library×trend" : gscHit ? "gsc" : "library",
      trendHook: hook?.query || null,
      score: Number(c.score || 0) + (hook ? 50000 : 0) + (gscHit && !hook ? 20000 : 0),
    };
    if (hook || gscHit) overlapLane.push(item);
    else libraryLane.push(item);
  }

  worldLane.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  overlapLane.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  libraryLane.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));

  const candidates = [...worldLane, ...overlapLane, ...libraryLane].slice(0, 40);
  return {
    geo: library?.geo || trends?.geo || "US",
    source: worldLane.length ? "trends+overlap+library" : library?.source || "harvest",
    candidates,
    trendHooks: worldLane.slice(0, 12),
    gscStatus: library?.gscStatus || null,
    trendingCount: trends?.trendingCount ?? world.length,
    errors: trends?.errors || [],
  };
}

/**
 * Prefer relevant world trends, then overlap (library×trend / GSC), then the
 * keyword library. Trends never invent phrases outside the filtered pack.
 */
export async function collectDeciderPack(
  harvest,
  { siteLink, useTrends = false, fallback = "harvest", operatorPack = null } = {}
) {
  const library =
    operatorPack && Array.isArray(operatorPack.candidates) && operatorPack.candidates.length
      ? operatorPack
      : fallback === "gsc"
        ? await collectGscHarvestCandidates(harvest, siteLink)
        : collectHarvestCandidates(harvest);

  let trends = { candidates: [], errors: [] };
  if (useTrends) {
    try {
      trends = await collectTrendCandidates(harvest, { market: harvest?.market });
    } catch (err) {
      trends = { candidates: [], errors: [err.message] };
    }
  }

  if (!library.candidates?.length && !trends.candidates?.length) {
    return { ...library, trendHooks: [], source: library.source || "harvest" };
  }
  if (!library.candidates?.length) {
    return mergeLibraryAndTrends({ ...library, candidates: [] }, trends);
  }
  return mergeLibraryAndTrends(library, trends);
}
