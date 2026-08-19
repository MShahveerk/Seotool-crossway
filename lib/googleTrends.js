/**
 * Score Google Trends against a project's keyword harvest.
 * Trends cannot be queried by domain — we intersect trend strings with the
 * Phase 1 universe / services / topic names.
 */
import prisma from "./prisma.js";
import { fetchTrendingNow, fetchTrendsRelatedQueries } from "./serpapi.js";

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
    candidates: candidates.slice(0, 40),
    trendingCount: Array.isArray(trending) ? trending.length : 0,
    seedCount: seeds.length,
    errors: relatedErrors.slice(0, 6),
  };
}
