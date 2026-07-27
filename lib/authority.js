/**
 * Domain authority via Open PageRank (Keywords Everywhere API, Common Crawl based, 0–10).
 * Scores are cached in authority_snapshots for trends and instant loads.
 * Requires OPENPAGERANK_API_KEY — Bearer token from the Keywords Everywhere OPR dashboard
 * (starts with opr_live_…).
 */
import prisma from "./prisma.js";
import { listWebsiteUrls } from "./seoJobs.js";

const OPR_BASE = "https://openpagerank.keywordseverywhere.com";
const OPR_BULK = `${OPR_BASE}/v1/domains/bulk`;
const MAX_DOMAINS_PER_REQUEST = 100;

export function isAuthorityConfigured() {
  return Boolean(process.env.OPENPAGERANK_API_KEY?.trim());
}

export function toDomain(input) {
  const raw = String(input || "").trim().toLowerCase();
  if (!raw) return null;
  try {
    const host = raw.startsWith("http") ? new URL(raw).hostname : new URL(`https://${raw}`).hostname;
    const domain = host.replace(/^www\./, "");
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : null;
  } catch {
    return null;
  }
}

function todayDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function historyToDate(isoDate) {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function parseOprError(res) {
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    const msg = data?.error?.message || data?.error?.type;
    if (msg) return `${res.status}: ${msg}`;
  } catch {
    /* not JSON */
  }
  return `${res.status}: ${text.slice(0, 200)}`;
}

/**
 * Bulk lookup — POST /v1/domains/bulk (up to 100 domains).
 * @param {string[]} domains
 * @param {{ includeHistory?: boolean }} opts
 */
export async function fetchOpenPageRank(domains, { includeHistory = false } = {}) {
  const apiKey = process.env.OPENPAGERANK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "OPENPAGERANK_API_KEY is not set. Create a Bearer key (opr_live_…) on the Open PageRank dashboard at keywordseverywhere.com and add it to your environment."
    );
  }

  const list = [...new Set(domains.map(toDomain).filter(Boolean))].slice(0, MAX_DOMAINS_PER_REQUEST);
  if (!list.length) return new Map();

  const res = await fetch(OPR_BULK, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ domains: list, include_history: Boolean(includeHistory) }),
  });

  if (!res.ok) {
    throw new Error(`Open PageRank API error ${await parseOprError(res)}`);
  }

  const data = await res.json();
  const out = new Map();

  for (const row of data?.results || []) {
    const domain = String(row.domain || "").toLowerCase();
    out.set(domain, {
      domain,
      score: row.found && row.open_page_rank != null ? Number(row.open_page_rank) : null,
      globalRank: row.found && row.rank != null ? Number(row.rank) : null,
      referringDomains: row.referring_domains != null ? Number(row.referring_domains) : null,
      found: Boolean(row.found),
      history: Array.isArray(row.history) ? row.history : [],
    });
  }

  // Domains requested but absent from results → not in index
  for (const d of list) {
    if (!out.has(d)) {
      out.set(d, { domain: d, score: null, globalRank: null, referringDomains: null, found: false, history: [] });
    }
  }

  return out;
}

/** Persist current scores + optional monthly history from the API. */
async function storeScores(scores) {
  const fetchedDate = todayDate();

  for (const s of scores.values()) {
    await prisma.authoritySnapshot.upsert({
      where: { domain_fetchedDate: { domain: s.domain, fetchedDate } },
      create: {
        domain: s.domain,
        score: s.score,
        globalRank: s.globalRank,
        referringDomains: s.referringDomains,
        fetchedDate,
      },
      update: { score: s.score, globalRank: s.globalRank, referringDomains: s.referringDomains },
    });

    for (const point of s.history || []) {
      if (point.open_page_rank == null) continue;
      const pointDate = historyToDate(point.date);
      if (!pointDate) continue;
      await prisma.authoritySnapshot.upsert({
        where: { domain_fetchedDate: { domain: s.domain, fetchedDate: pointDate } },
        create: { domain: s.domain, score: Number(point.open_page_rank), globalRank: null, fetchedDate: pointDate },
        update: { score: Number(point.open_page_rank) },
      });
    }
  }
}

/**
 * Scores for a list of domains — served from today's cache when available,
 * fetched live (and cached, with history backfill) otherwise.
 */
export async function getAuthorityScores(domains) {
  const clean = [...new Set(domains.map(toDomain).filter(Boolean))];
  if (!clean.length) return new Map();

  const fetchedDate = todayDate();
  const cached = await prisma.authoritySnapshot.findMany({
    where: { domain: { in: clean }, fetchedDate },
  });
  const out = new Map(
    cached.map((c) => [
      c.domain,
      {
        domain: c.domain,
        score: c.score,
        globalRank: c.globalRank,
        referringDomains: c.referringDomains,
        found: c.score != null,
      },
    ])
  );

  const missing = clean.filter((d) => !out.has(d));
  if (missing.length && isAuthorityConfigured()) {
    const live = await fetchOpenPageRank(missing, { includeHistory: true });
    await storeScores(live);
    for (const [domain, row] of live) out.set(domain, row);
  }
  return out;
}

/** Daily history for one domain (for the trend chart). */
export async function getAuthorityTrend(domain, days = 90) {
  const d = toDomain(domain);
  if (!d) return [];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return prisma.authoritySnapshot.findMany({
    where: { domain: d, fetchedDate: { gte: since } },
    orderBy: { fetchedDate: "asc" },
    select: { fetchedDate: true, score: true, globalRank: true },
  });
}

/** Cron entry: refresh scores for every known website (batched POST requests). */
export async function runAuthorityRefreshAll(logger = console) {
  if (!isAuthorityConfigured()) {
    logger.info("Authority refresh skipped: OPENPAGERANK_API_KEY is not set.");
    return { refreshed: 0, skipped: true };
  }
  const urls = await listWebsiteUrls();
  const domains = [...new Set(urls.map(toDomain).filter(Boolean))];
  if (!domains.length) return { refreshed: 0, skipped: false };

  let refreshed = 0;
  for (let i = 0; i < domains.length; i += MAX_DOMAINS_PER_REQUEST) {
    const batch = domains.slice(i, i + MAX_DOMAINS_PER_REQUEST);
    try {
      const scores = await fetchOpenPageRank(batch, { includeHistory: false });
      await storeScores(scores);
      refreshed += scores.size;
    } catch (err) {
      logger.error(`Authority refresh batch failed: ${err.message}`);
    }
  }
  logger.info(`Authority scores refreshed for ${refreshed} domains.`);
  return { refreshed, skipped: false };
}
