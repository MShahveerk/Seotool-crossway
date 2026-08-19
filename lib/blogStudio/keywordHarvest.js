/**
 * Deep / Standard SE Ranking keyword harvest for Blog Studio research runs.
 * Cache-first. Never invents keywords — only unions what the API returns.
 */
import { toDomain } from "../authority.js";
import {
  fetchDomainCompetitors,
  fetchDomainKeywords,
  fetchKeywordResearch,
} from "../seranking/api.js";
import { normalizeDomainCompetitors, normalizeDomainKeywordsList } from "../seranking/normalize.js";
import { normKeyword } from "../seranking/keywordMetrics.js";
import { depthConfig } from "./researchDefaults.js";

async function mapPool(items, concurrency, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) || 1 }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

function compactRow(row, extra = {}) {
  const keyword = String(row?.keyword || "").trim();
  if (!keyword) return null;
  return {
    keyword,
    key: normKeyword(keyword),
    volume: Number.isFinite(Number(row.volume)) ? Number(row.volume) : null,
    difficulty: Number.isFinite(Number(row.difficulty)) ? Number(row.difficulty) : null,
    cpc: Number.isFinite(Number(row.cpc)) ? Number(row.cpc) : null,
    competition: Number.isFinite(Number(row.competition)) ? Number(row.competition) : null,
    intents: Array.isArray(row.intents) ? row.intents : [],
    position: row.position != null ? Number(row.position) : null,
    url: row.url || row.landing_url || null,
    traffic: row.traffic != null ? Number(row.traffic) : null,
    trendDirection: row.trendDirection || null,
    ...extra,
  };
}

function mergeRow(existing, incoming) {
  if (!existing) return incoming;
  const richer =
    (Number(incoming.volume) || 0) > (Number(existing.volume) || 0) ||
    (incoming.difficulty != null && existing.difficulty == null)
      ? incoming
      : existing;
  const seeds = [...new Set([...(existing.seeds || []), ...(incoming.seeds || [])])].filter(Boolean);
  const types = [...new Set([...(existing.researchTypes || []), ...(incoming.researchTypes || [])])];
  return {
    ...richer,
    seeds,
    researchTypes: types,
    position: existing.position ?? incoming.position ?? null,
    url: existing.url || incoming.url || null,
    traffic: existing.traffic ?? incoming.traffic ?? null,
    ownRank: Boolean(existing.ownRank || incoming.ownRank),
    rivalDomains: [...new Set([...(existing.rivalDomains || []), ...(incoming.rivalDomains || [])])],
  };
}

async function safeResearch(type, phrase, opts) {
  try {
    const res = await fetchKeywordResearch(type, phrase, opts);
    return {
      rows: Array.isArray(res?.data) ? res.data : [],
      creditsSpent: Number(res?.creditsSpent) || 0,
      fromCache: Boolean(res?.fromCache),
    };
  } catch (err) {
    return { rows: [], creditsSpent: 0, fromCache: false, error: err.message };
  }
}

export async function harvestKeywords({
  siteUrl,
  domain,
  seeds = [],
  depth = "deep",
  market = "us",
  onProgress = null,
} = {}) {
  const d = depthConfig(depth);
  const source = String(market || "us").toLowerCase();
  const phrases = [...new Set(seeds.map((s) => String(s.phrase || s).trim()).filter(Boolean))].slice(
    0,
    d.maxSeeds
  );
  const host = domain || toDomain(siteUrl);
  const cacheSite = siteUrl || host;

  let creditsSpent = 0;
  let liveCalls = 0;
  let cacheHits = 0;
  const errors = [];
  const byKey = new Map();

  const addRows = (rows, extra) => {
    for (const raw of rows || []) {
      const row = compactRow(raw, extra);
      if (!row) continue;
      byKey.set(row.key, mergeRow(byKey.get(row.key), row));
    }
  };

  const tally = (res) => {
    creditsSpent += Number(res.creditsSpent) || 0;
    if (res.fromCache) cacheHits += 1;
    else if (!res.error) liveCalls += 1;
    if (res.error) errors.push(res.error);
  };

  await onProgress?.({ phase: "own-keywords" });
  if (host && cacheSite) {
    try {
      const own = await fetchDomainKeywords(cacheSite, host, { allowManual: true });
      tally({ creditsSpent: own.creditsSpent, fromCache: own.fromCache });
      const rows = normalizeDomainKeywordsList(own.data, source);
      addRows(rows, { researchTypes: ["domain"], seeds: [], ownRank: true });
    } catch (err) {
      errors.push(`own keywords: ${err.message}`);
    }
  }

  let rivalHosts = [];
  if (d.rivalCap > 0 && host && cacheSite) {
    await onProgress?.({ phase: "rivals" });
    try {
      const comp = await fetchDomainCompetitors(cacheSite, host, { allowManual: true });
      tally({ creditsSpent: comp.creditsSpent, fromCache: comp.fromCache });
      rivalHosts = normalizeDomainCompetitors(comp.data)
        .map((c) => toDomain(c.domain))
        .filter((h) => h && h !== host)
        .slice(0, d.rivalCap);
    } catch (err) {
      errors.push(`competitors: ${err.message}`);
    }

    await mapPool(rivalHosts, d.concurrency, async (rival) => {
      try {
        const res = await fetchDomainKeywords(rival, rival, { allowManual: true });
        tally({ creditsSpent: res.creditsSpent, fromCache: res.fromCache });
        addRows(normalizeDomainKeywordsList(res.data, source), {
          researchTypes: ["rival"],
          seeds: [],
          rivalDomains: [rival],
        });
      } catch (err) {
        errors.push(`rival ${rival}: ${err.message}`);
      }
    });
  }

  const jobs = [];
  for (const phrase of phrases) {
    if (d.similarLimit > 0) jobs.push({ type: "similar", phrase, limit: d.similarLimit });
    if (d.relatedLimit > 0) jobs.push({ type: "related", phrase, limit: d.relatedLimit });
  }
  phrases.slice(0, d.questionsSeedCap).forEach((phrase) => {
    if (d.questionsLimit > 0) jobs.push({ type: "questions", phrase, limit: d.questionsLimit });
  });
  phrases.slice(0, d.longtailSeedCap).forEach((phrase) => {
    if (d.longtailLimit > 0) jobs.push({ type: "longtail", phrase, limit: d.longtailLimit });
  });

  let doneJobs = 0;
  await onProgress?.({ phase: "expand", total: jobs.length, done: 0 });
  await mapPool(jobs, d.concurrency, async (job) => {
    const res = await safeResearch(job.type, job.phrase, {
      limit: job.limit,
      source,
      siteUrl: cacheSite,
      allowManual: true,
      sort: "volume",
      sortOrder: "desc",
    });
    tally(res);
    addRows(res.rows, { researchTypes: [job.type], seeds: [job.phrase] });
    doneJobs += 1;
    if (doneJobs % 3 === 0 || doneJobs === jobs.length) {
      await onProgress?.({ phase: "expand", total: jobs.length, done: doneJobs });
    }
  });

  const universe = [...byKey.values()].sort(
    (a, b) => (Number(b.volume) || 0) - (Number(a.volume) || 0)
  );

  return {
    universe,
    creditsSpent,
    liveCalls,
    cacheHits,
    errors,
    seeds: phrases,
    rivals: rivalHosts,
    unique: universe.length,
  };
}

export function compactUniverseForLlm(universe, limit = 350) {
  return universe.slice(0, limit).map((r) => ({
    k: r.keyword,
    v: r.volume,
    kd: r.difficulty,
    pos: r.position,
    seeds: r.seeds,
    types: r.researchTypes,
    intents: r.intents,
  }));
}
