import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import prisma from "../../../../lib/prisma";
import { hasGlobalSiteAccess } from "../../../../lib/modulePermissions";
import { toScore100 } from "../../../../lib/authorityScore";
import { toDomain } from "../../../../lib/authority";
import { normalizeBacklinksSummary } from "../../../../lib/seranking/normalize";
import { DATA_TYPES } from "../../../../lib/seranking/config";

export const runtime = "nodejs";

/**
 * GET /api/portfolio/overview
 * Lightweight, agency-wide metrics + alert counts for the portfolio
 * constellation. All grouped/distinct queries (no per-client fan-out):
 *   - pending blog + post approvals, keyed by siteLink (the amber alert)
 *   - total blog + post volume per siteLink (unambiguous content count)
 *   - authority per domain (Open PageRank, scaled 0-100 like the dashboard)
 *   - referring domains via the SAME cascade the dashboard uses:
 *       SE Ranking backlinks summary → site-explorer (OPR/count) → OPR authority
 *   - latest non-zero follower count per site+platform (social reach)
 * The client matches these to each node's site equivalents.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasGlobalSiteAccess(session.user)) {
      return Response.json(
        {
          posts: [],
          blogs: [],
          totalPosts: [],
          totalBlogs: [],
          authority: [],
          backlinks: [],
          explorer: [],
          followers: [],
        },
        { status: 200 }
      );
    }

    const pendingWhere = {
      status: { in: ["pending", "edited"] },
      hiddenFromAssignee: false,
    };

    const [posts, blogs, allPosts, allBlogs, authRows, backlinkRows, explorerRows, followerRows] =
      await Promise.all([
        prisma.approval.groupBy({ by: ["siteLink"], where: pendingWhere, _count: { _all: true } }),
        prisma.blogPost.groupBy({ by: ["siteLink"], where: pendingWhere, _count: { _all: true } }),
        prisma.approval.groupBy({ by: ["siteLink"], _count: { _all: true } }),
        prisma.blogPost.groupBy({ by: ["siteLink"], _count: { _all: true } }),
        prisma.authoritySnapshot.findMany({
          orderBy: [{ domain: "asc" }, { fetchedDate: "desc" }],
          distinct: ["domain"],
          select: { domain: true, score: true, referringDomains: true },
        }),
        // SE Ranking backlink summary is the dashboard's primary referring-domain
        // source (e.g. 407). One latest row per site.
        prisma.serankingSnapshot.findMany({
          where: { dataType: DATA_TYPES.BACKLINKS_SUMMARY },
          orderBy: [{ siteUrl: "asc" }, { fetchedAt: "desc" }],
          distinct: ["siteUrl"],
          select: { siteUrl: true, payload: true },
        }),
        // Site-explorer snapshot is the next fallback (OPR / crawl counts).
        prisma.siteExplorerSnapshot.findMany({
          where: { status: "success" },
          orderBy: [{ domain: "asc" }, { fetchedDate: "desc" }],
          distinct: ["domain"],
          select: { domain: true, referringDomainsOpr: true, referringDomainsCount: true },
        }),
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

    // Keyed by bare host — the only identifier stable across the many siteUrl
    // variants SE Ranking snapshots are stored under. Carries both the
    // referring-domain count (407) and the domain inlink rank (SE Ranking's
    // 0-100 authority, which Site Intelligence shows).
    const backlinks = backlinkRows
      .map((r) => {
        const summary = normalizeBacklinksSummary(r.payload);
        return {
          domain: toDomain(r.siteUrl),
          refdomains: summary?.refdomains ?? null,
          inlinkRank: summary?.domainInlinkRank ?? null,
        };
      })
      .filter((r) => r.domain && (r.refdomains != null || r.inlinkRank != null));

    const explorer = explorerRows
      .filter((r) => r.domain)
      .map((r) => ({
        domain: r.domain,
        refOpr: r.referringDomainsOpr ?? null,
        refCount: r.referringDomainsCount ?? null,
      }));

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
        authority: authRows.map((r) => ({
          domain: r.domain,
          score: r.score,
          // 0-100 (DA-style), matching the dashboard scorecard.
          score100: r.score != null ? toScore100(r.score) : null,
          referringDomains: r.referringDomains,
        })),
        backlinks,
        explorer,
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
        totalPosts: [],
        totalBlogs: [],
        authority: [],
        backlinks: [],
        explorer: [],
        followers: [],
      },
      { status: 500 }
    );
  }
}
