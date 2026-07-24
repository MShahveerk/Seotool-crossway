/**
 * Free keyword suggestions via public autocomplete endpoints (Google, Bing, YouTube).
 * No API keys required — returns related phrases only (no volume/CPC).
 */
import axios from "axios";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Common suffixes that surface high-intent long-tail variants */
const EXPANSION_SUFFIXES = ["", " how", " what", " best", " near me", " cost", " vs", " for"];

const SOURCE_WEIGHT = { google: 40, bing: 25, youtube: 20 };

/**
 * Fetch Google autocomplete suggestions.
 * @returns {Promise<string[]>}
 */
async function fetchGoogleSuggestions(query) {
  const q = String(query || "").trim();
  if (!q) return [];
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(q)}`;
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
async function fetchYouTubeSuggestions(query) {
  const q = String(query || "").trim();
  if (!q) return [];
  const url = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(q)}`;
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

async function fetchAllSources(query) {
  const results = await Promise.allSettled([
    fetchGoogleSuggestions(query).then((s) => ({ source: "google", suggestions: s })),
    fetchBingSuggestions(query).then((s) => ({ source: "bing", suggestions: s })),
    fetchYouTubeSuggestions(query).then((s) => ({ source: "youtube", suggestions: s })),
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
  let score = 0;
  const lower = normalizeKeyword(keyword);

  // Multi-engine presence
  for (const src of sources) {
    score += SOURCE_WEIGHT[src] || 10;
  }
  if (sources.length >= 2) score += 20;
  if (sources.length === 3) score += 15;

  // Autocomplete position (earlier = more popular)
  if (rankInSource <= 3) score += 25;
  else if (rankInSource <= 5) score += 15;
  else if (rankInSource <= 8) score += 8;

  // Seed relevance
  for (const seed of seedKeywords) {
    const s = normalizeKeyword(seed);
    if (!s) continue;
    if (lower === s) score += 5;
    else if (lower.startsWith(s)) score += 18;
    else if (lower.includes(s)) score += 12;
  }

  // Word count — 2-4 words often sweet spot for SEO
  const words = lower.split(/\s+/).length;
  if (words >= 2 && words <= 4) score += 15;
  else if (words === 1) score += 5;
  else if (words >= 5) score += 8; // long-tail bonus

  // Intent signals
  const intentTags = detectIntent(lower);
  if (intentTags.includes("question")) score += 12;
  if (intentTags.includes("commercial")) score += 18;
  if (intentTags.includes("local")) score += 10;

  // GSC overlap — prioritize gaps and weak rankings
  const existingPos = existingQueries.get(lower);
  if (existingPos == null) score += 22;
  else if (existingPos > 20) score += 16;
  else if (existingPos > 10) score += 6;
  else score -= 8;

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

/**
 * Discover keywords from seeds using autocomplete expansion.
 *
 * @param {string[]} seedKeywords - 1–5 seed phrases
 * @param {object} options
 * @param {Map<string, number>} [options.existingQueries] - GSC query → avg position
 * @returns {Promise<{ keywords: object[], meta: object }>}
 */
export async function discoverAutocompleteKeywords(seedKeywords = [], { existingQueries = new Map() } = {}) {
  const seeds = [...new Set(seedKeywords.map((s) => String(s || "").trim()).filter(Boolean))].slice(0, 5);
  if (!seeds.length) {
    const err = new Error("At least one seed keyword is required.");
    err.status = 400;
    throw err;
  }

  // Build query variants: each seed + expansion suffixes
  const queries = [];
  for (const seed of seeds) {
    for (const suffix of EXPANSION_SUFFIXES) {
      queries.push(seed + suffix);
    }
  }

  const fetchTasks = queries.map((q) => () => fetchAllSources(q));
  const batchResults = await runBatched(fetchTasks, 6);

  // Aggregate: keyword → { sources: Set, bestRank, seeds: Set }
  const agg = new Map();

  for (let qi = 0; qi < batchResults.length; qi++) {
    const queryUsed = queries[qi];
    const matchedSeed = seeds.find((s) => queryUsed === s || queryUsed.startsWith(s)) || seeds[0];

    for (const { source, suggestions } of batchResults[qi] || []) {
      suggestions.forEach((suggestion, idx) => {
        const key = normalizeKeyword(suggestion);
        if (!key || key.length < 2) return;

        let row = agg.get(key);
        if (!row) {
          row = { keyword: suggestion.trim(), sources: new Set(), bestRank: 99, seeds: new Set() };
          agg.set(key, row);
        }
        row.sources.add(source);
        row.seeds.add(matchedSeed);
        row.bestRank = Math.min(row.bestRank, idx);
      });
    }
  }

  const keywords = [...agg.values()]
    .map((row) => {
      const sources = [...row.sources];
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
        priority,
        tags,
        existingPosition,
        isNewTopic: existingPosition == null,
        seedKeywords: [...row.seeds],
      };
    })
    .sort((a, b) => b.priority - a.priority || a.keyword.localeCompare(b.keyword));

  return {
    keywords,
    meta: {
      method: "autocomplete",
      seeds,
      queriesRun: queries.length,
      totalFound: keywords.length,
      sources: ["google", "bing", "youtube"],
    },
  };
}
