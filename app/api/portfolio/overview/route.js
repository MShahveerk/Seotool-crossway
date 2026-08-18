import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import prisma from "../../../../lib/prisma";
import { hasGlobalSiteAccess } from "../../../../lib/modulePermissions";

export const runtime = "nodejs";

/**
 * GET /api/portfolio/overview
 * Agency-wide metrics for the project cards. Every query is grouped or
 * `distinct` — never a per-project fan-out, so this stays one round trip
 * regardless of portfolio size:
 *   - pending blog + post approvals, keyed by siteLink (the amber alert)
 *   - total blog + post volume per siteLink (unambiguous content count)
 *   - blog + post volume published in the last 30 days (recent momentum)
 *   - latest site audit health score and URL-inspection coverage per site
 *   - 30 days of daily follower counts per site+platform (reach + sparkline)
 * The client matches these to each project's site equivalents.
 *
 * Authority and referring domains are deliberately absent: they were removed
 * from the portfolio surface and the per-project dashboard sources its own from
 * /api/dashboard/snapshot, so those queries aren't run for nobody.
 */
const TREND_DAYS = 30;

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
      auditRows,
      inspectionRows,
      seriesRows,
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
      // Latest finished crawl per site — `distinct` after ordering gives us the
      // newest row per siteUrl without a correlated subquery per project.
      prisma.siteAuditSnapshot.findMany({
        where: { healthScore: { not: null } },
        orderBy: [{ siteUrl: "asc" }, { startedAt: "desc" }],
        distinct: ["siteUrl"],
        select: { siteUrl: true, healthScore: true, criticalCount: true, startedAt: true },
      }),
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
        health: auditRows.map((r) => ({
          siteLink: r.siteUrl,
          score: r.healthScore,
          critical: r.criticalCount || 0,
          at: r.startedAt,
        })),
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
