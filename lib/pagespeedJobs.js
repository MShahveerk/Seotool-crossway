/**
 * PageSpeed snapshot jobs: background refresh every 2 hours for all known
 * websites (both strategies), plus cache read/refresh helpers for the API.
 */
import prisma from "./prisma.js";
import { getPageSpeedFullReport } from "./pagespeed.js";
import { listWebsiteUrls } from "./seoJobs.js";

export const PAGESPEED_STRATEGIES = ["mobile", "desktop"];
export const SNAPSHOT_TTL_MS = 2 * 60 * 60 * 1000; // matches the cron cadence

const DELAY_BETWEEN_RUNS_MS = 3000; // be gentle with API quota

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch a fresh report and upsert the snapshot.
 * On failure, keeps the previous payload and records the error.
 */
export async function refreshPageSpeedSnapshot(siteUrl, strategy = "mobile") {
  try {
    const payload = await getPageSpeedFullReport(siteUrl, strategy);
    const now = new Date();
    return await prisma.pageSpeedSnapshot.upsert({
      where: { siteUrl_strategy: { siteUrl, strategy } },
      create: { siteUrl, strategy, status: "success", payload, errorMessage: null, fetchedAt: now },
      update: { status: "success", payload, errorMessage: null, fetchedAt: now },
    });
  } catch (err) {
    const message = err?.message || "PageSpeed fetch failed";
    // Preserve the last good payload/fetchedAt so the UI can keep showing it
    const existing = await prisma.pageSpeedSnapshot.findUnique({
      where: { siteUrl_strategy: { siteUrl, strategy } },
    });
    if (existing) {
      await prisma.pageSpeedSnapshot.update({
        where: { siteUrl_strategy: { siteUrl, strategy } },
        data: { status: "error", errorMessage: message },
      });
      return { ...existing, status: "error", errorMessage: message };
    }
    await prisma.pageSpeedSnapshot.create({
      data: { siteUrl, strategy, status: "error", payload: undefined, errorMessage: message },
    });
    throw err;
  }
}

/**
 * Read the cached snapshot. When missing (first visit) fetches live.
 * When `forceRefresh` is set, fetches live regardless of cache age.
 */
export async function getPageSpeedSnapshot(siteUrl, strategy = "mobile", { forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cached = await prisma.pageSpeedSnapshot.findUnique({
      where: { siteUrl_strategy: { siteUrl, strategy } },
    });
    if (cached?.payload) {
      return {
        snapshot: cached,
        stale: Date.now() - new Date(cached.fetchedAt).getTime() > SNAPSHOT_TTL_MS,
        fromCache: true,
      };
    }
  }
  const snapshot = await refreshPageSpeedSnapshot(siteUrl, strategy);
  if (!snapshot?.payload) {
    throw new Error(snapshot?.errorMessage || "PageSpeed fetch failed");
  }
  return { snapshot, stale: false, fromCache: false };
}

/**
 * Cron entry: refresh mobile + desktop snapshots for every known website.
 */
export async function runPageSpeedRefreshAll(logger = console) {
  if (!process.env.PAGESPEED_API_KEY?.trim()) {
    logger.info("PageSpeed refresh skipped: PAGESPEED_API_KEY is not set.");
    return { refreshed: 0, failed: 0, skipped: true };
  }

  const urls = await listWebsiteUrls();
  let refreshed = 0;
  let failed = 0;

  for (const url of urls) {
    for (const strategy of PAGESPEED_STRATEGIES) {
      try {
        await refreshPageSpeedSnapshot(url, strategy);
        refreshed += 1;
        logger.info(`PageSpeed snapshot refreshed: ${url} [${strategy}]`);
      } catch (err) {
        failed += 1;
        logger.error(`PageSpeed snapshot failed: ${url} [${strategy}] — ${err.message}`);
      }
      await sleep(DELAY_BETWEEN_RUNS_MS);
    }
  }

  logger.info(`PageSpeed refresh complete. ok=${refreshed} failed=${failed} sites=${urls.length}`);
  return { refreshed, failed, skipped: false };
}
