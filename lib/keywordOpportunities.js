/**
 * Keyword Opportunities — "which keywords are actually worth the work?"
 *
 * A ranking-keyword export is not a strategy: it's a list sorted by whatever
 * you already win. The useful question is narrower — where is the gap between
 * effort and reward smallest? That's what this scores.
 *
 * Two sources of opportunity, scored on one scale so they compete honestly:
 *
 *   1. **Keywords the domain already ranks for.** Position 4–10 is the single
 *      best place in SEO to spend an hour: the page already ranks, Google
 *      already trusts it for the term, and moving 6→3 can multiply clicks
 *      without writing anything new. Position 11–20 is the next best.
 *   2. **Gaps** — keywords its competitors rank for and it doesn't at all.
 *      Proven to carry traffic in this exact niche, just not claimed yet.
 *
 * Works for **any** domain, not just the selected client: everything is keyed
 * on the domain string, and each domain gets its own 30-day cache bucket.
 *
 * Cost: `/domain/keywords` and `/domain/competitors` are ~100 credits each, so
 * a cold run is roughly 100 x (1 + 1 + rivals). Cached 30 days per domain, and
 * rivals are shared across analyses in the same niche.
 */

import crypto from "crypto";
import { fetchDomainCompetitors, fetchDomainKeywords } from "./seranking/api.js";
import { normalizeDomainCompetitors, normalizeDomainKeywordsList } from "./seranking/normalize.js";
import { getCachedSnapshot, saveSnapshot } from "./seranking/cache.js";
import { DATA_TYPES } from "./seranking/config.js";
import { logger } from "./logger.js";

/**
 * Opportunity classes, best-first.
 *
 * `bonus` is added to the score — it encodes "how cheap is the win", which is
 * deliberately separate from "how big is the prize" (volume/CPC do that).
 */
export const OPPORTUNITY_TYPES = {
  "quick-win": {
    label: "Quick win",
    bonus: 46,
    hint: "Ranks 4–10. The page already ranks and Google already trusts it — a refresh, better title or a few internal links can take it to the top 3.",
  },
  striking: {
    label: "Striking distance",
    bonus: 34,
    hint: "Ranks 11–20. One serious push from page one. Usually the best use of a new content sprint.",
  },
  gap: {
    label: "Competitor gap",
    bonus: 26,
    hint: "A rival ranks for this and you don't at all. Proven to carry traffic in this niche — needs a new page.",
  },
  climbing: {
    label: "Climbing",
    bonus: 14,
    hint: "Ranks 21–50. Real work, but the term is already associated with the site.",
  },
  defend: {
    label: "Defend",
    bonus: 6,
    hint: "Already top 3. Nothing to win here — protect it and keep the page fresh.",
  },
  deep: {
    label: "Long haul",
    bonus: 0,
    hint: "Ranks beyond 50. Only worth it if the term is strategically important.",
  },
};

function cleanHost(value) {
  if (!value) return "";
  try {
    const url = String(value).startsWith("http") ? String(value) : `https://${value}`;
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return String(value)
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .toLowerCase();
  }
}

function normKey(k) {
  return String(k || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function classify(position, isGap) {
  if (isGap) return "gap";
  if (position == null) return "gap";
  if (position <= 3) return "defend";
  if (position <= 10) return "quick-win";
  if (position <= 20) return "striking";
  if (position <= 50) return "climbing";
  return "deep";
}

/**
 * One score so every opportunity competes on the same scale.
 *
 * Volume is logged, not linear — the difference between 100 and 1,000 searches
 * matters far more than 10,000 versus 11,000, and linear volume would let a few
 * huge head terms bury every winnable long-tail keyword.
 */
function scoreRow({ volume, difficulty, cpc, type, rivalCount }) {
  const vol = Math.log10(Math.max(0, Number(volume) || 0) + 1) * 22;
  const kd = (Number(difficulty) || 0) * 0.55;
  const money = Math.min(Number(cpc) || 0, 20) * 2;
  const ease = OPPORTUNITY_TYPES[type]?.bonus ?? 0;
  // Several rivals ranking is evidence the term is winnable for a site like this.
  const proof = Math.min(Number(rivalCount) || 0, 4) * 5;
  return Math.max(0, Math.round(vol + ease + money + proof - kd));
}

function effortOf(difficulty) {
  const kd = Number(difficulty);
  if (!Number.isFinite(kd)) return "unknown";
  if (kd < 30) return "low";
  if (kd < 50) return "medium";
  if (kd < 70) return "high";
  return "very high";
}

function cacheKey(domain, rivals) {
  const h = crypto.createHash("sha256").update(cleanHost(domain)).digest("hex").slice(0, 20);
  // Bump when the scoring or output shape changes.
  return `ko-v1:${rivals}:${h}`;
}

/** Pull a domain's ranking keywords into its own cache bucket. */
async function keywordsFor(domain) {
  const host = cleanHost(domain);
  if (!host) return [];
  try {
    // Cache bucket is siteUrl + dataType + sourceKey — passing the domain as
    // BOTH arguments is what keeps one domain's keywords from overwriting
    // another's. (Same trap as the SERP analysis competitor profiles.)
    const res = await fetchDomainKeywords(host, host, { allowManual: true });
    return normalizeDomainKeywordsList(res?.data, "us");
  } catch (err) {
    logger?.warn?.(`Keyword opportunities: keywords for ${host} failed — ${err.message}`);
    return [];
  }
}

/**
 * @param {string} domainInput  any domain — not restricted to the selected client
 * @param {{ rivals?: number }} [opts]
 */
export async function buildKeywordOpportunities(domainInput, opts = {}) {
  const { rivals: rivalLimit = 5 } = opts;
  const domain = cleanHost(domainInput);

  if (!domain) {
    return {
      domain: "",
      rows: [],
      competitors: [],
      summary: emptySummary(),
      notes: ["No domain supplied."],
    };
  }

  const own = await keywordsFor(domain);

  // Competitors, so we can find what they rank for and this domain doesn't.
  let competitors = [];
  try {
    const res = await fetchDomainCompetitors(domain, domain, { allowManual: true });
    competitors = normalizeDomainCompetitors(res?.data)
      .filter((c) => cleanHost(c.domain) && cleanHost(c.domain) !== domain)
      .slice(0, rivalLimit);
  } catch (err) {
    logger?.warn?.(`Keyword opportunities: competitors for ${domain} failed — ${err.message}`);
  }

  const rivalKeywordSets = await Promise.all(
    competitors.map(async (c) => ({
      domain: cleanHost(c.domain),
      keywords: await keywordsFor(c.domain),
    }))
  );

  // How many rivals rank for each keyword, and the best position any of them holds.
  const rivalIndex = new Map();
  for (const set of rivalKeywordSets) {
    for (const row of set.keywords) {
      const key = normKey(row.keyword);
      if (!key) continue;
      let entry = rivalIndex.get(key);
      if (!entry) {
        entry = { row, domains: new Set(), bestPosition: null };
        rivalIndex.set(key, entry);
      }
      entry.domains.add(set.domain);
      if (row.position != null && (entry.bestPosition == null || row.position < entry.bestPosition)) {
        entry.bestPosition = row.position;
        entry.row = row;
      }
    }
  }

  const ownKeys = new Set(own.map((r) => normKey(r.keyword)).filter(Boolean));

  const rows = [];

  // 1. What the domain already ranks for.
  for (const row of own) {
    const key = normKey(row.keyword);
    if (!key) continue;
    const rival = rivalIndex.get(key);
    const type = classify(row.position, false);
    rows.push({
      keyword: row.keyword,
      type,
      typeLabel: OPPORTUNITY_TYPES[type].label,
      typeHint: OPPORTUNITY_TYPES[type].hint,
      position: row.position ?? null,
      url: row.url || null,
      volume: row.volume ?? null,
      difficulty: row.difficulty ?? null,
      effort: effortOf(row.difficulty),
      cpc: row.cpc ?? null,
      cpcFormatted: row.cpcFormatted || null,
      traffic: row.traffic ?? null,
      trendDirection: row.trendDirection || null,
      intents: row.intents || [],
      rivalCount: rival ? rival.domains.size : 0,
      rivalBestPosition: rival?.bestPosition ?? null,
      rivalDomains: rival ? [...rival.domains] : [],
      score: scoreRow({
        volume: row.volume,
        difficulty: row.difficulty,
        cpc: row.cpc,
        type,
        rivalCount: rival ? rival.domains.size : 0,
      }),
    });
  }

  // 2. Gaps — rivals rank, this domain doesn't.
  for (const [key, entry] of rivalIndex) {
    if (ownKeys.has(key)) continue;
    const row = entry.row;
    rows.push({
      keyword: row.keyword,
      type: "gap",
      typeLabel: OPPORTUNITY_TYPES.gap.label,
      typeHint: OPPORTUNITY_TYPES.gap.hint,
      position: null,
      url: null,
      volume: row.volume ?? null,
      difficulty: row.difficulty ?? null,
      effort: effortOf(row.difficulty),
      cpc: row.cpc ?? null,
      cpcFormatted: row.cpcFormatted || null,
      traffic: null,
      trendDirection: row.trendDirection || null,
      intents: row.intents || [],
      rivalCount: entry.domains.size,
      rivalBestPosition: entry.bestPosition,
      rivalDomains: [...entry.domains],
      score: scoreRow({
        volume: row.volume,
        difficulty: row.difficulty,
        cpc: row.cpc,
        type: "gap",
        rivalCount: entry.domains.size,
      }),
    });
  }

  rows.sort((a, b) => b.score - a.score || (b.volume ?? 0) - (a.volume ?? 0));

  const count = (t) => rows.filter((r) => r.type === t).length;
  const summary = {
    total: rows.length,
    quickWins: count("quick-win"),
    striking: count("striking"),
    gaps: count("gap"),
    defend: count("defend"),
    ranking: own.length,
    rivalsAnalysed: rivalKeywordSets.filter((s) => s.keywords.length).length,
    // The prize if the top opportunities landed — deliberately labelled as an
    // estimate in the UI, since it assumes a top-3 finish.
    topScore: rows[0]?.score ?? 0,
  };

  const notes = [];
  if (!own.length) {
    notes.push(
      `No ranking keywords were returned for ${domain}. It may be too new or too small to be indexed in the keyword database — gaps from competitors are still shown.`
    );
  }
  if (!competitors.length) {
    notes.push("No competitors were returned, so this run contains no gap keywords.");
  }

  return {
    domain,
    rows: rows.slice(0, 500),
    competitors: rivalKeywordSets.map((s, i) => ({
      domain: s.domain,
      keywordsFound: s.keywords.length,
      commonKeywords: competitors[i]?.commonKeywords ?? null,
      traffic: competitors[i]?.traffic ?? null,
    })),
    summary,
    notes,
  };
}

function emptySummary() {
  return {
    total: 0,
    quickWins: 0,
    striking: 0,
    gaps: 0,
    defend: 0,
    ranking: 0,
    rivalsAnalysed: 0,
    topScore: 0,
  };
}

/** Cached entry point. Each domain has its own bucket, so any domain works. */
export async function getKeywordOpportunities(domainInput, opts = {}, { force = false } = {}) {
  const { rivals = 5 } = opts;
  const domain = cleanHost(domainInput);
  const sourceKey = cacheKey(domain, rivals);

  if (!force) {
    try {
      const cached = await getCachedSnapshot(domain, DATA_TYPES.KEYWORD_OPPORTUNITIES, sourceKey);
      if (cached?.payload && !cached.expired) {
        return { ...cached.payload, cached: true, fetchedAt: cached.fetchedAt };
      }
    } catch {
      /* best-effort */
    }
  }

  const data = await buildKeywordOpportunities(domainInput, { rivals });

  try {
    await saveSnapshot({
      siteUrl: domain,
      dataType: DATA_TYPES.KEYWORD_OPPORTUNITIES,
      sourceKey,
      payload: data,
      creditsSpent: 0,
    });
  } catch {
    /* best-effort */
  }

  return { ...data, cached: false, fetchedAt: new Date() };
}
