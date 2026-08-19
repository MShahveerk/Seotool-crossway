/**
 * SerpApi client — live Google SERP + Trends.
 * Key: Admin → Data sources, with SERPAPI_API_KEY env fallback.
 */

import { resolveSerpApiKey } from "./dataSources.js";

const SERPAPI_BASE = "https://serpapi.com/search";

export class SerpApiError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = "SerpApiError";
    this.status = status;
  }
}

/** Env-only (sync). Prefer `isSerpApiReady()` from lib/dataSources.js when AppSetting keys matter. */
export function isSerpApiConfigured() {
  return Boolean(process.env.SERPAPI_API_KEY?.trim() || process.env.SERPAPI_KEY?.trim());
}

async function getApiKey() {
  return resolveSerpApiKey();
}

/** Bare registrable host, lowercased, no scheme / www / path. */
export function extractDomain(input) {
  const raw = String(input || "").trim().toLowerCase();
  if (!raw) return "";
  try {
    const host = raw.startsWith("http") ? new URL(raw).hostname : new URL(`https://${raw}`).hostname;
    return host.replace(/^www\./, "");
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

/**
 * Fetch the live Google organic SERP for a keyword.
 * @param {string} keyword
 * @param {object} [opts]
 * @param {string} [opts.location] - e.g. "United States" (city/region/country name)
 * @param {string} [opts.gl] - two-letter country code (default "us")
 * @param {string} [opts.hl] - two-letter UI language (default "en")
 * @param {'desktop'|'mobile'|'tablet'} [opts.device]
 * @param {number} [opts.num] - results to request (10–100)
 * @returns {Promise<{keyword:string, organic:Array, relatedQuestions:string[], relatedSearches:string[], totalResults:number|null, location:string, device:string}>}
 */
export async function fetchGoogleSerp(keyword, opts = {}) {
  const q = String(keyword || "").trim();
  if (!q) throw new SerpApiError("A keyword or phrase is required.", 400);

  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new SerpApiError(
      "SerpApi is not configured. Add the key in Admin → Data sources (or SERPAPI_API_KEY).",
      503
    );
  }

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
      if (page === 0) {
        const msg = data?.error || `SerpApi error (HTTP ${res.status})`;
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

  return {
    keyword: q,
    organic: organic.slice(0, target),
    relatedQuestions,
    relatedSearches,
    totalResults,
    location,
    device,
    pagesFetched,
  };
}

async function serpApiGet(query) {
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
