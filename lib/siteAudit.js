/**
 * Site Audit engine: crawls a website (same-origin, sitemap-seeded, robots-aware),
 * analyzes every page's HTML, and emits issues from the rules catalog with a
 * 0-100 health score.
 */
import { AUDIT_RULES } from "./siteAuditRules.js";
import { normalizeSiteOrigin } from "./validation.js";

const USER_AGENT = "Mozilla/5.0 (compatible; CrosswayAuditBot/1.0)";
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
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,*/*", ...(opts.headers || {}) },
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

  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of metaTags) {
    const name = (getAttr(tag, "name") || "").toLowerCase();
    const property = (getAttr(tag, "property") || "").toLowerCase();
    const content = getAttr(tag, "content");
    if (name === "description") out.metaDescription = decodeEntities(content || "").trim() || null;
    else if (name === "robots") out.metaRobots = (content || "").toLowerCase();
    else if (name === "viewport") out.viewport = true;
    else if (property === "og:title") out.ogTitle = true;
    else if (property === "og:image") out.ogImage = true;
  }

  const linkTags = html.match(/<link\b[^>]*>/gi) || [];
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
    if (alt === null || alt === "") out.imgMissingAlt += 1;
  }

  // Mixed content: http:// resources on https pages
  if (pageUrl.startsWith("https://")) {
    const resTags = html.match(/<(?:img|script|link|iframe|source|video|audio)\b[^>]*>/gi) || [];
    for (const tag of resTags) {
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

/** Fetch one URL following redirects manually so the chain is observable. */
async function fetchPage(url) {
  const chain = [];
  let current = url;
  const started = Date.now();

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
      chain.push({ from: current, status: res.status });
      const next = normalizeUrl(loc, current);
      if (!next) return { url, finalUrl: current, status: res.status, chain, responseMs: Date.now() - started };
      if (chain.some((c) => c.from === next) || next === current) {
        return { url, finalUrl: next, status: res.status, chain, redirectLoop: true, responseMs: Date.now() - started };
      }
      current = next;
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
  const instances = {};
  const htmlPages = [];
  const sitemapSet = new Set(sitemapUrls.map((u) => normalizeUrl(u, crawl.origin)).filter(Boolean));

  const titleGroups = new Map();
  const descGroups = new Map();

  for (const [url, page] of pages) {
    const linkedFrom = inboundLinks.get(url);

    if (page.redirectLoop) {
      addIssuePage(instances, "redirect-loops", url, `${page.chain.length + 1} hops`);
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
      addIssuePage(instances, "redirect-chains", url, `${page.chain.length} redirects → ${page.finalUrl}`);
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

    const noindex = (p.metaRobots || "").includes("noindex") || (page.xRobots || "").includes("noindex");
    if (noindex) {
      addIssuePage(instances, "noindex-pages", url, p.metaRobots || page.xRobots);
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
  const healthScore = Math.max(0, Math.round(base - warningPenalty - noticePenalty));

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
        (page.parsed?.metaRobots || "").includes("noindex") || (page.xRobots || "").includes("noindex")
      ),
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
      indexablePages: pageRows.filter((r) => r.status === 200 && !r.noindex).length,
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
