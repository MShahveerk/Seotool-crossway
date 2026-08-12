/**
 * SERP Analysis engine.
 *
 * For a keyword: pull the live Google SERP (SerpApi), find YOUR position, the
 * rivals ±5 ranks around you, and the page-1 leaders — then deep-scan each page
 * (on-page HTML + PageSpeed + Open PageRank authority) and compute where you
 * beat the ranks below you and what it takes to overtake the ranks above you.
 *
 * v1 sources: SerpApi (SERP) + free HTML scrape + Google PageSpeed + Open PageRank.
 * No keyword volume/CPC/KD and no backlink profiles in this version.
 */

import { fetchGoogleSerp, extractDomain } from "./serpapi.js";
import { getAuthorityScores } from "./authority.js";
import { isSerankingConfigured } from "./seranking/config.js";
import { fetchSerankingMetricsMap, normKeyword } from "./seranking/keywordMetrics.js";

const RIVAL_WINDOW = 5; // ranks above and below you
const MAX_DEEP_SCANS = 12; // cap on pages we fetch/audit per run

/** SE Ranking regional DB code → SerpApi `gl` country code (differ for UK). */
const GEO_TO_GL = { us: "us", uk: "gb", ca: "ca", au: "au", pk: "pk" };

/**
 * Keyword volume / KD / CPC / competition from the SE Ranking Data API.
 * Best-effort: never throws — a metrics failure must not sink the SERP analysis.
 */
async function fetchKeywordMetrics(keyword, geo, siteUrl) {
  if (!isSerankingConfigured()) return { available: false, configured: false };
  try {
    const { metricsMap, fromCache, error } = await fetchSerankingMetricsMap([keyword], geo, siteUrl, {
      seedKeyword: keyword,
      allowManual: true,
    });
    const row = metricsMap.get(normKeyword(keyword));
    if (!row) return { available: false, configured: true, error: error || null };
    return {
      available: true,
      configured: true,
      fromCache: Boolean(fromCache),
      source: row.source || geo,
      volume: row.volume ?? null,
      difficulty: row.difficulty ?? null,
      cpc: row.cpc ?? null,
      cpcFormatted: row.cpcFormatted ?? null,
      competition: row.competition ?? null,
      competitionLevel: row.competitionLevel ?? null,
      trendDirection: row.trendDirection ?? null,
      monthlyTrend: row.monthlyTrend ?? [],
      intents: row.intents ?? [],
    };
  } catch (err) {
    return { available: false, configured: true, error: err.message || "Keyword metrics failed" };
  }
}

/* ------------------------------------------------------------------ */
/* On-page HTML scan (scheme/UA fallbacks to survive 403 firewalls)    */
/* ------------------------------------------------------------------ */

async function fetchHtml(originalUrl) {
  let urlObj;
  try {
    urlObj = new URL(originalUrl.startsWith("http") ? originalUrl : `https://${originalUrl}`);
  } catch {
    return "";
  }

  const host = urlObj.hostname.replace(/^www\./, "");
  const tail = urlObj.pathname + urlObj.search;
  const candidates = [...new Set([urlObj.href, `https://www.${host}${tail}`, `https://${host}${tail}`])];

  // Googlebot first: most WAFs whitelist it, which unblocks otherwise-403 pages.
  const headerSets = [
    {
      "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  ];

  for (const candidate of candidates) {
    for (const headers of headerSets) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 9000);
        const res = await fetch(candidate, { signal: controller.signal, redirect: "follow", headers });
        clearTimeout(timeoutId);
        if (res.ok) {
          const html = await res.text();
          if (html && html.trim().length > 100 && !html.includes("403 - Forbidden")) return html;
        }
      } catch {
        /* try next candidate / header */
      }
    }
  }
  return "";
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&#38;/g, "&")
    .replace(/&#8211;/g, "-")
    .replace(/&#8217;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** Extract the on-page signals we compare competitors on. */
export async function scanOnPage(targetUrl) {
  const html = await fetchHtml(targetUrl);
  if (!html) {
    return { ok: false, wordCount: 0, headings: [], h1Count: 0, h2Count: 0, h3Count: 0, schemas: [], totalImages: 0, imagesWithAlt: 0 };
  }

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]) : "";

  const metaMatch =
    html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
  const metaDescription = metaMatch ? decodeEntities(metaMatch[1]) : "";

  const headings = [];
  const headingRegex = /<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = headingRegex.exec(html)) !== null) {
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, ""));
    if (text) headings.push({ tag: m[1].toLowerCase(), text });
  }

  const cleanText = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const wordCount = cleanText ? cleanText.split(" ").filter((w) => w.length > 1).length : 0;

  const schemas = [];
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ld;
  while ((ld = jsonLdRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(ld[1]);
      const collect = (node) => {
        if (!node) return;
        if (Array.isArray(node)) return node.forEach(collect);
        if (node["@type"]) {
          const t = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
          schemas.push(...t);
        }
        if (Array.isArray(node["@graph"])) node["@graph"].forEach(collect);
      };
      collect(parsed);
    } catch {
      /* ignore malformed JSON-LD */
    }
  }
  const itemTypeRegex = /itemtype=["']https?:\/\/schema\.org\/([^"']+)["']/gi;
  let it;
  while ((it = itemTypeRegex.exec(html)) !== null) schemas.push(it[1]);

  const imgs = html.match(/<img[^>]+>/gi) || [];
  const imagesWithAlt = imgs.filter((img) => /alt=["'][^"']+["']/i.test(img)).length;

  return {
    ok: true,
    title,
    metaDescription,
    wordCount,
    readingTimeMinutes: Math.max(1, Math.ceil(wordCount / 200)),
    headings,
    h1Count: headings.filter((h) => h.tag === "h1").length,
    h2Count: headings.filter((h) => h.tag === "h2").length,
    h3Count: headings.filter((h) => h.tag === "h3").length,
    schemas: [...new Set(schemas.filter(Boolean))],
    totalImages: imgs.length,
    imagesWithAlt,
  };
}

/* ------------------------------------------------------------------ */
/* PageSpeed (Google Lighthouse, mobile) — best effort                 */
/* ------------------------------------------------------------------ */

async function fetchPageSpeed(targetUrl) {
  try {
    const url = targetUrl.startsWith("http") ? targetUrl : `https://${targetUrl}`;
    const params = new URLSearchParams({ url, category: "performance", strategy: "mobile" });
    const apiKey = process.env.PAGESPEED_API_KEY || "";
    if (apiKey) params.append("key", apiKey);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;

    const data = await res.json();
    const lh = data.lighthouseResult || {};
    const audits = lh.audits || {};
    return {
      score: Math.round((lh.categories?.performance?.score || 0) * 100),
      lcp: audits["largest-contentful-paint"]?.displayValue || null,
      cls: audits["cumulative-layout-shift"]?.displayValue || null,
      ttfb: audits["server-response-time"]?.displayValue || null,
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function cleanHost(siteUrl) {
  return extractDomain(siteUrl);
}

/** Does a SERP result domain belong to our site? (handles www / subdomains) */
function isSameSite(resultDomain, yourHost) {
  if (!resultDomain || !yourHost) return false;
  if (resultDomain === yourHost) return true;
  return resultDomain.endsWith(`.${yourHost}`) || yourHost.endsWith(`.${resultDomain}`);
}

function avg(nums) {
  const list = nums.filter((n) => n != null && Number.isFinite(n));
  return list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : 0;
}

function num(n) {
  return new Intl.NumberFormat("en-US").format(Math.round(Number(n) || 0));
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

/**
 * @param {string} siteUrl - your site (used to locate your rank in the SERP)
 * @param {string} keyword
 * @param {object} [opts] - { location, device, depth }
 */
export async function buildSerpAnalysis(siteUrl, keyword, opts = {}) {
  const { location = "", device = "desktop", depth = 30, geo = "us" } = opts;
  const yourHost = cleanHost(siteUrl);

  // SERP (SerpApi) + keyword metrics (SE Ranking) in parallel. SERP is required;
  // metrics is best-effort so it can never throw and abort the whole analysis.
  const [serp, keywordMetrics] = await Promise.all([
    fetchGoogleSerp(keyword, { location, gl: GEO_TO_GL[geo] || "us", device, num: depth }),
    fetchKeywordMetrics(keyword, geo, siteUrl),
  ]);
  const results = serp.organic;

  // 1. Locate your position in the live SERP.
  const yourEntry = yourHost ? results.find((r) => isSameSite(r.domain, yourHost)) || null : null;
  const yourRank = yourEntry ? yourEntry.position : null;

  // 2. Page-1 leaders (top 10) and the ±window rivals around you.
  const leaders = results.filter((r) => r.position <= 10);
  const rivalsAbove = yourRank ? results.filter((r) => r.position < yourRank && r.position >= yourRank - RIVAL_WINDOW) : [];
  const rivalsBelow = yourRank ? results.filter((r) => r.position > yourRank && r.position <= yourRank + RIVAL_WINDOW) : [];

  // 3. Decide which pages to deep-scan (dedupe by link, cap the count).
  const scanList = [];
  const seen = new Set();
  for (const r of [...(yourEntry ? [yourEntry] : []), ...rivalsAbove, ...rivalsBelow, ...leaders]) {
    if (r && !seen.has(r.link)) {
      seen.add(r.link);
      scanList.push(r);
    }
  }
  const scanTargets = scanList.slice(0, MAX_DEEP_SCANS);

  // 4. Authority in one bulk (cached) call.
  const authMap = await getAuthorityScores(scanTargets.map((t) => t.domain)).catch(() => new Map());

  // 5. Scan on-page + PageSpeed in parallel.
  const scanned = await Promise.all(
    scanTargets.map(async (t) => {
      const [onpage, speed] = await Promise.all([scanOnPage(t.link), fetchPageSpeed(t.link)]);
      const auth = authMap.get(t.domain);
      return {
        position: t.position,
        title: onpage.title || t.title || t.domain,
        link: t.link,
        domain: t.domain,
        snippet: t.snippet,
        metaDescription: onpage.metaDescription || "",
        wordCount: onpage.wordCount,
        readingTimeMinutes: onpage.readingTimeMinutes || 1,
        headings: onpage.headings || [],
        h1Count: onpage.h1Count || 0,
        h2Count: onpage.h2Count || 0,
        h3Count: onpage.h3Count || 0,
        schemas: onpage.schemas || [],
        totalImages: onpage.totalImages || 0,
        imagesWithAlt: onpage.imagesWithAlt || 0,
        speed,
        authority: auth ? { score: auth.score, globalRank: auth.globalRank } : null,
        scanned: onpage.ok,
        isYou: Boolean(yourEntry && t.link === yourEntry.link),
      };
    })
  );

  const byLink = new Map(scanned.map((s) => [s.link, s]));
  const enrich = (arr) => arr.map((r) => byLink.get(r.link)).filter(Boolean);

  const you = yourEntry ? byLink.get(yourEntry.link) || null : null;
  const leadersFull = enrich(leaders);
  const aboveFull = enrich(rivalsAbove);
  const belowFull = enrich(rivalsBelow);

  // 6. Leader benchmark.
  const summary = {
    avgWordCount: avg(leadersFull.map((c) => c.wordCount)),
    avgH2Count: avg(leadersFull.map((c) => c.h2Count)),
    avgSpeedScore: avg(leadersFull.map((c) => c.speed?.score)),
    avgAuthority:
      avg(leadersFull.map((c) => (c.authority?.score != null ? c.authority.score * 10 : null))) / 10 || 0,
    commonSchemas: [...new Set(leadersFull.flatMap((c) => c.schemas))],
    leadersScanned: leadersFull.filter((c) => c.scanned).length,
  };

  // 7. Head-to-head diffs.
  const vsAbove = you ? aboveFull.map((r) => diffRow(you, r, "above")) : [];
  const vsBelow = you ? belowFull.map((r) => diffRow(you, r, "below")) : [];
  const actions = buildActions(you, summary, aboveFull, keyword, yourRank);

  return {
    keyword: serp.keyword,
    yourHost,
    yourRank,
    found: Boolean(yourEntry),
    location: serp.location,
    device: serp.device,
    geo,
    keywordMetrics,
    serpDepth: results.length,
    totalResults: serp.totalResults,
    you,
    leaders: leadersFull,
    rivalsAbove: aboveFull,
    rivalsBelow: belowFull,
    summary,
    vsAbove,
    vsBelow,
    actions,
    relatedQuestions: serp.relatedQuestions,
    relatedSearches: serp.relatedSearches,
  };
}

/** One rival's metric deltas relative to your page. */
function diffRow(you, rival, side) {
  const wordDelta = (rival.wordCount || 0) - (you.wordCount || 0);
  const h2Delta = (rival.h2Count || 0) - (you.h2Count || 0);
  const speedDelta =
    rival.speed?.score != null && you.speed?.score != null ? rival.speed.score - you.speed.score : null;
  const authDelta =
    rival.authority?.score != null && you.authority?.score != null
      ? Number((rival.authority.score - you.authority.score).toFixed(1))
      : null;
  const theirExtraSchemas = (rival.schemas || []).filter((s) => !(you.schemas || []).includes(s));
  const yourExtraSchemas = (you.schemas || []).filter((s) => !(rival.schemas || []).includes(s));

  return {
    position: rival.position,
    domain: rival.domain,
    title: rival.title,
    link: rival.link,
    scanned: rival.scanned,
    side,
    wordDelta,
    h2Delta,
    speedDelta,
    authDelta,
    theirExtraSchemas,
    yourExtraSchemas,
    theirWordCount: rival.wordCount,
    theirSpeed: rival.speed?.score ?? null,
    theirAuthority: rival.authority?.score ?? null,
  };
}

/** Deterministic, empirical action plan — no invented numbers. */
function buildActions(you, summary, aboveFull, keyword, yourRank) {
  const actions = [];

  if (!you) {
    actions.push({
      priority: "HIGH",
      title: "You don't rank on this SERP yet",
      description: `Your site was not found in the top results for "${keyword}". To compete, match the page-1 benchmark below: ~${num(summary.avgWordCount)} words, ${summary.avgH2Count} H2 sections${summary.commonSchemas.length ? `, and ${summary.commonSchemas.join(", ")} schema` : ""}.`,
    });
    return actions;
  }

  if (summary.avgWordCount > 0 && you.wordCount < summary.avgWordCount * 0.85) {
    actions.push({
      priority: "HIGH",
      title: "Expand content depth",
      description: `Add ~${num(summary.avgWordCount - you.wordCount)} words. Page-1 leaders average ${num(summary.avgWordCount)} words vs your ${num(you.wordCount)}.`,
    });
  }

  if (summary.avgH2Count > 0 && you.h2Count < summary.avgH2Count) {
    actions.push({
      priority: "MEDIUM",
      title: "Add more H2 sub-sections",
      description: `Add ${summary.avgH2Count - you.h2Count} more H2 headings to reach the leader average of ${summary.avgH2Count}.`,
    });
  }

  const missingSchemas = summary.commonSchemas.filter((s) => !(you.schemas || []).includes(s));
  if (missingSchemas.length) {
    actions.push({
      priority: "HIGH",
      title: `Implement ${missingSchemas.join(", ")} schema`,
      description: `Page-1 leaders use ${missingSchemas.join(", ")} JSON-LD you don't. Structured data earns richer SERP snippets.`,
    });
  }

  if (you.speed?.score != null && summary.avgSpeedScore > 0 && you.speed.score < summary.avgSpeedScore - 10) {
    actions.push({
      priority: "HIGH",
      title: "Close the PageSpeed gap",
      description: `Your PageSpeed is ${you.speed.score}/100 vs the leader average of ${summary.avgSpeedScore}. Optimize LCP, images, and TTFB.`,
    });
  }

  // The single most actionable target: the rival directly above you.
  const nextUp = aboveFull.filter((r) => r.scanned).sort((a, b) => b.position - a.position)[0];
  if (nextUp && yourRank) {
    const bits = [];
    const wd = (nextUp.wordCount || 0) - (you.wordCount || 0);
    if (wd > 100) bits.push(`+${num(wd)} words`);
    if (nextUp.speed?.score != null && you.speed?.score != null && nextUp.speed.score > you.speed.score + 5)
      bits.push(`${nextUp.speed.score - you.speed.score} pts faster`);
    if (nextUp.authority?.score != null && you.authority?.score != null && nextUp.authority.score > you.authority.score)
      bits.push(`${(nextUp.authority.score - you.authority.score).toFixed(1)} higher authority`);
    const extra = (nextUp.schemas || []).filter((s) => !(you.schemas || []).includes(s));
    if (extra.length) bits.push(`${extra.join(", ")} schema`);

    actions.push({
      priority: "HIGH",
      title: `Overtake #${nextUp.position} — ${nextUp.domain}`,
      description: bits.length
        ? `The rival one rank above you leads on: ${bits.join("; ")}. Beat these to move from #${yourRank} to #${nextUp.position}.`
        : `You're close to #${nextUp.position} (${nextUp.domain}) on measured on-page signals — sharpen title/intent match and internal links to overtake.`,
    });
  }

  if (!actions.length) {
    actions.push({
      priority: "MEDIUM",
      title: "You match the on-page benchmark",
      description: `Your page meets or beats the page-1 leaders on measured signals. Focus next on backlinks/authority and search-intent match to climb from #${yourRank}.`,
    });
  }

  return actions;
}
