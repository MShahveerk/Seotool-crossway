import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import prisma from "../../../lib/prisma";
import {
  buildApprovalSiteOrFilter,
  resolveSiteEquivalents,
  sessionCanAccessSiteAsync,
} from "../../../lib/siteAccess";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const role = session.user.role;
    let whereClause = {};

    if (role !== "super_admin" && role !== "smm") {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: { accessibleSites: true }
      });
      const allowedSites = [
        user.siteLink,
        user.facebookPageId,
        user.instagramUserId,
        ...(user.accessibleSites || []).map(s => s.siteLink)
      ].filter(Boolean);

      if (allowedSites.length > 0) {
        whereClause = {
          AND: [
            {
              OR: [
                { assigneeId: session.user.id },
                { createdById: session.user.id }
              ]
            },
            {
              OR: [
                { facebookPageId: { in: allowedSites } },
                { siteLink: { in: allowedSites } },
                { instagramUserId: { in: allowedSites } },
              ]
            }
          ]
        };
      } else {
        whereClause = {
          OR: [
            { assigneeId: session.user.id },
            { createdById: session.user.id }
          ]
        };
      }
    }

    // Filter by selected site / meta page ID if specified in the query
    const siteParam = req.nextUrl.searchParams.get("site") || req.nextUrl.searchParams.get("url");
    if (siteParam) {
      const equivalents = await resolveSiteEquivalents(prisma, siteParam);
      if (role === "smm" && !(await sessionCanAccessSiteAsync(prisma, session.user, equivalents))) {
        return new Response(JSON.stringify({ error: "Access denied for selected site." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
      const siteFilter = buildApprovalSiteOrFilter(equivalents);
      if (siteFilter) {
        whereClause = Object.keys(whereClause).length
          ? { AND: [whereClause, siteFilter] }
          : siteFilter;
      }
    }

    const approvals = await prisma.approval.findMany({
      where: whereClause,
      include: {
        assignee: { select: { id: true, name: true, email: true } }
      },
      orderBy: { scheduledFor: "asc" }
    });

    let blogWhere = {};
    if (role !== "super_admin" && role !== "smm") {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: { accessibleSites: true },
      });
      const allowedSites = [
        user?.siteLink,
        ...(user?.accessibleSites || []).map((s) => s.siteLink),
      ].filter(Boolean);
      blogWhere = allowedSites.length
        ? { siteLink: { in: allowedSites }, hiddenFromAssignee: false }
        : { assigneeId: session.user.id };
    }
    if (siteParam) {
      const equivalents = await resolveSiteEquivalents(prisma, siteParam);
      blogWhere = { ...blogWhere, siteLink: { in: equivalents } };
    }

    const blogPosts = await prisma.blogPost.findMany({
      where: blogWhere,
      include: { assignee: { select: { id: true, name: true, email: true } } },
      orderBy: { scheduledFor: "asc" },
    }).catch(() => []);

    return new Response(JSON.stringify({ approvals, blogPosts }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Failed to load calendar data" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}