import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import prisma from "../../../lib/prisma";

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
                { siteLink: { in: allowedSites } }
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
      const cleanSite = String(siteParam).trim();
      const normalizeLocal = (s) => {
        try {
          const u = new URL(s.startsWith("http") ? s : `https://${s}`);
          return u.hostname.replace(/^www\./i, "").toLowerCase();
        } catch {
          return s.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "").toLowerCase();
        }
      };
      
      const normSite = normalizeLocal(cleanSite);
      
      const siteFilter = {
        OR: [
          { facebookPageId: cleanSite },
          { instagramUserId: cleanSite },
          { siteLink: cleanSite },
          { siteLink: { contains: normSite } }
        ]
      };

      whereClause = whereClause.AND 
        ? { AND: [...whereClause.AND, siteFilter] }
        : { AND: [whereClause, siteFilter] };
    }

    const approvals = await prisma.approval.findMany({
      where: whereClause,
      include: {
        assignee: { select: { id: true, name: true, email: true } }
      },
      orderBy: { scheduledFor: "asc" }
    });

    return new Response(JSON.stringify({ approvals }), {
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