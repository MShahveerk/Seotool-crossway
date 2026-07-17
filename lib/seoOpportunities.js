/**
 * Derive actionable SEO opportunity lists from Search Console data.
 */
import {
  getTopQueries,
  getTopPages,
  getQueryPageMatrix,
  getStrikingDistanceQueries,
  getDeviceBreakdown,
  getSitemaps,
} from "./searchconsole.js";
import {
  getDateRangeForPresetId,
  previousBlockEqualLength,
  clampSearchConsoleQueryRange,
} from "./searchConsoleDateRanges.js";
import {
  buildCannibalization,
  buildDecayList,
  buildDeviceGaps,
  buildSitemapWarnings,
} from "./seoOpportunityHelpers.js";

export {
  buildCannibalization,
  buildDecayList,
  buildDeviceGaps,
  buildSitemapWarnings,
} from "./seoOpportunityHelpers.js";

/**
 * Full opportunity pack for a site + range preset (default 28d).
 */
export async function buildSeoOpportunityPack(siteUrl, range = "28d") {
  let { startDate, endDate } = getDateRangeForPresetId(range);
  ({ startDate, endDate } = clampSearchConsoleQueryRange(startDate, endDate));
  const prev = previousBlockEqualLength(startDate, endDate);
  const prevClamped = clampSearchConsoleQueryRange(prev.startDate, prev.endDate);

  const [
    striking,
    matrix,
    devices,
    sitemaps,
    currQueries,
    prevQueries,
    currPages,
    prevPages,
  ] = await Promise.all([
    getStrikingDistanceQueries(siteUrl, startDate, endDate, 80).catch(() => ({ opportunities: [] })),
    getQueryPageMatrix(siteUrl, startDate, endDate, 500).catch(() => ({ pairs: [] })),
    getDeviceBreakdown(siteUrl, startDate, endDate).catch(() => ({ devices: [] })),
    getSitemaps(siteUrl).catch(() => ({ sitemaps: [] })),
    getTopQueries(siteUrl, startDate, endDate, 500).catch(() => ({ queries: [] })),
    getTopQueries(siteUrl, prevClamped.startDate, prevClamped.endDate, 500).catch(() => ({ queries: [] })),
    getTopPages(siteUrl, startDate, endDate, 500).catch(() => ({ pages: [] })),
    getTopPages(siteUrl, prevClamped.startDate, prevClamped.endDate, 500).catch(() => ({ pages: [] })),
  ]);

  const cannibalization = buildCannibalization(matrix.pairs || [], 40);
  const decayingQueries = buildDecayList(currQueries.queries, prevQueries.queries, {
    keyField: "query",
    limit: 40,
  });
  const decayingPages = buildDecayList(currPages.pages, prevPages.pages, {
    keyField: "page",
    limit: 40,
  });
  const deviceGaps = buildDeviceGaps(devices.devices || []);
  const sitemapWarnings = buildSitemapWarnings(sitemaps.sitemaps || []);

  const taskCount =
    (striking.opportunities || []).length +
    cannibalization.length +
    decayingQueries.length +
    decayingPages.length +
    (deviceGaps.gaps || []).length +
    sitemapWarnings.length;

  return {
    siteUrl,
    dateRange: { startDate, endDate, range },
    compareDateRange: {
      startDate: prevClamped.startDate,
      endDate: prevClamped.endDate,
    },
    strikingDistance: striking.opportunities || [],
    cannibalization,
    decayingQueries,
    decayingPages,
    deviceGaps,
    sitemapWarnings,
    sitemaps: sitemaps.sitemaps || [],
    devices: devices.devices || [],
    taskCount,
    generatedAt: new Date().toISOString(),
  };
}
