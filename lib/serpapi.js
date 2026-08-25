/**
 * Organic search + Google Trends.
 * Live Google SERP: SerpAPI (Admin → Data sources, SERPAPI_API_KEY fallback).
 * When SerpAPI is missing or out of searches: Google CSE → Brave → DuckDuckGo.
 */

import { logger } from "./logger.js";
import {
  resolveBraveSearchKey,
  resolveGoogleCseCredentials,
  resolveSerpApiKey,
} from "./dataSources.js";
import {
  extractDomain,
  fetchBraveSerp,
  fetchDuckDuckGoSerp,
  fetchGoogleCseSerp,
  SERP_PROVIDER_LABELS,
} from "./serpProviders.js";

export { extractDomain };

const SERPAPI_BASE = "https://serpapi.com/search";

const QUOTA_RE = /run out of searches|out of searches|search quota|quota exceeded|you have exceeded your search/i;
const QUOTA_COOLDOWN_MS = 15 * 60 * 1000;
let quotaBlockedUntil = 0;

export function isSerpApiQuotaExhausted() {
  return Date.now() < quotaBlockedUntil;
}

export function serpApiQuotaMessage() {
  return "Your account has run out of searches.";
}

function noteQuotaFromMessage(message) {
  if (!QUOTA_RE.test(String(message || ""))) return false;
  if (Date.now() >= quotaBlockedUntil) quotaBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS;
  return true;
}

export class SerpApiError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = "SerpApiError";
    this.status = status;
    this.quota = noteQuotaFromMessage(message);
  }
}

function throwIfQuotaExhausted() {
  if (isSerpApiQuotaExhausted()) {
    throw new SerpApiError(serpApiQuotaMessage(), 429);
  }
}

/** Env-only (sync). Prefer `isSerpApiReady()` from lib/dataSources.js when AppSetting keys matter. */
export function isSerpApiConfigured() {
  return Boolean(process.env.SERPAPI_API_KEY?.trim() || process.env.SERPAPI_KEY?.trim());
}

async function getApiKey() {
  return resolveSerpApiKey();
}

function withProvider(payload, provider) {
  return {
    ...payload,
    provider,
    providerLabel: SERP_PROVIDER_LABELS[provider] || provider,
    providerNote:
      provider === "serpapi"
        ? "Live Google SERP via SerpAPI."
        : payload.providerNote || "",
  };
}

/**
 * Fetch organic results for a keyword.
 * Prefers live Google via SerpAPI; falls through to free providers when that
 * key is missing or the account is out of searches.
 */
export async function fetchGoogleSerp(keyword, opts = {}) {
  const q = String(keyword || "").trim();
  if (!q) throw new SerpApiError("A keyword or phrase is required.", 400);

  const attempts = [];
  const serpApiKey = isSerpApiQuotaExhausted() ? "" : await resolveSerpApiKey();
  if (serpApiKey) {
    try {
      return await fetchSerpApiGoogle(q, opts, serpApiKey);
    } catch (err) {
      attempts.push(`SerpAPI: ${err.message}`);
      logger.warn("SerpAPI organic search failed — trying a free provider", { message: err.message });
    }
  } else if (isSerpApiQuotaExhausted()) {
    attempts.push("SerpAPI: out of searches");
  }

  const cse = await resolveGoogleCseCredentials();
  if (cse) {
    try {
      return await fetchGoogleCseSerp(q, opts, cse);
    } catch (err) {
      attempts.push(`Google CSE: ${err.message}`);
      logger.warn("Google Programmable Search failed — trying next provider", { message: err.message });
    }
  }

  const brave = await resolveBraveSearchKey();
  if (brave) {
    try {
      return await fetchBraveSerp(q, opts, brave);
    } catch (err) {
      attempts.push(`Brave: ${err.message}`);
      logger.warn("Brave Search failed — trying DuckDuckGo", { message: err.message });
    }
  }

  try {
    return await fetchDuckDuckGoSerp(q, opts);
  } catch (err) {
    attempts.push(`DuckDuckGo: ${err.message}`);
    throw new SerpApiError(
      `No search provider returned results. ${attempts.join(" · ") || err.message}`,
      err.status && Number.isInteger(err.status) ? err.status : 503
    );
  }
}

async function fetchSerpApiGoogle(q, opts, apiKey) {
  const { location = "", gl = "us", hl = "en", device = "desktop", num = 30 } = opts;
  const target = Math.min(100, Math.max(10, Number(num) || 30));
  const PAGE_SIZE = 10; // Google no longer honors num>10 — one request ≈ one page, so we paginate.
  const maxPages = Math.ceil(target / PAGE_SIZE);

  const baseParams = { engine: "google", q, api_key: apiKey, gl, hl, device };
  if (location) baseParams.location = location;

  const organic = [];
  const seen = new Set();
  let relatedQuestions = [];
  let relatedSearches = [];
  let totalResults = null;
  let pagesFetched = 0;

  for (let page = 0; page < maxPages; page++) {
    const start = page * PAGE_SIZE;
    const params = new URLSearchParams({ ...baseParams, num: String(PAGE_SIZE), start: String(start) });

    let res;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      res = await fetch(`${SERPAPI_BASE}?${params.toString()}`, { cache: "no-store", signal: controller.signal });
      clearTimeout(timeoutId);
    } catch (err) {
      if (page === 0) throw new SerpApiError(`SerpApi request failed: ${err.message || "network error"}`, 502);
      break; // a deeper page failed — return what we already have
    }

    let data;
    try {
      data = await res.json();
    } catch {
      if (page === 0) throw new SerpApiError(`SerpApi returned an unreadable response (HTTP ${res.status}).`, 502);
      break;
    }

    // SerpApi surfaces problems in `error`, sometimes with a 2xx. On a deep page,
    // "no results" just means Google ran out — stop rather than error.
    if (!res.ok || data?.error) {
      const msg = data?.error || `SerpApi error (HTTP ${res.status})`;
      if (noteQuotaFromMessage(msg)) {
        if (organic.length) break;
        throw new SerpApiError(String(msg).slice(0, 300), 429);
      }
      if (page === 0) {
        throw new SerpApiError(String(msg).slice(0, 300), res.status >= 400 ? res.status : 502);
      }
      break;
    }

    pagesFetched++;
    const pageResults = Array.isArray(data.organic_results) ? data.organic_results.filter((r) => r && r.link) : [];

    let added = 0;
    pageResults.forEach((r, i) => {
      if (seen.has(r.link)) return;
      seen.add(r.link);
      // True absolute rank. SerpApi's per-request `position` may be page-relative
      // when paginating, so promote it to absolute using the page offset.
      const raw = Number(r.position) || i + 1;
      const position = raw > start ? raw : start + raw;
      organic.push({
        position,
        title: r.title || "",
        link: r.link,
        domain: extractDomain(r.link),
        displayedLink: r.displayed_link || "",
        snippet: r.snippet || "",
      });
      added++;
    });

    if (page === 0) {
      relatedQuestions = Array.isArray(data.related_questions)
        ? data.related_questions.map((x) => x.question).filter(Boolean)
        : [];
      relatedSearches = Array.isArray(data.related_searches)
        ? data.related_searches.map((x) => x.query).filter(Boolean)
        : [];
      totalResults = data.search_information?.total_results ?? null;
    }

    // Google often returns only 8–9 organic results per page (ads / PAA / local pack
    // take slots), so a SHORT page does not mean it's out of results. Drive pagination
    // off SerpApi's next-page link instead — stop only when we hit the target depth,
    // get nothing new, or SerpApi explicitly reports there is no next page.
    if (organic.length >= target || added === 0) break;
    if (data.serpapi_pagination && !data.serpapi_pagination.next) break;
  }

  organic.sort((a, b) => a.position - b.position);

  return withProvider(
    {
      keyword: q,
      organic: organic.slice(0, target),
      relatedQuestions,
      relatedSearches,
      totalResults,
      location,
      device,
      pagesFetched,
    },
    "serpapi"
  );
}

async function serpApiGet(query) {
  throwIfQuotaExhausted();
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new SerpApiError(
      "SerpApi is not configured. Add the key in Admin → Data sources (or SERPAPI_API_KEY).",
      503
    );
  }
  const params = new URLSearchParams({ ...query, api_key: apiKey });
  let res;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    res = await fetch(`${SERPAPI_BASE}?${params.toString()}`, { cache: "no-store", signal: controller.signal });
    clearTimeout(timeoutId);
  } catch (err) {
    throw new SerpApiError(`SerpApi request failed: ${err.message || "network error"}`, 502);
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw new SerpApiError(`SerpApi returned an unreadable response (HTTP ${res.status}).`, 502);
  }
  if (!res.ok || data?.error) {
    const msg = data?.error || `SerpApi error (HTTP ${res.status})`;
    throw new SerpApiError(String(msg).slice(0, 300), res.status >= 400 ? res.status : 502);
  }
  return data;
}

/**
 * Google Trends Trending Now for a country (ISO-ish geo: US, GB, CA…).
 */
export async function fetchTrendingNow({ geo = "US", hours = 24 } = {}) {
  const data = await serpApiGet({
    engine: "google_trends_trending_now",
    geo: String(geo || "US").toUpperCase(),
    hours: String(hours || 24),
  });
  const rows = Array.isArray(data.trending_searches) ? data.trending_searches : [];
  return rows
    .map((r) => ({
      query: String(r.query || "").trim(),
      volume: r.search_volume != null ? Number(r.search_volume) : null,
      increase: r.increase_percentage != null ? Number(r.increase_percentage) : null,
      active: r.active !== false,
      breakdown: Array.isArray(r.trend_breakdown) ? r.trend_breakdown.map(String) : [],
      categories: Array.isArray(r.categories) ? r.categories.map((c) => c.name || c).filter(Boolean) : [],
    }))
    .filter((r) => r.query);
}

/**
 * Related / rising queries for one seed on Google Trends.
 */
export async function fetchTrendsRelatedQueries(keyword, { geo = "US" } = {}) {
  const q = String(keyword || "").trim();
  if (!q) return { rising: [], top: [] };
  const data = await serpApiGet({
    engine: "google_trends",
    q,
    geo: String(geo || "US").toUpperCase(),
    data_type: "RELATED_QUERIES",
  });
  const related = data.related_queries || {};
  const pack = (arr) =>
    (Array.isArray(arr) ? arr : []).map((r) => ({
      query: String(r.query || "").trim(),
      value: r.value != null ? Number(r.value) : null,
    })).filter((r) => r.query);
  return {
    rising: pack(related.rising),
    top: pack(related.top),
  };
}
