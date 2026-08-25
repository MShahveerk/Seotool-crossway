/**
 * Compact SERP battlefield brief for one Blog Studio draft.
 * Uses the same search keys the rest of the app already has (SerpAPI → CSE → Brave).
 * Never fails a draft: missing keys or a dead fetch returns skipped=true.
 */

import { fetchGoogleSerp, extractDomain } from "../serpapi.js";
import { logger } from "../logger.js";

const LISTING_HOSTS = new Set([
  "linkedin.com",
  "indeed.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "tiktok.com",
  "pinterest.com",
  "reddit.com",
  "quora.com",
  "wikipedia.org",
  "amazon.com",
  "ebay.com",
]);

const SCAN_TIMEOUT_MS = 8000;
const MAX_ONPAGE = 3;
const MAX_H2S_PER_PAGE = 10;

export function ownHostFromSiteLink(siteLink) {
  const raw = String(siteLink || "").trim();
  if (!raw) return "";
  try {
    if (raw.toLowerCase().startsWith("sc-domain:")) {
      return extractDomain(raw.slice("sc-domain:".length));
    }
    return extractDomain(raw);
  } catch {
    return "";
  }
}

export function isOwnOrListingHost(domain, ownHost) {
  const d = String(domain || "")
    .toLowerCase()
    .replace(/^www\./, "");
  if (!d) return true;
  if (LISTING_HOSTS.has(d) || [...LISTING_HOSTS].some((h) => d === h || d.endsWith(`.${h}`))) {
    return true;
  }
  const own = String(ownHost || "")
    .toLowerCase()
    .replace(/^www\./, "");
  if (!own) return false;
  return d === own || d.endsWith(`.${own}`) || own.endsWith(`.${d}`);
}

function asTextList(value, max = 12) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const s =
      typeof item === "string"
        ? item.trim()
        : String(item?.question || item?.query || item?.title || "").trim();
    const key = s.toLowerCase();
    if (!s || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function parseWordRange(raw) {
  const m = String(raw || "")
    .replace(/,/g, "")
    .match(/(\d+)\s*[-–to]+\s*(\d+)/i);
  if (!m) {
    const n = Number(String(raw || "").replace(/[^\d]/g, ""));
    if (Number.isFinite(n) && n > 0) return { min: n, max: n };
    return { min: 1200, max: 1800 };
  }
  return { min: Number(m[1]), max: Number(m[2]) };
}

/**
 * Aim above the typical ranking page without ignoring an operator who already
 * asked for a long article. Floor is high enough to beat thin 1,200-word posts.
 */
function roundHundred(n) {
  return Math.round(Number(n) / 100) * 100;
}

export function suggestWordCountRange(avgWords, configured = "1200-1800") {
  const { min: cfgMin, max: cfgMax } = parseWordRange(configured);
  const floor = 1800;
  const ceiling = 3400;
  const fromSerp = Number(avgWords) > 400 ? Math.round(Number(avgWords) * 1.1) : 0;
  const target = roundHundred(Math.min(ceiling, Math.max(floor, fromSerp || Math.max(cfgMax, 2000))));
  const min = roundHundred(Math.max(floor, cfgMin, target - 300));
  const max = roundHundred(Math.min(ceiling + 200, Math.max(cfgMax, target + 400, min + 400)));
  return `${min}-${max}`;
}

function tokenSet(value) {
  return new Set(
    String(value || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 3)
  );
}

export function uncoveredQuestions(questions, rivalH2s) {
  const heads = (rivalH2s || []).flatMap((row) => asTextList(row.h2s, 20));
  const gaps = [];
  for (const q of asTextList(questions, 12)) {
    const qt = tokenSet(q);
    const covered = heads.some((h) => {
      const ht = tokenSet(h);
      if (!qt.size) return false;
      let hit = 0;
      for (const t of qt) if (ht.has(t)) hit += 1;
      return hit / qt.size >= 0.5;
    });
    if (!covered) gaps.push(q);
    if (gaps.length >= 6) break;
  }
  return gaps;
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&#38;/g, "&")
    .replace(/&#8211;/g, "-")
    .replace(/&#8217;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .trim();
}

async function lightScan(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (!html || html.length < 400) return null;
    const h2s = [];
    const h2Re = /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi;
    let m;
    while ((m = h2Re.exec(html)) !== null && h2s.length < MAX_H2S_PER_PAGE) {
      const text = decodeEntities(m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
      if (text && text.length < 120) h2s.push(text);
    }
    const clean = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const wordCount = clean ? clean.split(" ").filter((w) => w.length > 1).length : 0;
    return { h2s, wordCount };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function emptySerpCompete(reason, extras = {}) {
  const suggestedWordCountRange =
    extras.suggestedWordCountRange || suggestWordCountRange(null, extras.configuredRange || "1200-1800");
  return {
    ok: false,
    skipped: true,
    reason: String(reason || "unavailable"),
    query: extras.query || "",
    provider: extras.provider || "",
    titles: [],
    peopleAlsoAsk: [],
    relatedSearches: [],
    rivalPages: [],
    avgWordCount: null,
    suggestedWordCountRange,
    gaps: extras.gaps || [],
    writerRules: extras.writerRules || defaultWriterRules({ skipped: true, suggestedWordCountRange }),
  };
}

export function defaultWriterRules({ skipped = false, suggestedWordCountRange = "", gaps = [] } = {}) {
  const rules = [
    "Open with a direct answer in the first 80 words. No 'in this article' throat-clearing.",
    "Write for a buyer comparing options, not a generic explainer. Use named criteria, tradeoffs, and next questions.",
    "Include one HTML comparison table (criteria vs options). Never invent prices, certificates, or client results. If a number is not in operator_facts / brand_notes / seed_prompt, say how the reader should get it from the operator.",
    "FAQ must answer real search questions (peopleAlsoAsk, related searches, or buying questions). Short, specific answers.",
    "Add at least two sections page-1 rivals do not use (a decision framework, a trap, a route/use-case split, or an operator-side constraint).",
    "Use every concrete fact in operator_facts, brand_notes, and seed_prompt. Do not pad with 'when it makes sense' filler.",
    "Never copy a rival title. Never claim a statistic you cannot source from the supplied brief.",
  ];
  if (suggestedWordCountRange) {
    rules.push(`Hit ${suggestedWordCountRange} words of real substance, not repeated intros.`);
  } else if (skipped) {
    rules.push("If no SERP pack is present, still write 1800+ words with a table, FAQ, and two unique sections.");
  }
  if (gaps.length) {
    rules.push(`Cover these unanswered SERP questions in H2s or FAQ: ${gaps.slice(0, 4).join(" | ")}`);
  }
  return rules;
}

export function compactSerpCompete(pack) {
  if (!pack || pack.skipped) {
    return {
      skipped: true,
      reason: pack?.reason || "unavailable",
      writerRules: pack?.writerRules || defaultWriterRules({ skipped: true }),
      suggestedWordCountRange: pack?.suggestedWordCountRange || "",
    };
  }
  return {
    skipped: false,
    query: pack.query,
    provider: pack.provider,
    suggestedWordCountRange: pack.suggestedWordCountRange,
    avgWordCount: pack.avgWordCount,
    titles: (pack.titles || []).slice(0, 8).map((t) => ({
      position: t.position,
      title: t.title,
      domain: t.domain,
      snippet: String(t.snippet || "").slice(0, 180),
    })),
    peopleAlsoAsk: (pack.peopleAlsoAsk || []).slice(0, 8),
    relatedSearches: (pack.relatedSearches || []).slice(0, 8),
    rivalH2s: (pack.rivalPages || []).map((p) => ({
      domain: p.domain,
      wordCount: p.wordCount,
      h2s: (p.h2s || []).slice(0, 8),
    })),
    gaps: (pack.gaps || []).slice(0, 6),
    writerRules:
      Array.isArray(pack.writerRules) && pack.writerRules.length
        ? pack.writerRules
        : defaultWriterRules(pack),
  };
}

export function buildCompeteFromSerp(serp, { query, ownHost, configuredRange, extraQuestions = [] } = {}) {
  const organic = Array.isArray(serp?.organic) ? serp.organic : [];
  const titles = organic.slice(0, 10).map((row) => ({
    position: row.position,
    title: String(row.title || "").trim(),
    domain: row.domain || extractDomain(row.link),
    snippet: String(row.snippet || "").trim(),
    link: row.link,
  }));
  const peopleAlsoAsk = asTextList(serp?.relatedQuestions, 8);
  const relatedSearches = asTextList(serp?.relatedSearches, 8);
  return {
    ok: titles.length > 0,
    skipped: false,
    reason: "",
    query: query || serp?.keyword || "",
    provider: serp?.provider || serp?.providerLabel || "",
    titles,
    peopleAlsoAsk,
    relatedSearches,
    rivalPages: [],
    avgWordCount: null,
    suggestedWordCountRange: suggestWordCountRange(null, configuredRange),
    gaps: uncoveredQuestions([...peopleAlsoAsk, ...relatedSearches, ...asTextList(extraQuestions, 8)], []),
    writerRules: [],
    _scanTargets: titles
      .filter((t) => t.link && !isOwnOrListingHost(t.domain, ownHost))
      .slice(0, MAX_ONPAGE),
  };
}

function finalizePack(pack, configuredRange) {
  const counts = (pack.rivalPages || []).map((p) => Number(p.wordCount) || 0).filter((n) => n > 400);
  const avgWordCount = counts.length
    ? Math.round(counts.reduce((a, b) => a + b, 0) / counts.length)
    : null;
  const suggestedWordCountRange = suggestWordCountRange(avgWordCount, configuredRange);
  const gaps = uncoveredQuestions(
    [...(pack.peopleAlsoAsk || []), ...(pack.relatedSearches || []), ...(pack.gaps || [])],
    pack.rivalPages
  );
  const next = {
    ...pack,
    avgWordCount,
    suggestedWordCountRange,
    gaps,
  };
  next.writerRules = defaultWriterRules(next);
  delete next._scanTargets;
  return next;
}

/**
 * One organic SERP + light H2/word-count scans of the top rival URLs.
 */
export async function collectSerpCompete({
  query,
  gl = "us",
  siteLink = "",
  configuredRange = "1200-1800",
  extraQuestions = [],
} = {}) {
  const q = String(query || "").trim();
  if (!q) return emptySerpCompete("empty query", { configuredRange });

  let serp;
  try {
    serp = await fetchGoogleSerp(q, { gl, num: 10, skipDuckDuckGo: true });
  } catch (err) {
    logger.warn?.("[blogStudio] SERP compete fetch skipped", { message: err.message });
    return emptySerpCompete(err.message || "search failed", {
      query: q,
      configuredRange,
    });
  }

  const ownHost = ownHostFromSiteLink(siteLink);
  const pack = buildCompeteFromSerp(serp, {
    query: q,
    ownHost,
    configuredRange,
    extraQuestions,
  });
  if (!pack.ok) {
    return emptySerpCompete("no organic results", {
      query: q,
      provider: pack.provider,
      configuredRange,
    });
  }

  const targets = pack._scanTargets || [];
  if (targets.length) {
    const scans = await Promise.all(
      targets.map(async (row) => {
        const scan = await lightScan(row.link);
        if (!scan) return null;
        return {
          domain: row.domain,
          url: row.link,
          h2s: scan.h2s,
          wordCount: scan.wordCount,
        };
      })
    );
    pack.rivalPages = scans.filter(Boolean);
  }

  return finalizePack(pack, configuredRange);
}
