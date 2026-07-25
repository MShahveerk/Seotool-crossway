/**
 * Free keyword suggestions via public autocomplete endpoints (Google, Bing, YouTube).
 * No API keys required — returns related phrases only (no volume/CPC).
 */
import axios from "axios";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const SOURCE_WEIGHT = { google: 40, bing: 25, youtube: 15 };

const STOP_WORDS = new Set([
  "a", "an", "the", "in", "on", "at", "for", "to", "of", "and", "or", "is", "my", "your", "our",
  "with", "from", "by", "as", "be", "was", "are", "www", "http", "https", "com", "net", "org",
]);

const GEO_GL = { us: "us", uk: "gb", pk: "pk", ca: "ca", au: "au" };

/** Common suffixes — only applied to short (≤3 word) topic seeds */
const EXPANSION_SUFFIXES = [" how", " what", " best", " near me", " cost", " vs"];

function tokenize(text) {
  return normalizeKeyword(text)
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * 0–100 relevance of a suggestion to one or more seeds (token overlap + prefix match).
 */
export function relevanceToSeeds(keyword, seeds = []) {
  const kwNorm = normalizeKeyword(keyword);
  const kwTokens = tokenize(keyword);
  if (!kwNorm || !kwTokens.length) return 0;

  let best = 0;
  for (const seed of seeds) {
    const seedNorm = normalizeKeyword(seed);
    const seedTokens = tokenize(seed);
    if (!seedNorm || !seedTokens.length) continue;

    if (kwNorm === seedNorm) {
      best = Math.max(best, 100);
      continue;
    }
    if (kwNorm.startsWith(seedNorm + " ") || kwNorm.startsWith(seedNorm)) {
      best = Math.max(best, 92);
      continue;
    }
    if (seedNorm.startsWith(kwNorm) && kwNorm.length >= 4) {
      best = Math.max(best, 75);
      continue;
    }

    const overlap = seedTokens.filter((t) =>
      kwTokens.some((k) => k === t || k.startsWith(t) || t.startsWith(k))
    );
    if (!overlap.length) continue;

    const ratio = overlap.length / seedTokens.length;
    if (ratio >= 0.66) best = Math.max(best, 70 + ratio * 25);
    else if (ratio >= 0.34) best = Math.max(best, 45 + ratio * 30);
    else best = Math.max(best, 25 + overlap.length * 12);
  }
  return Math.round(best);
}

export function isRelevantSuggestion(keyword, seeds, minScore = 40) {
  return relevanceToSeeds(keyword, seeds) >= minScore;
}

function resolveGeoParams(geoKey) {
  const key = String(geoKey || "us").toLowerCase();
  return { gl: GEO_GL[key] || "us", hl: "en" };
}

/**
 * Fetch Google autocomplete suggestions.
 * @returns {Promise<string[]>}
 */
async function fetchGoogleSuggestions(query, geoKey = "us") {
  const q = String(query || "").trim();
  if (!q) return [];
  const { gl, hl } = resolveGeoParams(geoKey);
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(q)}&gl=${gl}&hl=${hl}`;
  const res = await axios.get(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    timeout: 8000,
    responseType: "json",
    validateStatus: (s) => s < 500,
  });
  const data = res.data;
  if (!Array.isArray(data) || !Array.isArray(data[1])) return [];
  return data[1].map((s) => (typeof s === "string" ? s : s?.[0] || "")).filter(Boolean);
}

/**
 * Fetch Bing autocomplete suggestions.
 * @returns {Promise<string[]>}
 */
async function fetchBingSuggestions(query) {
  const q = String(query || "").trim();
  if (!q) return [];
  const url = `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(q)}`;
  const res = await axios.get(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    timeout: 8000,
    responseType: "json",
    validateStatus: (s) => s < 500,
  });
  const data = res.data;
  if (!Array.isArray(data) || !Array.isArray(data[1])) return [];
  return data[1].filter(Boolean);
}

/**
 * Fetch YouTube autocomplete suggestions (Google suggest with YouTube client).
 * @returns {Promise<string[]>}
 */
async function fetchYouTubeSuggestions(query, geoKey = "us") {
  const q = String(query || "").trim();
  if (!q) return [];
  const { gl, hl } = resolveGeoParams(geoKey);
  const url = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(q)}&gl=${gl}&hl=${hl}`;
  const res = await axios.get(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    timeout: 8000,
    responseType: "json",
    validateStatus: (s) => s < 500,
  });
  const data = res.data;
  if (!Array.isArray(data) || !Array.isArray(data[1])) return [];
  return data[1].map((s) => (typeof s === "string" ? s : s?.[0] || "")).filter(Boolean);
}

async function fetchAllSources(query, geoKey = "us") {
  const results = await Promise.allSettled([
    fetchGoogleSuggestions(query, geoKey).then((s) => ({ source: "google", suggestions: s })),
    fetchBingSuggestions(query).then((s) => ({ source: "bing", suggestions: s })),
    fetchYouTubeSuggestions(query, geoKey).then((s) => ({ source: "youtube", suggestions: s })),
  ]);

  const out = [];
  for (const r of results) {
    if (r.status === "fulfilled") out.push(r.value);
  }
  return out;
}

/** Run tasks in parallel batches to avoid hammering endpoints */
async function runBatched(tasks, batchSize = 8) {
  const results = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map((fn) => fn()));
    for (const s of settled) {
      if (s.status === "fulfilled") results.push(s.value);
    }
  }
  return results;
}

function normalizeKeyword(kw) {
  return String(kw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function detectIntent(keyword) {
  const lower = keyword.toLowerCase();
  const tags = [];
  if (/^(how|what|why|when|where|can|is|are|do|does|should|will)\b/.test(lower)) tags.push("question");
  if (/\b(best|top|review|vs|compare|cheap|affordable|buy|price|cost|near me|hire|service)\b/.test(lower))
    tags.push("commercial");
  if (/\b(near me|in \w+|local)\b/.test(lower)) tags.push("local");
  if (lower.split(/\s+/).length >= 5) tags.push("long_tail");
  return tags;
}

/**
 * Score a suggestion for priority ranking (heuristic — no volume data).
 */
export function scoreAutocompleteKeyword(keyword, { sources = [], seedKeywords = [], existingQueries = new Map(), rankInSource = 99 } = {}) {
  const relevance = relevanceToSeeds(keyword, seedKeywords);
  if (relevance < 40) return 0;

  let score = relevance * 2;

  for (const src of sources) {
    score += SOURCE_WEIGHT[src] || 10;
  }
  if (sources.length >= 2) score += 12;

  if (rankInSource <= 3) score += 15;
  else if (rankInSource <= 5) score += 8;

  const lower = normalizeKeyword(keyword);
  const words = lower.split(/\s+/).length;
  if (words >= 2 && words <= 5) score += 8;

  const intentTags = detectIntent(lower);
  if (intentTags.includes("question")) score += 6;
  if (intentTags.includes("commercial")) score += 8;

  const existingPos = existingQueries.get(lower);
  if (existingPos == null) score += 10;
  else if (existingPos > 20) score += 8;
  else if (existingPos > 10) score += 3;
  else score -= 5;

  return Math.round(score);
}

export function tagAutocompleteKeyword(keyword, { sources = [], existingQueries = new Map() } = {}) {
  const tags = [...detectIntent(keyword)];
  const lower = normalizeKeyword(keyword);

  if (sources.length >= 2) tags.push("multi_source");
  if (sources.includes("youtube")) tags.push("video_intent");

  const pos = existingQueries.get(lower);
  if (pos == null) tags.push("new_topic");
  else if (pos <= 10) tags.push("already_ranking");
  else if (pos <= 20) tags.push("striking_distance");
  else tags.push("weak_ranking");

  return tags;
}

function buildQueryVariants(seeds) {
  const queries = [];
  for (const seed of seeds) {
    const words = tokenize(seed);
    queries.push({ query: seed.trim(), seed });

    // Suffix expansion only for short, topic-like seeds (avoids garbage on long GSC queries)
    if (words.length <= 3) {
      for (const suffix of EXPANSION_SUFFIXES) {
        queries.push({ query: seed.trim() + suffix, seed });
      }
    }
  }
  return queries;
}

function addSuggestion(agg, suggestion, { source, seed, idx, seeds }) {
  const key = normalizeKeyword(suggestion);
  if (!key || key.length < 3) return;
  if (!isRelevantSuggestion(suggestion, seeds, source === "youtube" ? 50 : 40)) return;

  let row = agg.get(key);
  if (!row) {
    row = { keyword: suggestion.trim(), sources: new Set(), bestRank: 99, seeds: new Set(), relevance: 0 };
    agg.set(key, row);
  }
  row.sources.add(source);
  row.seeds.add(seed);
  row.bestRank = Math.min(row.bestRank, idx);
  row.relevance = Math.max(row.relevance, relevanceToSeeds(suggestion, seeds));
}

/**
 * Discover keywords from seeds using autocomplete expansion.
 */
export async function discoverAutocompleteKeywords(seedKeywords = [], { existingQueries = new Map(), geoKey = "us" } = {}) {
  const seeds = [...new Set(seedKeywords.map((s) => String(s || "").trim()).filter(Boolean))].slice(0, 5);
  if (!seeds.length) {
    const err = new Error("At least one seed keyword is required.");
    err.status = 400;
    throw err;
  }

  const queryVariants = buildQueryVariants(seeds);
  const fetchTasks = queryVariants.map(({ query }) => () => fetchAllSources(query, geoKey));
  const batchResults = await runBatched(fetchTasks, 6);

  const agg = new Map();

  for (let qi = 0; qi < batchResults.length; qi++) {
    const { query, seed } = queryVariants[qi];
    for (const { source, suggestions } of batchResults[qi] || []) {
      suggestions.forEach((suggestion, idx) => {
        addSuggestion(agg, suggestion, { source, seed, idx, seeds });
      });
    }
    // Include the typed query itself when autocomplete returns it implicitly
    addSuggestion(agg, query, { source: "google", seed, idx: 0, seeds });
  }

  // Second-level: expand top relevant base suggestions (deeper long-tail, still on-topic)
  const secondLevelSeeds = [...agg.values()]
    .filter((r) => r.relevance >= 60)
    .sort((a, b) => b.relevance - a.relevance || a.bestRank - b.bestRank)
    .slice(0, 8)
    .map((r) => r.keyword);

  if (secondLevelSeeds.length) {
    const l2Tasks = secondLevelSeeds.map((q) => () => fetchAllSources(q, geoKey));
    const l2Results = await runBatched(l2Tasks, 6);
    for (let i = 0; i < l2Results.length; i++) {
      const parent = secondLevelSeeds[i];
      for (const { source, suggestions } of l2Results[i] || []) {
        suggestions.forEach((suggestion, idx) => {
          addSuggestion(agg, suggestion, { source, seed: parent, idx, seeds });
        });
      }
    }
  }

  const keywords = [...agg.values()]
    .map((row) => {
      const sources = [...row.sources];
      const relevance = row.relevance || relevanceToSeeds(row.keyword, seeds);
      const tags = tagAutocompleteKeyword(row.keyword, { sources, existingQueries });
      const priority = scoreAutocompleteKeyword(row.keyword, {
        sources,
        seedKeywords: seeds,
        existingQueries,
        rankInSource: row.bestRank,
      });
      const existingPosition = existingQueries.get(normalizeKeyword(row.keyword)) ?? null;

      return {
        keyword: row.keyword,
        sources,
        relevance,
        priority,
        tags,
        existingPosition,
        isNewTopic: existingPosition == null,
        seedKeywords: [...row.seeds],
      };
    })
    .filter((k) => k.priority > 0)
    .sort((a, b) => {
      const scoreDiff = (Number(b.priority) || 0) - (Number(a.priority) || 0);
      if (scoreDiff !== 0) return scoreDiff;
      const relDiff = (Number(b.relevance) || 0) - (Number(a.relevance) || 0);
      if (relDiff !== 0) return relDiff;
      return a.keyword.localeCompare(b.keyword);
    });

  return {
    keywords,
    meta: {
      method: "autocomplete",
      seeds,
      geoKey,
      queriesRun: queryVariants.length + secondLevelSeeds.length,
      totalFound: keywords.length,
      filtered: true,
      sources: ["google", "bing", "youtube"],
    },
  };
}
