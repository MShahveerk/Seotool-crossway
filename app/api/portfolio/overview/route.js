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
 *   - published blog + post volume, keyed by siteLink (produced content)
 *   - latest authority snapshot per domain (score + referring domains)
 *   - latest non-zero follower count per site+platform (social reach)
 * The client matches these to each node's site equivalents.
 */
const LIVE = ["approved", "scheduled", "published", "posted"];

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasGlobalSiteAccess(session.user)) {
      return Response.json(
        { posts: [], blogs: [], publishedPosts: [], publishedBlogs: [], authority: [], followers: [] },
        { status: 200 }
      );
    }

    const pendingWhere = {
      status: { in: ["pending", "edited"] },
      hiddenFromAssignee: false,
    };

    const [posts, blogs, pubPosts, pubBlogs, authRows, followerRows] = await Promise.all([
      prisma.approval.groupBy({ by: ["siteLink"], where: pendingWhere, _count: { _all: true } }),
      prisma.blogPost.groupBy({ by: ["siteLink"], where: pendingWhere, _count: { _all: true } }),
      prisma.approval.groupBy({
        by: ["siteLink"],
        where: { status: { in: LIVE } },
        _count: { _all: true },
      }),
      prisma.blogPost.groupBy({
        by: ["siteLink"],
        where: { status: { in: LIVE } },
        _count: { _all: true },
      }),
      prisma.authoritySnapshot.findMany({
        orderBy: [{ domain: "asc" }, { fetchedDate: "desc" }],
        distinct: ["domain"],
        select: { domain: true, score: true, referringDomains: true },
      }),
      prisma.socialMediaDailyStat.findMany({
        where: { followers: { gt: 0 } },
        orderBy: [{ siteLink: "asc" }, { platform: "asc" }, { statDate: "desc" }],
        distinct: ["siteLink", "platform"],
        select: { siteLink: true, followers: true },
      }),
    ]);

    const shape = (rows) =>
      rows
        .filter((r) => r.siteLink)
        .map((r) => ({ siteLink: r.siteLink, count: r._count?._all || 0 }));

    // Sum the latest per-platform follower counts back down to one per site.
    const followerBySite = new Map();
    for (const row of followerRows) {
      if (!row.siteLink) continue;
      followerBySite.set(row.siteLink, (followerBySite.get(row.siteLink) || 0) + (row.followers || 0));
    }
    const followers = Array.from(followerBySite, ([siteLink, count]) => ({ siteLink, count }));

    return Response.json(
      {
        posts: shape(posts),
        blogs: shape(blogs),
        publishedPosts: shape(pubPosts),
        publishedBlogs: shape(pubBlogs),
        authority: authRows.map((r) => ({
          domain: r.domain,
          score: r.score,
          referringDomains: r.referringDomains,
        })),
        followers,
      },
      { status: 200, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return Response.json(
      {
        error: error?.message || "Failed to load portfolio overview.",
        posts: [],
        blogs: [],
        publishedPosts: [],
        publishedBlogs: [],
        authority: [],
        followers: [],
      },
      { status: 500 }
    );
  }
}
