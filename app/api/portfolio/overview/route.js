import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import prisma from "../../../../lib/prisma";
import { hasGlobalSiteAccess } from "../../../../lib/modulePermissions";
import { loadPortfolioSerankingHealth } from "../../../../lib/serankingHealth";
import { getSearchAnalyticsTimeSeries } from "../../../../lib/searchconsole";
import {
  clampSearchConsoleQueryRange,
  getDateRangeForPresetId,
  previousBlockEqualLength,
} from "../../../../lib/searchConsoleDateRanges";

export const runtime = "nodejs";

/**
 * GET /api/portfolio/overview
 * Agency-wide metrics for the project cards:
 *   - pending blog + post approvals, keyed by siteLink (the amber alert)
 *   - total blog + post volume per siteLink (unambiguous content count)
 *   - blog + post volume published in the last 30 days (recent momentum)
 *   - SE Ranking audit health and URL-inspection coverage per site
 *   - 30 days of daily follower counts per site+platform (reach + sparkline)
 *   - 28 days of daily Search Console clicks per website (the headline number)
 * The client matches these to each project's site equivalents.
 *
 * Everything from our own database is grouped or `distinct`, never a per-project
 * fan-out, so portfolio size doesn't multiply round trips. Search Console is the
 * one exception — it has no bulk endpoint, so it fans out under a concurrency cap
 * and behind a short server-side cache.
 *
 * Authority and referring domains are deliberately absent: they were removed
 * from the portfolio surface and the per-project dashboard sources its own from
 * /api/dashboard/snapshot, so those queries aren't run for nobody.
 */
const TREND_DAYS = 30;
/** Search Console tolerates parallel queries poorly; keep the fan-out narrow. */
const GSC_CONCURRENCY = 4;
const GSC_CACHE_MS = 15 * 60 * 1000;

/* Clicks change once a day at best, but the portfolio is the landing page and
   gets reloaded constantly. Cache per process so a refresh is free. */
const gscCache = new Map();

function cachedClicks(siteUrl) {
  const hit = gscCache.get(siteUrl);
  if (hit && Date.now() - hit.at < GSC_CACHE_MS) return hit.value;
  return undefined;
}

async function loadClicksForSite(siteUrl, range, prevRange) {
  const cached = cachedClicks(siteUrl);
  if (cached !== undefined) return cached;

  try {
    const [current, previous] = await Promise.all([
      getSearchAnalyticsTimeSeries(siteUrl, range.startDate, range.endDate),
      getSearchAnalyticsTimeSeries(siteUrl, prevRange.startDate, prevRange.endDate).catch(
        () => null
      ),
    ]);
    const clicks = Number(current?.totals?.clicks) || 0;
    const impressions = Number(current?.totals?.impressions) || 0;
    // A site with no clicks at all carries no signal worth a card row.
    if (!clicks && !impressions) {
      gscCache.set(siteUrl, { at: Date.now(), value: null });
      return null;
    }
    const value = {
      siteLink: siteUrl,
      clicks,
      impressions,
      prevClicks: previous ? Number(previous.totals?.clicks) || 0 : null,
      series: (current?.timeSeries || []).map((d) => ({
        date: d.date,
        clicks: Number(d.clicks) || 0,
      })),
    };
    gscCache.set(siteUrl, { at: Date.now(), value });
    return value;
  } catch {
    // An unverified property or a revoked token must not take the page down.
    gscCache.set(siteUrl, { at: Date.now(), value: null });
    return null;
  }
}

/** Daily clicks per website, fanned out a few at a time. */
async function loadPortfolioClicks() {
  const sites = await prisma.site
    .findMany({ select: { siteUrl: true } })
    .catch(() => []);
  const targets = sites
    .map((s) => s.siteUrl)
    .filter((url) => url && (String(url).startsWith("http") || String(url).startsWith("sc-domain:")));
  if (targets.length === 0) return [];

  let { startDate, endDate } = getDateRangeForPresetId("28d");
  ({ startDate, endDate } = clampSearchConsoleQueryRange(startDate, endDate));
  const prev = previousBlockEqualLength(startDate, endDate);
  const prevRange = clampSearchConsoleQueryRange(prev.startDate, prev.endDate);
  const range = { startDate, endDate };

  const out = [];
  for (let i = 0; i < targets.length; i += GSC_CONCURRENCY) {
    const batch = targets.slice(i, i + GSC_CONCURRENCY);
    const results = await Promise.all(
      batch.map((url) => loadClicksForSite(url, range, prevRange))
    );
    for (const row of results) if (row) out.push(row);
  }
  return out;
}

export async function GET() {
  const empty = {
    posts: [],
    blogs: [],
    totalPosts: [],
    totalBlogs: [],
    followers: [],
    recentPosts: [],
    recentBlogs: [],
    health: [],
    indexed: [],
    followerSeries: [],
    clicks: [],
  };

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasGlobalSiteAccess(session.user)) {
      return Response.json(empty, { status: 200 });
    }

    const pendingWhere = {
      status: { in: ["pending", "edited"] },
      hiddenFromAssignee: false,
    };

    const since = new Date();
    since.setDate(since.getDate() - TREND_DAYS);
    const publishedWhere = { publishStatus: "publish", updatedAt: { gte: since } };

    const [
      posts,
      blogs,
      allPosts,
      allBlogs,
      followerRows,
      recentPosts,
      recentBlogs,
      healthRows,
      inspectionRows,
      seriesRows,
      clickRows,
    ] = await Promise.all([
      prisma.approval.groupBy({ by: ["siteLink"], where: pendingWhere, _count: { _all: true } }),
      prisma.blogPost.groupBy({ by: ["siteLink"], where: pendingWhere, _count: { _all: true } }),
      prisma.approval.groupBy({ by: ["siteLink"], _count: { _all: true } }),
      prisma.blogPost.groupBy({ by: ["siteLink"], _count: { _all: true } }),
      prisma.socialMediaDailyStat.findMany({
        where: { followers: { gt: 0 } },
        orderBy: [{ siteLink: "asc" }, { platform: "asc" }, { statDate: "desc" }],
        distinct: ["siteLink", "platform"],
        select: { siteLink: true, platform: true, followers: true },
      }),
      prisma.approval.groupBy({ by: ["siteLink"], where: publishedWhere, _count: { _all: true } }),
      prisma.blogPost.groupBy({ by: ["siteLink"], where: publishedWhere, _count: { _all: true } }),
      // SE Ranking is the only audit source anyone sees, here included — our own
      // crawler must never produce a second, different health score for a site.
      loadPortfolioSerankingHealth().catch(() => []),
      prisma.urlInspectionSnapshot.findMany({
        where: { totalUrls: { gt: 0 } },
        orderBy: [{ siteUrl: "asc" }, { runDate: "desc" }],
        distinct: ["siteUrl"],
        select: { siteUrl: true, indexedCount: true, totalUrls: true, runDate: true },
      }),
      // Daily reach per platform for the card sparklines. Grouped, so it's one
      // query no matter how many projects are on the books.
      prisma.socialMediaDailyStat.groupBy({
        by: ["siteLink", "statDate", "platform"],
        where: { statDate: { gte: since }, followers: { gt: 0 } },
        _max: { followers: true },
      }),
      loadPortfolioClicks().catch(() => []),
    ]);

    const shape = (rows) =>
      rows
        .filter((r) => r.siteLink)
        .map((r) => ({ siteLink: r.siteLink, count: r._count?._all || 0 }));

    // One row per site+platform (latest non-zero). The client dedupes per
    // platform across a client's identifiers so followers are never counted
    // twice when Meta wrote the same platform under both a URL and a page id.
    const followers = followerRows
      .filter((r) => r.siteLink)
      .map((r) => ({ siteLink: r.siteLink, platform: r.platform, count: r.followers || 0 }));

    return Response.json(
      {
        posts: shape(posts),
        blogs: shape(blogs),
        totalPosts: shape(allPosts),
        totalBlogs: shape(allBlogs),
        recentPosts: shape(recentPosts),
        recentBlogs: shape(recentBlogs),
        followers,
        health: healthRows,
        clicks: clickRows,
        indexed: inspectionRows.map((r) => ({
          siteLink: r.siteUrl,
          indexed: r.indexedCount || 0,
          total: r.totalUrls || 0,
          at: r.runDate,
        })),
        followerSeries: seriesRows
          .filter((r) => r.siteLink && r.statDate)
          .map((r) => ({
            siteLink: r.siteLink,
            platform: r.platform,
            date: r.statDate,
            count: r._max?.followers || 0,
          })),
      },
      { status: 200, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return Response.json(
      { error: error?.message || "Failed to load portfolio overview.", ...empty },
      { status: 500 }
    );
  }
}
