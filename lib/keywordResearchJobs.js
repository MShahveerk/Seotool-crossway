/**
 * Weekly Keyword Planner enrichment for all known websites (top GSC queries).
 */
import { listWebsiteUrls } from "./seoJobs.js";
import { isGoogleAdsConfigured } from "./googleAds.js";
import { getHistoricalMetricsForSite, resolveGeoTarget } from "./keywordPlanner.js";
import {
  getTopQueries,
} from "./searchconsole.js";
import {
  getDateRangeForPresetId,
  clampSearchConsoleQueryRange,
} from "./searchConsoleDateRanges.js";

const DELAY_MS = 1200;
const QUERY_LIMIT = 200;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runKeywordPlannerRefreshAll(logger = console, geoKey = "us") {
  if (!isGoogleAdsConfigured()) {
    logger.info("Keyword Planner refresh skipped: Google Ads API is not configured.");
    return { refreshed: 0, skipped: true };
  }

  const geo = resolveGeoTarget(geoKey);
  let { startDate, endDate } = getDateRangeForPresetId("28d");
  ({ startDate, endDate } = clampSearchConsoleQueryRange(startDate, endDate));

  const urls = await listWebsiteUrls();
  let refreshed = 0;
  let failed = 0;

  for (const siteUrl of urls) {
    try {
      const { queries } = await getTopQueries(siteUrl, startDate, endDate, QUERY_LIMIT).catch(() => ({
        queries: [],
      }));
      const keywords = (queries || []).map((q) => q.query).filter(Boolean);
      if (!keywords.length) {
        logger.info(`Keyword Planner skip (no GSC queries): ${siteUrl}`);
        continue;
      }

      await getHistoricalMetricsForSite(siteUrl, keywords, {
        geoTargetId: geo.id,
        forceRefresh: true,
      });
      refreshed += 1;
      logger.info(`Keyword Planner metrics refreshed: ${siteUrl} (${keywords.length} keywords)`);
    } catch (err) {
      failed += 1;
      logger.error(`Keyword Planner refresh failed: ${siteUrl} — ${err.message}`);
    }
    await sleep(DELAY_MS);
  }

  logger.info(`Keyword Planner refresh complete. ok=${refreshed} failed=${failed} sites=${urls.length}`);
  return { refreshed, failed, skipped: false };
}
