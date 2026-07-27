/**
 * Common Crawl CDX client for Site Explorer (indexed pages, subdomains, referring hosts).
 * Data source: https://index.commoncrawl.org/ — free, no API key.
 */
import { toDomain } from "./authority.js";

const COLLINFO_URL = "https://index.commoncrawl.org/collinfo.json";
const USER_AGENT = "Crossway-Site-Explorer/1.0 (+https://github.com/MShahveerk/Seotool-crossway)";
const DEFAULT_INDEX_COUNT = 2;
const DEFAULT_TIMEOUT_MS = 12000;
const REFERRER_TLD_SEEDS = ["com", "org", "net", "io"];

async function mapPool(items, concurrency, fn) {
  if (!items.length) return [];
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

let collectionsCache = { at: 0, items: [] };

function hostnameFromUrl(raw) {
  try {
    const u = raw.startsWith("http") ? raw : `https://${raw}`;
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function isSubdomainOf(host, domain) {
  const h = String(host || "").toLowerCase();
  const d = String(domain || "").toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}

async function fetchWithTimeout(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json, text/plain, */*" },
      cache: "no-store",
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function getCrawlCollections({ refresh = false } = {}) {
  const now = Date.now();
  if (!refresh && collectionsCache.items.length && now - collectionsCache.at < 6 * 60 * 60 * 1000) {
    return collectionsCache.items;
  }
  const res = await fetchWithTimeout(COLLINFO_URL, 15000);
  if (!res.ok) throw new Error(`Common Crawl index list failed (${res.status})`);
  const items = await res.json();
  collectionsCache = { at: now, items: Array.isArray(items) ? items : [] };
  return collectionsCache.items;
}

export async function getLatestCrawlIds(count = DEFAULT_INDEX_COUNT) {
  const collections = await getCrawlCollections();
  return collections.slice(0, Math.max(1, count)).map((c) => c.id).filter(Boolean);
}

function buildCdxUrl(crawlId, params) {
  const base = `https://index.commoncrawl.org/${crawlId}-index`;
  const qs = new URLSearchParams(params);
  return `${base}?${qs.toString()}`;
}

/** Parse NDJSON CDX response lines. */
export async function queryCdx(crawlId, params) {
  const url = buildCdxUrl(crawlId, params);
  const res = await fetchWithTimeout(url);
  if (res.status === 404) return { rows: [], pages: null, blocked: false };
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 503 || /blocked|rate|too many/i.test(text)) {
      return { rows: [], pages: null, blocked: true, error: text.slice(0, 200) || `CDX error ${res.status}` };
    }
    throw new Error(text.slice(0, 200) || `CDX query failed (${res.status})`);
  }

  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) return { rows: [], pages: null, blocked: false };

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const meta = JSON.parse(trimmed);
      if (meta.blocked || meta.error) {
        return { rows: [], pages: null, blocked: true, error: meta.message || meta.error };
      }
    } catch {
      /* single row */
    }
  }

  const lines = trimmed.split("\n").filter(Boolean);
  let pages = null;
  const rows = [];

  for (const line of lines) {
    if (line.startsWith("{") && line.includes('"pages"')) {
      try {
        const meta = JSON.parse(line);
        if (typeof meta.pages === "number") pages = meta.pages;
        continue;
      } catch {
        /* fall through */
      }
    }
    try {
      rows.push(JSON.parse(line));
    } catch {
      /* skip malformed */
    }
  }

  return { rows, pages, blocked: false };
}

function tallyStatusMime(rows) {
  const statuses = {};
  const mimes = {};
  for (const row of rows) {
    const status = String(row.status ?? "unknown");
    statuses[status] = (statuses[status] || 0) + 1;
    const mime = String(row.mime || "unknown").split(";")[0].trim() || "unknown";
    mimes[mime] = (mimes[mime] || 0) + 1;
  }
  return { statuses, mimes };
}

function latestTimestamp(rows) {
  let latest = "";
  for (const row of rows) {
    const ts = String(row.timestamp || "");
    if (ts > latest) latest = ts;
  }
  return latest;
}

function formatCrawlTimestamp(ts) {
  if (!ts || ts.length < 8) return null;
  const y = ts.slice(0, 4);
  const m = ts.slice(4, 6);
  const d = ts.slice(6, 8);
  return `${y}-${m}-${d}`;
}

/** Indexed URLs on the target domain (latest crawl). */
export async function fetchDomainPages(domain, { crawlId, limit = 100, page = 0 } = {}) {
  const params = {
    url: `${domain}/*`,
    matchType: "prefix",
    output: "json",
    limit: String(Math.min(Math.max(limit, 1), 500)),
    page: String(Math.max(page, 0)),
    collapse: "urlkey",
    fl: "url,status,mime,timestamp,urlhost",
  };

  const countParams = {
    url: `${domain}/*`,
    matchType: "prefix",
    output: "json",
    limit: "0",
    showNumPages: "true",
    collapse: "urlkey",
  };

  const [sample, countResult] = await Promise.all([
    queryCdx(crawlId, params),
    queryCdx(crawlId, countParams),
  ]);

  const totalPages = countResult.pages ?? sample.rows.length;
  const pages = sample.rows.map((row) => ({
    url: row.url,
    status: row.status ?? null,
    mime: row.mime || null,
    timestamp: row.timestamp || null,
    captured: formatCrawlTimestamp(row.timestamp),
    host: row.urlhost || hostnameFromUrl(row.url),
  }));

  return {
    crawlId,
    totalPages,
    pages,
    truncated: totalPages > pages.length,
    blocked: sample.blocked || countResult.blocked,
  };
}

/** Subdomains seen in the crawl for a registrable domain. */
export async function fetchSubdomains(domain, crawlId, sampleLimit = 800) {
  const params = {
    url: domain,
    matchType: "domain",
    output: "json",
    limit: String(Math.min(sampleLimit, 5000)),
    collapse: "urlhost",
    fl: "url,urlhost,timestamp,status",
  };

  const { rows, blocked } = await queryCdx(crawlId, params);
  const map = new Map();

  for (const row of rows) {
    const host = (row.urlhost || hostnameFromUrl(row.url) || "").toLowerCase();
    if (!host || !isSubdomainOf(host, domain)) continue;
    const entry = map.get(host) || { host, pages: 0, lastSeen: "", sampleUrl: row.url };
    entry.pages += 1;
    if (String(row.timestamp || "") > entry.lastSeen) {
      entry.lastSeen = row.timestamp;
      entry.sampleUrl = row.url;
    }
    map.set(host, entry);
  }

  const subdomains = [...map.values()]
    .map((s) => ({ ...s, captured: formatCrawlTimestamp(s.lastSeen) }))
    .sort((a, b) => b.pages - a.pages);

  return { crawlId, subdomains, blocked };
}

/**
 * Approximate referring hosts: external pages whose URL string mentions the target domain.
 * CDX indexes URLs, not HTML link graphs — this is a best-effort free alternative to Ahrefs.
 */
export async function fetchReferringHosts(domain, crawlId, { limitPerSeed = 150 } = {}) {
  const hosts = new Map();
  let blocked = false;
  const filter = `url:${domain}`;

  const tasks = REFERRER_TLD_SEEDS.map((tld) => ({ tld, filter }));
  const results = await mapPool(tasks, 3, async ({ tld, filter: urlFilter }) => {
    const params = {
      url: `*.${tld}`,
      matchType: "domain",
      output: "json",
      limit: String(Math.min(limitPerSeed, 400)),
      collapse: "urlhost",
      fl: "url,urlhost,timestamp,status",
      filter: urlFilter,
    };
    return queryCdx(crawlId, params);
  });

  for (const result of results) {
    if (result.blocked) blocked = true;
    for (const row of result.rows) {
      const host = (row.urlhost || hostnameFromUrl(row.url) || "").toLowerCase();
      if (!host || isSubdomainOf(host, domain)) continue;
      const entry = hosts.get(host) || {
        host,
        mentions: 0,
        lastSeen: "",
        sampleUrl: row.url,
        sampleStatus: row.status ?? null,
      };
      entry.mentions += 1;
      if (String(row.timestamp || "") > entry.lastSeen) {
        entry.lastSeen = row.timestamp;
        entry.sampleUrl = row.url;
        entry.sampleStatus = row.status ?? null;
      }
      hosts.set(host, entry);
    }
  }

  const referring = [...hosts.values()]
    .map((r) => ({ ...r, captured: formatCrawlTimestamp(r.lastSeen) }))
    .sort((a, b) => b.mentions - a.mentions);

  return { crawlId, referring, blocked, method: "cdx-url-mention" };
}

export async function buildSiteExplorerReport(siteUrl, { crawlCount = DEFAULT_INDEX_COUNT } = {}) {
  const domain = toDomain(siteUrl);
  if (!domain) throw new Error("Could not extract a domain from the selected website.");

  const crawlIds = await getLatestCrawlIds(crawlCount);
  const primaryCrawl = crawlIds[0];

  const [pagesResult, subdomainsResult, referringResult] = await Promise.all([
    fetchDomainPages(domain, { crawlId: primaryCrawl, limit: 100 }),
    fetchSubdomains(domain, primaryCrawl),
    fetchReferringHosts(domain, primaryCrawl),
  ]);

  const { statuses, mimes } = tallyStatusMime(pagesResult.pages);
  const ok200 = pagesResult.pages.filter((p) => String(p.status) === "200").length;
  const okRate = pagesResult.pages.length ? ok200 / pagesResult.pages.length : null;

  const collections = await getCrawlCollections();
  const crawlMeta = collections.find((c) => c.id === primaryCrawl) || { id: primaryCrawl, name: primaryCrawl };

  return {
    domain,
    crawl: {
      id: primaryCrawl,
      name: crawlMeta.name || primaryCrawl,
      from: crawlMeta.from || null,
      to: crawlMeta.to || null,
    },
    overview: {
      indexedUrls: pagesResult.totalPages,
      indexedSampleSize: pagesResult.pages.length,
      indexedTruncated: pagesResult.truncated,
      subdomains: subdomainsResult.subdomains.length,
      referringDomains: referringResult.referring.length,
      http200Rate: okRate,
      statusBreakdown: statuses,
      mimeBreakdown: mimes,
      lastCapture: formatCrawlTimestamp(latestTimestamp(pagesResult.pages)),
    },
    pages: pagesResult.pages,
    subdomains: subdomainsResult.subdomains.slice(0, 100),
    referring: referringResult.referring.slice(0, 100),
    notes: [
      "Indexed URLs and subdomains come from Common Crawl CDX captures (typically 1–2 months behind live web).",
      "Referring domains are approximated by finding external URLs that mention your domain — not a full HTML backlink graph like Ahrefs.",
    ],
    blocked: pagesResult.blocked || subdomainsResult.blocked || referringResult.blocked,
  };
}

export { toDomain, formatCrawlTimestamp, hostnameFromUrl };
