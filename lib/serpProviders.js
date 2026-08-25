/**
 * Free / low-cost organic search providers used when SerpAPI is missing or
 * out of searches. None of these is a live Google SERP:
 *   - Google Programmable Search (CSE): 100 queries/day, Google index
 *   - Brave Search: ~1,000 queries/month on Brave's monthly credits
 *   - DuckDuckGo HTML: no key, last resort
 */
import { logger } from "./logger.js";

const DDG_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const BRAVE_COUNTRY = { us: "US", uk: "GB", ca: "CA", au: "AU", pk: "PK" };

export const SERP_PROVIDER_LABELS = {
  serpapi: "Google (SerpAPI)",
  google_cse: "Google Programmable Search",
  brave: "Brave Search",
  duckduckgo: "DuckDuckGo",
};

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

export function unwrapDuckDuckGoHref(href) {
  const raw = String(href || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw, "https://duckduckgo.com");
    const uddg = u.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    if (/(^|\.)duckduckgo\.com$/i.test(u.hostname)) return "";
    return u.href;
  } catch {
    return raw.startsWith("http") ? raw : "";
  }
}

function packOrganic(rows, { keyword, location = "", device = "desktop", provider, note, totalResults = null }) {
  const organic = [];
  const seen = new Set();
  for (const row of rows || []) {
    const link = String(row.link || "").trim();
    if (!link || seen.has(link)) continue;
    const domain = extractDomain(link);
    if (!domain) continue;
    seen.add(link);
    organic.push({
      position: organic.length + 1,
      title: String(row.title || domain).trim(),
      link,
      domain,
      displayedLink: row.displayedLink || domain,
      snippet: String(row.snippet || "").trim(),
    });
  }
  return {
    keyword,
    organic,
    relatedQuestions: [],
    relatedSearches: [],
    totalResults,
    location,
    device,
    pagesFetched: 1,
    provider,
    providerLabel: SERP_PROVIDER_LABELS[provider] || provider,
    providerNote: note,
  };
}

async function fetchJson(url, { headers = {}, timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal, headers });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { res, data };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchGoogleCseSerp(keyword, opts, { apiKey, cx }) {
  const { gl = "us", location = "", device = "desktop" } = opts || {};
  const params = new URLSearchParams({
    key: apiKey,
    cx,
    q: keyword,
    num: "10",
    gl: gl === "uk" ? "uk" : gl,
  });
  const { res, data } = await fetchJson(`https://www.googleapis.com/customsearch/v1?${params}`);
  if (!res.ok || data?.error) {
    const msg = data?.error?.message || `Google Programmable Search error (HTTP ${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  const items = Array.isArray(data?.items) ? data.items : [];
  return packOrganic(
    items.map((item) => ({
      link: item.link,
      title: item.title,
      snippet: item.snippet,
      displayedLink: item.displayLink,
    })),
    {
      keyword,
      location,
      device,
      provider: "google_cse",
      note: "Google Programmable Search — Google's index, not the live Google SERP. 100 free queries/day.",
      totalResults: Number(data?.searchInformation?.totalResults) || null,
    }
  );
}

export async function fetchBraveSerp(keyword, opts, apiKey) {
  const { gl = "us", location = "", device = "desktop" } = opts || {};
  const params = new URLSearchParams({
    q: keyword,
    count: "20",
    country: BRAVE_COUNTRY[gl] || "US",
    text_decorations: "false",
  });
  const { res, data } = await fetchJson(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });
  if (!res.ok || data?.error) {
    const msg =
      (typeof data?.message === "string" && data.message) ||
      (typeof data?.error === "string" && data.error) ||
      `Brave Search error (HTTP ${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  const items = Array.isArray(data?.web?.results) ? data.web.results : [];
  return packOrganic(
    items.map((item) => ({
      link: item.url,
      title: item.title,
      snippet: item.description,
    })),
    {
      keyword,
      location,
      device,
      provider: "brave",
      note: "Brave Search — independent index. Not Google rankings. Brave includes about $5 of credits each month.",
    }
  );
}

export function parseDuckDuckGoHtml(html) {
  const rows = [];
  const seen = new Set();
  const htmlStr = String(html || "");
  const patterns = [
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    /<a[^>]*rel="nofollow"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(htmlStr))) {
      const link = unwrapDuckDuckGoHref(m[1].replace(/&amp;/g, "&"));
      if (!link || seen.has(link)) continue;
      const title = String(m[2] || "")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
      if (!title) continue;
      seen.add(link);
      rows.push({ link, title, snippet: "" });
      if (rows.length >= 20) return rows;
    }
    if (rows.length) return rows;
  }
  return rows;
}

export async function fetchDuckDuckGoSerp(keyword, opts = {}) {
  const { location = "", device = "desktop", gl = "us" } = opts;
  const params = new URLSearchParams({ q: keyword, kl: `${gl === "uk" ? "uk" : gl}-en` });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);
  let res;
  try {
    res = await fetch(`https://html.duckduckgo.com/html/?${params}`, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent": DDG_UA,
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) {
    const err = new Error(`DuckDuckGo returned HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const html = await res.text();
  if (/anomaly-modal|captcha|blocked/i.test(html) && !/result__a/i.test(html)) {
    throw new Error("DuckDuckGo blocked this server. Add Google Programmable Search in Admin → Data sources.");
  }
  const rows = parseDuckDuckGoHtml(html);
  if (!rows.length) {
    throw new Error("DuckDuckGo returned no web results.");
  }
  logger.info("Organic search used DuckDuckGo fallback", { keyword });
  return packOrganic(rows, {
    keyword,
    location,
    device,
    provider: "duckduckgo",
    note: "DuckDuckGo fallback — free, no key. Not Google rankings. For closer results add Google Programmable Search (100 queries/day) in Admin → Data sources.",
  });
}
