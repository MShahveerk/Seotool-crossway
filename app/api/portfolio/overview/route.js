import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import prisma from "../../../../lib/prisma";
import { hasGlobalSiteAccess } from "../../../../lib/modulePermissions";

export const runtime = "nodejs";

/**
 * GET /api/portfolio/overview
 * Lightweight, agency-wide metrics + alert counts for the portfolio
 * constellation. All grouped/distinct queries (no per-client fan-out):
 *   - pending blog + post approvals, keyed by siteLink (the amber alert)
 *   - total blog + post volume per siteLink (unambiguous content count)
 *   - latest non-zero follower count per site+platform (social reach)
 * The client matches these to each node's site equivalents.
 *
 * Authority and referring domains used to be served here for the metric HUD.
 * The HUD no longer shows them, and the per-client dashboard sources its own
 * from /api/dashboard/snapshot, so the backlink/authority/explorer queries are
 * gone rather than left running for nobody.
 */
export async function GET() {
  const empty = { posts: [], blogs: [], totalPosts: [], totalBlogs: [], followers: [] };

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

    const [posts, blogs, allPosts, allBlogs, followerRows] = await Promise.all([
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
        followers,
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
