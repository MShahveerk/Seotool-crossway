/**
 * SE Ranking Site Explorer — 7-day cache + weekly cron refresh for explored domains.
 */
import prisma from "../prisma.js";
import { listWebsiteUrls } from "../seoJobs.js";
import { getCachedSnapshot } from "./cache.js";
import { CREDIT_ESTIMATES, DATA_TYPES, isSerankingConfigured } from "./config.js";
import { resolveSerankingTarget } from "./resolveTarget.js";

export const SERANKING_EXPLORER_CACHE_TTL_DAYS = 7;
export const SERANKING_EXPLORER_CACHE_TTL_MS = SERANKING_EXPLORER_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
export const SERANKING_EXPLORER_CRON = "30 5 * * 1";

const EXPLORE_COST =
  CREDIT_ESTIMATES.domain_overview + CREDIT_ESTIMATES.domain_pages + CREDIT_ESTIMATES.backlinks_summary;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function isSerankingExplorerStale(fetchedAt) {
  if (!fetchedAt) return true;
  return Date.now() - new Date(fetchedAt).getTime() >= SERANKING_EXPLORER_CACHE_TTL_MS;
}

export function explorerCacheExpiresAt(fetchedAt) {
  if (!fetchedAt) return null;
  return new Date(new Date(fetchedAt).getTime() + SERANKING_EXPLORER_CACHE_TTL_MS);
}

/** Build cache metadata from overview / pages / backlinks snapshot reads. */
export function buildExplorerCacheMeta(parts = []) {
  const fetchedAts = parts.map((p) => p?.fetchedAt).filter(Boolean);
  const oldestFetch = fetchedAts.length
    ? new Date(Math.min(...fetchedAts.map((d) => new Date(d).getTime())))
    : null;

  const fromCache = parts.length > 0 && parts.every((p) => p?.fromCache);
  const stale = isSerankingExplorerStale(oldestFetch);

  return {
    fromCache,
    fetchedAt: oldestFetch?.toISOString?.() ?? oldestFetch ?? null,
    cacheExpiresAt: explorerCacheExpiresAt(oldestFetch)?.toISOString?.() ?? null,
    stale,
    cacheTtlDays: SERANKING_EXPLORER_CACHE_TTL_DAYS,
    cacheSchedule: "weekly",
  };
}

/** Domains with explorer cache rows + all known client websites. */
export async function listSerankingExplorerTargets() {
  const byDomain = new Map();

  const rows = await prisma.serankingSnapshot.findMany({
    where: { siteUrl: { startsWith: "__seranking_target__:" } },
    distinct: ["siteUrl"],
    select: { siteUrl: true },
  });
  for (const row of rows) {
    const domain = row.siteUrl.replace("__seranking_target__:", "");
    if (domain) byDomain.set(domain, row.siteUrl);
  }

  const urls = await listWebsiteUrls();
  for (const url of urls) {
    try {
      const { domain, cacheSite } = resolveSerankingTarget(url);
      if (domain && cacheSite) byDomain.set(domain, cacheSite);
    } catch {
      /* skip invalid URLs */
    }
  }

  return [...byDomain.entries()].map(([domain, cacheSite]) => ({ domain, cacheSite }));
}

/** Weekly cron: refresh stale SE Ranking explorer snapshots (overview + pages + backlinks). */
export async function runSerankingExplorerWeeklyRefresh(logger = console) {
  if (!isSerankingConfigured()) {
    logger.info("SE Ranking explorer refresh skipped: SERANKING_API_KEY not set.");
    return { skipped: true };
  }

  const weeklyCap = Number(process.env.SERANKING_EXPLORER_WEEKLY_CREDIT_CAP || 2400);
  const { loadExplorer } = await import("./loadBundle.js");
  const targets = await listSerankingExplorerTargets();

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  let spent = 0;

  for (const { domain, cacheSite } of targets) {
    if (spent + EXPLORE_COST > weeklyCap) {
      logger.info(`SE Ranking explorer weekly cap reached (${weeklyCap} credits).`);
      break;
    }

    const overview = await getCachedSnapshot(cacheSite, DATA_TYPES.DOMAIN_OVERVIEW);
    if (overview?.fetchedAt && !isSerankingExplorerStale(overview.fetchedAt)) {
      skipped += 1;
      continue;
    }

    try {
      const result = await loadExplorer(domain, { allowManual: false, force: true, autostartAudit: false });
      spent += result.creditsSpent || EXPLORE_COST;
      ok += 1;
      logger.info(`SE Ranking explorer cached: ${domain} (${result.creditsSpent || 0} credits)`);
    } catch (err) {
      failed += 1;
      logger.error(`SE Ranking explorer refresh failed: ${domain} — ${err.message}`);
    }

    await sleep(2000);
  }

  logger.info(
    `SE Ranking explorer weekly done. ok=${ok} skipped=${skipped} failed=${failed} spent=${spent} targets=${targets.length}`
  );
  return { ok, skipped, failed, spent, total: targets.length };
}
