/**
 * Domain authority via Open PageRank (free, Common Crawl based, 0-10 scale).
 * Scores are cached daily in authority_snapshots for trends and instant loads.
 * Requires OPENPAGERANK_API_KEY (free at domcop.com/openpagerank — 1,000 req/day).
 */
import prisma from "./prisma.js";
import { listWebsiteUrls } from "./seoJobs.js";

const OPR_ENDPOINT = "https://openpagerank.com/api/v1.0/getPageRank";
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

/** Raw Open PageRank lookup for up to 100 domains. */
export async function fetchOpenPageRank(domains) {
  const apiKey = process.env.OPENPAGERANK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "OPENPAGERANK_API_KEY is not set. Get a free key at domcop.com/openpagerank (1,000 requests/day) and add it to your environment."
    );
  }
  const list = [...new Set(domains)].slice(0, MAX_DOMAINS_PER_REQUEST);
  const qs = list.map((d, i) => `domains%5B${i}%5D=${encodeURIComponent(d)}`).join("&");

  const res = await fetch(`${OPR_ENDPOINT}?${qs}`, { headers: { "API-OPR": apiKey } });
  if (!res.ok) {
    throw new Error(`Open PageRank API error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();

  const out = new Map();
  for (const row of data?.response || []) {
    const domain = String(row.domain || "").toLowerCase();
    const ok = row.status_code === 200;
    out.set(domain, {
      domain,
      score: ok && row.page_rank_decimal != null ? Number(row.page_rank_decimal) : null,
      globalRank: ok && row.rank ? Number(row.rank) : null,
      found: ok,
    });
  }
  return out;
}

/** Persist today's score rows (upsert per domain+day). */
async function storeScores(scores) {
  const fetchedDate = todayDate();
  for (const s of scores.values()) {
    await prisma.authoritySnapshot.upsert({
      where: { domain_fetchedDate: { domain: s.domain, fetchedDate } },
      create: { domain: s.domain, score: s.score, globalRank: s.globalRank, fetchedDate },
      update: { score: s.score, globalRank: s.globalRank },
    });
  }
}

/**
 * Scores for a list of domains — served from today's cache when available,
 * fetched live (and cached) otherwise.
 */
export async function getAuthorityScores(domains) {
  const clean = [...new Set(domains.map(toDomain).filter(Boolean))];
  if (!clean.length) return new Map();

  const fetchedDate = todayDate();
  const cached = await prisma.authoritySnapshot.findMany({
    where: { domain: { in: clean }, fetchedDate },
  });
  const out = new Map(cached.map((c) => [c.domain, { domain: c.domain, score: c.score, globalRank: c.globalRank, found: c.score != null }]));

  const missing = clean.filter((d) => !out.has(d));
  if (missing.length && isAuthorityConfigured()) {
    const live = await fetchOpenPageRank(missing);
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

/** Cron entry: refresh scores for every known website (one batched call). */
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
      const scores = await fetchOpenPageRank(batch);
      await storeScores(scores);
      refreshed += scores.size;
    } catch (err) {
      logger.error(`Authority refresh batch failed: ${err.message}`);
    }
  }
  logger.info(`Authority scores refreshed for ${refreshed} domains.`);
  return { refreshed, skipped: false };
}
