/**
 * Site Audit engine: crawls a website (same-origin, sitemap-seeded, robots-aware),
 * analyzes every page's HTML, and emits issues from the rules catalog with a
 * 0-100 health score.
 */
import { AUDIT_RULES } from "./siteAuditRules.js";
import { normalizeSiteOrigin } from "./validation.js";

// Browser-like UA — many WordPress hosts block or noindex unknown bots (Cloudflare, Wordfence, etc.)
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const FETCH_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};
const FETCH_TIMEOUT_MS = 15000;
const CONCURRENCY = 4;
const MAX_REDIRECT_HOPS = 5;
const MAX_SITEMAP_FILES = 6;
const MAX_SITEMAP_URLS = 2000;
const MAX_EXTERNAL_CHECKS = 50;
const MAX_PAGES_PER_ISSUE = 30;

const SKIP_EXTENSIONS =
  /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|css|js|mjs|zip|gz|rar|7z|mp3|mp4|webm|mov|avi|woff2?|ttf|otf|eot|json|txt|docx?|xlsx?|pptx?)(\?|$)/i;

function pageCap() {
  const n = Number(process.env.SITE_AUDIT_PAGE_LIMIT || 150);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 1000) : 150;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(url, opts = {}, timeout = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, ...FETCH_HEADERS, ...(opts.headers || {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------ URL handling ------------------------------ */

function hostKey(hostname) {
  return String(hostname || "").toLowerCase().replace(/^www\./, "");
}

/** Normalize an in-site URL: resolve, strip hash, keep query, drop trackers. */
function normalizeUrl(href, baseUrl) {
  try {
    const u = new URL(href, baseUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    for (const p of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"]) {
      u.searchParams.delete(p);
    }
    let s = u.href;
    if (u.pathname !== "/" && s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch {
    return null;
  }
}

/* -------------------------------- robots.txt ------------------------------ */

async function fetchRobots(origin) {
  const result = { disallows: [], sitemaps: [] };
  try {
    const res = await fetchWithTimeout(`${origin}/robots.txt`, {}, 8000);
    if (!res.ok) return result;
    const text = await res.text();
    let applies = false;
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.replace(/#.*$/, "").trim();
      if (!line) continue;
      const [keyRaw, ...rest] = line.split(":");
      const key = keyRaw.trim().toLowerCase();
      const value = rest.join(":").trim();
      if (key === "user-agent") applies = value === "*";
      else if (key === "disallow" && applies && value) result.disallows.push(value);
      else if (key === "sitemap" && value) result.sitemaps.push(value);
    }
  } catch {
    /* no robots.txt — crawl everything */
  }
  return result;
}

function isDisallowed(url, disallows) {
  if (!disallows.length) return false;
  try {
    const path = new URL(url).pathname;
    return disallows.some((d) => path.startsWith(d.replace(/\*$/, "")));
  } catch {
    return false;
  }
}

/* --------------------------------- sitemap -------------------------------- */

function extractLocs(xml) {
  const locs = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) locs.push(m[1].trim());
  return locs;
}

async function fetchSitemapUrls(origin, robotsSitemaps) {
  const candidates = [...new Set([...(robotsSitemaps || []), `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`])];
  const urls = new Set();
  let filesFetched = 0;

  const queue = [...candidates];
  while (queue.length && filesFetched < MAX_SITEMAP_FILES && urls.size < MAX_SITEMAP_URLS) {
    const smUrl = queue.shift();
    filesFetched += 1;
    try {
      const res = await fetchWithTimeout(smUrl, {}, 10000);
      if (!res.ok) continue;
      const xml = await res.text();
      const locs = extractLocs(xml);
      if (/<sitemapindex/i.test(xml)) {
        for (const child of locs.slice(0, MAX_SITEMAP_FILES)) queue.push(child);
      } else {
        for (const loc of locs) {
          urls.add(loc);
          if (urls.size >= MAX_SITEMAP_URLS) break;
        }
      }
    } catch {
      /* sitemap unreachable — fine */
    }
  }
  return [...urls];
}

/* ------------------------------ HTML analysis ----------------------------- */

function getAttr(tag, name) {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = tag.match(re);
  if (!m) return null;
  return (m[2] ?? m[3] ?? m[4] ?? "").trim();
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Only parse SEO tags from <head> — body/meta-in-JSON false positives are common. */
function extractHeadHtml(html) {
  const m = String(html || "").match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  return m ? m[1] : String(html || "").slice(0, 12000);
}

/** True when a robots / x-robots value explicitly contains a noindex directive. */
export function directivesIncludeNoindex(value) {
  if (!value) return false;
  return value
    .toLowerCase()
    .split(/[,;]/)
    .map((s) => s.trim())
    .some((d) => d === "noindex" || d.startsWith("noindex"));
}

/** Host returned a bot wall, challenge page, or crawler-only noindex stub — not real site content. */
export function detectBotWall(page, html) {
  if ([401, 403, 429, 503].includes(page.status)) return true;
  const sample = String(html || "").toLowerCase();
  if (
    /cloudflare|cf-browser-verification|just a moment|access denied|wordfence|sucuri|bot detection|please enable cookies|ddos protection by/i.test(
      sample
    )
  ) {
    return true;
  }
  const p = page.parsed;
  if (
    directivesIncludeNoindex(page.xRobots) &&
    p &&
    (p.internalLinks?.length || 0) === 0 &&
    (p.wordCount || 0) < 120
  ) {
    return true;
  }
  return false;
}

export function assessCrawlQuality(crawl) {
  const pagesCrawled = crawl.pages.size;
  const sitemapUrls = crawl.sitemapUrls?.length || 0;
  const okHtml = [...crawl.pages.values()].filter((p) => p.status === 200 && p.parsed && !p.botWall).length;
  const blocked = [...crawl.pages.values()].filter((p) => p.botWall).length;
  const home =
    crawl.pages.get(normalizeUrl(crawl.origin, crawl.origin)) ||
    crawl.pages.get(`${crawl.origin}/`) ||
    [...crawl.pages.values()][0];

  let quality = "complete";
  let message = null;

  if (blocked > 0 && okHtml === 0) {
    quality = "blocked";
    message =
      "The server appears to be blocking or cloaking this crawler (403/challenge/noindex stub). Results are not trustworthy — allow a standard browser user-agent through your firewall/CDN.";
  } else if (pagesCrawled <= 1 && sitemapUrls > 5) {
    quality = "incomplete";
    message = `Only 1 page was crawled, but the sitemap lists ${sitemapUrls} URLs. The crawl did not reach the rest of the site.`;
  } else if (pagesCrawled <= 1 && (home?.parsed?.internalLinks?.length || 0) === 0 && sitemapUrls === 0) {
    quality = "incomplete";
    message =
      "Only the homepage was crawled and it contained no parseable internal links (often JavaScript menus or bot blocking). Deeper pages were not checked.";
  } else if (sitemapUrls > 20 && okHtml < Math.min(10, Math.ceil(sitemapUrls * 0.05))) {
    quality = "partial";
    message = `Crawled ${okHtml} usable pages out of ${sitemapUrls} sitemap URLs — coverage is low; treat the health score with caution.`;
  }

  return { quality, message, pagesCrawled, sitemapUrls, okHtml, blocked };
}

export function analyzeHtml(html, pageUrl) {
  const out = {
    title: null,
    metaDescription: null,
    metaRobots: null,
    canonical: null,
    lang: null,
    viewport: false,
    hasLdJson: false,
    ogTitle: false,
    ogImage: false,
    h1Count: 0,
    imgTotal: 0,
    imgMissingAlt: 0,
    wordCount: 0,
    mixedContentCount: 0,
    internalLinks: [],
    externalLinks: [],
  };
  if (!html) return out;

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) out.title = decodeEntities(titleMatch[1]).replace(/\s+/g, " ").trim() || null;

  const htmlTag = html.match(/<html\b[^>]*>/i);
  if (htmlTag) out.lang = getAttr(htmlTag[0], "lang");

  const headHtml = extractHeadHtml(html);
  const metaTags = headHtml.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of metaTags) {
    const name = (getAttr(tag, "name") || "").toLowerCase();
    const property = (getAttr(tag, "property") || "").toLowerCase();
    const content = getAttr(tag, "content");
    if (name === "description") out.metaDescription = decodeEntities(content || "").trim() || null;
    else if (name === "robots" || name === "googlebot") out.metaRobots = (content || "").toLowerCase();
    else if (name === "viewport") out.viewport = true;
    else if (property === "og:title") out.ogTitle = true;
    else if (property === "og:image") out.ogImage = true;
  }

  const linkTags = headHtml.match(/<link\b[^>]*>/gi) || [];
  for (const tag of linkTags) {
    if ((getAttr(tag, "rel") || "").toLowerCase() === "canonical") {
      out.canonical = getAttr(tag, "href");
    }
  }

  out.hasLdJson = /<script[^>]*type\s*=\s*["']application\/ld\+json["']/i.test(html);
  out.h1Count = (html.match(/<h1[\s>]/gi) || []).length;

  const imgTags = html.match(/<img\b[^>]*>/gi) || [];
  out.imgTotal = imgTags.length;
  for (const tag of imgTags) {
    const alt = getAttr(tag, "alt");
    const ariaHidden = (getAttr(tag, "aria-hidden") || "").toLowerCase() === "true";
    const role = (getAttr(tag, "role") || "").toLowerCase();
    // Missing attribute only — alt="" is valid for decorative images (WCAG).
    if (alt === null && role !== "presentation" && !ariaHidden) out.imgMissingAlt += 1;
  }

  // Mixed content: active/subresource HTTP loads on HTTPS pages (not semantic <link rel="profile"> etc.)
  if (pageUrl.startsWith("https://")) {
    const resTags = html.match(/<(?:img|script|link|iframe|source|video|audio)\b[^>]*>/gi) || [];
    for (const tag of resTags) {
      const tagName = tag.match(/^<(\w+)/i)?.[1]?.toLowerCase();
      if (tagName === "link") {
        const rel = (getAttr(tag, "rel") || "").toLowerCase();
        if (!/(stylesheet|preload|modulepreload|icon|manifest|shortcut)/.test(rel)) continue;
      }
      const src = getAttr(tag, "src") || getAttr(tag, "href");
      if (src && /^http:\/\//i.test(src)) out.mixedContentCount += 1;
    }
  }

  // Word count from visible text
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");
  out.wordCount = (text.match(/[A-Za-z\u00C0-\u024F0-9]{2,}/g) || []).length;

  // Links
  const anchorTags = html.match(/<a\b[^>]*>/gi) || [];
  const baseHost = hostKey(new URL(pageUrl).hostname);
  const seen = new Set();
  for (const tag of anchorTags) {
    const href = getAttr(tag, "href");
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript|data):/i.test(href)) continue;
    const normalized = normalizeUrl(href, pageUrl);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    try {
      const linkHost = hostKey(new URL(normalized).hostname);
      if (linkHost === baseHost) out.internalLinks.push(normalized);
      else out.externalLinks.push(normalized);
    } catch {
      /* unparseable href */
    }
  }

  return out;
}

/* --------------------------------- fetching -------------------------------- */

/** Canonical resource identity for redirect loop detection (ignores trailing slash). */
function resourceKey(url) {
  return normalizeUrl(url, url);
}

function displayPath(url) {
  try {
    const u = new URL(url);
    return u.pathname + u.search || "/";
  } catch {
    return String(url || "");
  }
}

/** Trailing-slash / spelling alias — same page, not a redirect loop. */
function isTrivialRedirectAlias(from, to) {
  if (!from || !to) return false;
  return resourceKey(from) === resourceKey(to);
}

/** Fetch one URL following redirects manually so the chain is observable. */
async function fetchPage(url) {
  const chain = [];
  let current = url;
  const started = Date.now();
  const visitedKeys = new Set([resourceKey(url)]);

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    let res;
    try {
      res = await fetchWithTimeout(current, { redirect: "manual" });
    } catch (err) {
      return { url, finalUrl: current, status: 0, error: err.name === "AbortError" ? "timeout" : "network", chain, responseMs: Date.now() - started };
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (!loc) return { url, finalUrl: current, status: res.status, chain, responseMs: Date.now() - started };
      const rawNext = new URL(loc, current).href;
      const nextKey = resourceKey(rawNext);
      chain.push({ from: current, to: rawNext, status: res.status });

      if (!isTrivialRedirectAlias(current, rawNext) && visitedKeys.has(nextKey)) {
        const path = chain.map((c) => resourceKey(c.to || c.from)).join(" → ");
        return {
          url,
          finalUrl: rawNext,
          status: res.status,
          chain,
          redirectLoop: true,
          redirectLoopPath: path,
          responseMs: Date.now() - started,
        };
      }
      if (!isTrivialRedirectAlias(current, rawNext)) visitedKeys.add(nextKey);

      current = rawNext;
      continue;
    }

    const contentType = res.headers.get("content-type") || "";
    const isHtml = contentType.includes("text/html") || contentType.includes("application/xhtml");
    let html = null;
    let contentLength = Number(res.headers.get("content-length")) || null;
    if (isHtml && res.ok) {
      try {
        html = await res.text();
        contentLength = contentLength || Buffer.byteLength(html, "utf8");
      } catch {
        html = null;
      }
    }
    const xRobots = (res.headers.get("x-robots-tag") || "").toLowerCase();
    return {
      url,
      finalUrl: current,
      status: res.status,
      chain,
      isHtml,
      html,
      contentLength,
      xRobots,
      responseMs: Date.now() - started,
    };
  }

  return { url, finalUrl: current, status: 0, chain, redirectLoop: true, responseMs: Date.now() - started };
}

async function checkExternalLink(url) {
  try {
    let res = await fetchWithTimeout(url, { method: "HEAD", redirect: "follow" }, 8000);
    if (res.status === 405 || res.status === 501 || res.status === 403) {
      res = await fetchWithTimeout(url, { method: "GET", redirect: "follow" }, 8000);
    }
    return res.status;
  } catch {
    return 0;
  }
}

/* ---------------------------------- crawl ---------------------------------- */

export async function crawlSite(siteUrl) {
  const origin = normalizeSiteOrigin(siteUrl);
  if (!origin || !origin.startsWith("http")) throw new Error("Site audit needs a valid http(s) website URL.");

  const cap = pageCap();
  const baseHost = hostKey(new URL(origin).hostname);
  const robots = await fetchRobots(origin);
  const sitemapUrls = await fetchSitemapUrls(origin, robots.sitemaps);

  const queue = []; // { url, depth }
  const enqueued = new Set();
  const results = new Map(); // normalized url -> page result
  const inboundLinks = new Map(); // url -> Set(sourceUrl)

  const enqueue = (url, depth) => {
    if (!url || enqueued.has(url) || enqueued.size >= cap * 3) return;
    if (SKIP_EXTENSIONS.test(url)) return;
    try {
      if (hostKey(new URL(url).hostname) !== baseHost) return;
    } catch {
      return;
    }
    if (isDisallowed(url, robots.disallows)) return;
    enqueued.add(url);
    queue.push({ url, depth });
  };

  enqueue(normalizeUrl(origin, origin), 0);
  // Seed with sitemap URLs so orphans get crawled too
  for (const sm of sitemapUrls.slice(0, cap)) {
    enqueue(normalizeUrl(sm, origin), 0);
  }

  const externalSeen = new Set();

  async function worker() {
    while (queue.length && results.size < cap) {
      const item = queue.shift();
      if (!item || results.has(item.url)) continue;
      results.set(item.url, { pending: true });

      const page = await fetchPage(item.url);
      page.depth = item.depth;

      if (page.html) {
        page.parsed = analyzeHtml(page.html, page.finalUrl || item.url);
        page.botWall = detectBotWall(page, page.html);
        for (const link of page.parsed.internalLinks) {
          if (!inboundLinks.has(link)) inboundLinks.set(link, new Set());
          inboundLinks.get(link).add(item.url);
          enqueue(link, item.depth + 1);
        }
        for (const ext of page.parsed.externalLinks) {
          if (externalSeen.size < MAX_EXTERNAL_CHECKS) externalSeen.add(ext);
        }
        delete page.html; // free memory
      }

      results.set(item.url, page);
      await sleep(100);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  // Drop unfinished placeholders (cap race)
  for (const [url, page] of results) {
    if (page.pending) results.delete(url);
  }

  // Check external links
  const externalResults = new Map();
  const externals = [...externalSeen];
  for (let i = 0; i < externals.length; i += CONCURRENCY) {
    const batch = externals.slice(i, i + CONCURRENCY);
    const statuses = await Promise.all(batch.map((u) => checkExternalLink(u)));
    batch.forEach((u, idx) => externalResults.set(u, statuses[idx]));
  }

  return { origin, baseHost, pages: results, inboundLinks, sitemapUrls, externalResults, robots };
}

/* --------------------------------- analysis -------------------------------- */

function addIssuePage(instances, ruleId, url, detail) {
  if (!instances[ruleId]) instances[ruleId] = { count: 0, pages: [] };
  instances[ruleId].count += 1;
  if (instances[ruleId].pages.length < MAX_PAGES_PER_ISSUE) {
    instances[ruleId].pages.push({ url, detail: detail || null });
  }
}

export function analyzeCrawl(crawl) {
  const { pages, inboundLinks, sitemapUrls, externalResults } = crawl;
  const crawlQuality = assessCrawlQuality(crawl);
  const instances = {};
  const htmlPages = [];
  const sitemapSet = new Set(sitemapUrls.map((u) => normalizeUrl(u, crawl.origin)).filter(Boolean));

  const titleGroups = new Map();
  const descGroups = new Map();

  if (crawlQuality.quality === "blocked") {
    addIssuePage(
      instances,
      "crawler-blocked",
      crawl.origin,
      crawlQuality.message
    );
  } else if (crawlQuality.quality === "incomplete" || crawlQuality.quality === "partial") {
    addIssuePage(instances, "crawl-incomplete", crawl.origin, crawlQuality.message);
  }

  for (const [url, page] of pages) {
    const linkedFrom = inboundLinks.get(url);

    if (page.redirectLoop) {
      addIssuePage(
        instances,
        "redirect-loops",
        url,
        page.redirectLoopPath || `${page.chain.length} redirects in a circle`
      );
      continue;
    }
    if (page.status === 0) {
      addIssuePage(instances, "server-errors", url, page.error === "timeout" ? "Request timed out" : "Connection failed");
      continue;
    }
    if (page.status >= 500) {
      addIssuePage(instances, "server-errors", url, `HTTP ${page.status}`);
      continue;
    }
    if (page.status >= 400) {
      const sources = linkedFrom ? [...linkedFrom].slice(0, 3).join(", ") : null;
      addIssuePage(
        instances,
        "broken-internal-links",
        url,
        `HTTP ${page.status}${sources ? ` — linked from: ${sources}` : ""}`
      );
      if (sitemapSet.has(url)) addIssuePage(instances, "non-200-in-sitemap", url, `HTTP ${page.status}`);
      continue;
    }

    if (page.chain?.length >= 2) {
      const hops = page.chain.map((c) => `${displayPath(c.from)} → ${displayPath(c.to || c.from)}`).join(" → ");
      addIssuePage(instances, "redirect-chains", url, hops || `${page.chain.length} redirects → ${page.finalUrl}`);
    }
    if (page.chain?.length >= 1 && sitemapSet.has(url)) {
      addIssuePage(instances, "non-200-in-sitemap", url, `Redirects to ${page.finalUrl}`);
    }

    if (page.responseMs > 3000) addIssuePage(instances, "slow-pages", url, `${(page.responseMs / 1000).toFixed(1)} s`);
    if (page.contentLength > 2 * 1024 * 1024) {
      addIssuePage(instances, "large-pages", url, `${(page.contentLength / 1024 / 1024).toFixed(1)} MB`);
    }

    if (!page.isHtml || !page.parsed) continue;
    const p = page.parsed;
    htmlPages.push({ url, page });

    if (page.botWall) continue; // blocked/challenge HTML — skip misleading SEO flags

    const metaNoindex = directivesIncludeNoindex(p.metaRobots);
    const headerNoindex = directivesIncludeNoindex(page.xRobots);
    // Meta robots in <head> is authoritative. X-Robots-Tag noindex on a thin 1-page crawl is often bot-cloaking.
    const noindex =
      metaNoindex || (headerNoindex && crawlQuality.quality === "complete" && !metaNoindex);
    if (noindex) {
      const detail = [p.metaRobots && `meta: ${p.metaRobots}`, page.xRobots && `header: ${page.xRobots}`]
        .filter(Boolean)
        .join(" · ");
      addIssuePage(instances, "noindex-pages", url, detail || "noindex");
      continue; // don't flag content issues on intentionally hidden pages
    }

    if (!p.title) addIssuePage(instances, "missing-title", url);
    else {
      const t = p.title.toLowerCase();
      if (!titleGroups.has(t)) titleGroups.set(t, []);
      titleGroups.get(t).push(url);
      if (p.title.length < 30 || p.title.length > 60) {
        addIssuePage(instances, "title-length", url, `${p.title.length} chars: "${p.title.slice(0, 60)}"`);
      }
    }

    if (!p.metaDescription) addIssuePage(instances, "missing-meta-description", url);
    else {
      const d = p.metaDescription.toLowerCase();
      if (!descGroups.has(d)) descGroups.set(d, []);
      descGroups.get(d).push(url);
      if (p.metaDescription.length < 70 || p.metaDescription.length > 160) {
        addIssuePage(instances, "meta-description-length", url, `${p.metaDescription.length} chars`);
      }
    }

    if (p.h1Count === 0) addIssuePage(instances, "missing-h1", url);
    else if (p.h1Count > 1) addIssuePage(instances, "multiple-h1", url, `${p.h1Count} H1 tags`);

    if (p.imgMissingAlt > 0) {
      addIssuePage(instances, "images-missing-alt", url, `${p.imgMissingAlt} of ${p.imgTotal} images`);
    }
    if (p.wordCount < 150) addIssuePage(instances, "thin-content", url, `${p.wordCount} words`);
    if (!p.canonical) addIssuePage(instances, "missing-canonical", url);
    if (p.mixedContentCount > 0) {
      addIssuePage(instances, "mixed-content", url, `${p.mixedContentCount} insecure resources`);
    }
    if (!p.viewport) addIssuePage(instances, "missing-viewport", url);
    if (!p.lang) addIssuePage(instances, "missing-lang", url);
    if (!p.hasLdJson) addIssuePage(instances, "missing-structured-data", url);
    if (!p.ogTitle && !p.ogImage) addIssuePage(instances, "missing-og-tags", url);
    if (page.depth >= 5) addIssuePage(instances, "deep-pages", url, `${page.depth} clicks from home`);

    if (sitemapSet.has(url) && !inboundLinks.has(url)) {
      addIssuePage(instances, "orphan-pages", url);
    }
  }

  // Duplicate groups
  for (const [, urls] of titleGroups) {
    if (urls.length > 1) {
      for (const u of urls) addIssuePage(instances, "duplicate-titles", u, `Shared with ${urls.length - 1} other page(s)`);
    }
  }
  for (const [, urls] of descGroups) {
    if (urls.length > 1) {
      for (const u of urls) addIssuePage(instances, "duplicate-meta-descriptions", u, `Shared with ${urls.length - 1} other page(s)`);
    }
  }

  // Broken external links → attribute to linking pages.
  // 403/429/999 are typically bot-blocking, not actually broken — skip them.
  const brokenExternals = new Set();
  for (const [ext, status] of externalResults) {
    if (status === 0 || (status >= 400 && ![403, 429, 999].includes(status))) brokenExternals.add(ext);
  }
  if (brokenExternals.size) {
    for (const { url, page } of htmlPages) {
      const broken = (page.parsed?.externalLinks || []).filter((l) => brokenExternals.has(l));
      if (broken.length) {
        addIssuePage(instances, "broken-external-links", url, broken.slice(0, 3).join(", "));
      }
    }
  }

  /* ----- assemble issues, counts, score ----- */
  const issues = Object.entries(instances)
    .map(([ruleId, data]) => {
      const rule = AUDIT_RULES[ruleId];
      if (!rule) return null;
      return {
        id: ruleId,
        severity: rule.severity,
        title: rule.title,
        description: rule.description,
        fixSteps: rule.fixSteps,
        count: data.count,
        pages: data.pages,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const w = (s) => (s === "critical" ? 0 : s === "warning" ? 1 : 2);
      return w(a.severity) - w(b.severity) || b.count - a.count;
    });

  const counts = { critical: 0, warning: 0, notice: 0 };
  for (const issue of issues) counts[issue.severity] += issue.count;

  // Health score: share of pages without critical problems, minus warning density
  const totalPages = pages.size || 1;
  const criticalPages = new Set();
  for (const issue of issues) {
    if (issue.severity === "critical") for (const pg of issue.pages) criticalPages.add(pg.url);
  }
  const base = 100 * (1 - Math.min(1, criticalPages.size / totalPages));
  const warningPenalty = Math.min(20, (counts.warning / totalPages) * 8);
  const noticePenalty = Math.min(5, (counts.notice / totalPages) * 1.5);
  let healthScore = Math.max(0, Math.round(base - warningPenalty - noticePenalty));
  if (crawlQuality.quality === "blocked" || crawlQuality.quality === "incomplete") {
    healthScore = null;
  } else if (crawlQuality.quality === "partial") {
    healthScore = Math.min(healthScore, 70);
  }

  // Page inventory for the UI table
  const pageRows = [...pages.entries()]
    .map(([url, page]) => ({
      url,
      status: page.status ?? 0,
      depth: page.depth ?? 0,
      responseMs: page.responseMs ?? null,
      redirects: page.chain?.length || 0,
      title: page.parsed?.title || null,
      titleLength: page.parsed?.title?.length || 0,
      descriptionLength: page.parsed?.metaDescription?.length || 0,
      h1Count: page.parsed?.h1Count ?? null,
      wordCount: page.parsed?.wordCount ?? null,
      noindex: Boolean(
        !page.botWall &&
          (directivesIncludeNoindex(page.parsed?.metaRobots) ||
            (crawlQuality.quality === "complete" && directivesIncludeNoindex(page.xRobots)))
      ),
      botWall: Boolean(page.botWall),
    }))
    .sort((a, b) => (b.status >= 400 ? 1 : 0) - (a.status >= 400 ? 1 : 0) || a.url.localeCompare(b.url));

  const avgResponseMs = Math.round(
    pageRows.reduce((acc, r) => acc + (r.responseMs || 0), 0) / (pageRows.length || 1)
  );

  return {
    issues,
    counts,
    healthScore,
    stats: {
      pagesCrawled: pages.size,
      sitemapUrls: sitemapUrls.length,
      externalChecked: externalResults.size,
      brokenExternal: brokenExternals.size,
      avgResponseMs,
      maxDepth: Math.max(0, ...pageRows.map((r) => r.depth)),
      indexablePages: pageRows.filter((r) => r.status === 200 && !r.noindex && !r.botWall).length,
      crawlQuality: crawlQuality.quality,
      crawlMessage: crawlQuality.message,
      okHtmlPages: crawlQuality.okHtml,
      blockedPages: crawlQuality.blocked,
    },
    pages: pageRows,
  };
}

/** Crawl + analyze in one call. Returns the payload stored on the snapshot. */
export async function runSiteAuditForUrl(siteUrl) {
  const crawl = await crawlSite(siteUrl);
  const analysis = analyzeCrawl(crawl);
  return {
    siteUrl: crawl.origin,
    generatedAt: new Date().toISOString(),
    ...analysis,
  };
}
