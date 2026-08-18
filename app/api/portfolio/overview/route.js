import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import prisma from "../../../../lib/prisma";
import { hasGlobalSiteAccess } from "../../../../lib/modulePermissions";

export const runtime = "nodejs";

/**
 * GET /api/portfolio/overview
 * Lightweight, agency-wide alert counts for the portfolio constellation.
 * Two grouped queries (no per-client fan-out): pending blog + post approvals
 * keyed by siteLink. The client matches these to each node's site equivalents.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasGlobalSiteAccess(session.user)) {
      return Response.json({ posts: [], blogs: [] }, { status: 200 });
    }

    const pendingWhere = {
      status: { in: ["pending", "edited"] },
      hiddenFromAssignee: false,
    };

    const [posts, blogs] = await Promise.all([
      prisma.approval.groupBy({
        by: ["siteLink"],
        where: pendingWhere,
        _count: { _all: true },
      }),
      prisma.blogPost.groupBy({
        by: ["siteLink"],
        where: pendingWhere,
        _count: { _all: true },
      }),
    ]);

    const shape = (rows) =>
      rows
        .filter((r) => r.siteLink)
        .map((r) => ({ siteLink: r.siteLink, count: r._count?._all || 0 }));

    return Response.json(
      { posts: shape(posts), blogs: shape(blogs) },
      { status: 200, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return Response.json(
      { error: error?.message || "Failed to load portfolio overview.", posts: [], blogs: [] },
      { status: 500 }
    );
  }
}
