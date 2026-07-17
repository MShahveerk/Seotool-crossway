import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "../auth/[...nextauth]/route";
import prisma from "../../../lib/prisma";
import { ROLES } from "../../../lib/rbac";
import {
  fetchCaptionMapByApprovalIds,
  mergeCaptionFieldsIntoApprovals,
} from "../../../lib/approvalCaptionMerge";

export const runtime = "nodejs";

/** GET — approvals assigned to the current user. Query: smmDisplay=1 includes auto-approved-on-assignment rows (SMM cards only). */
export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (session.user.role === ROLES.SUPER_ADMIN) {
      return new Response(JSON.stringify({ approvals: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const assigneeId = session.user.id;
    const forSmmDisplay = req.nextUrl?.searchParams?.get("smmDisplay") === "1";

    // SMM users see everything. Others only see their assigned items.
    let whereClause = session.user.role === ROLES.SMM ? {} : { assigneeId };

    if (session.user.role === ROLES.APPROVER) {
      const user = await prisma.user.findUnique({
        where: { id: assigneeId },
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
            { assigneeId },
            {
              OR: [
                { facebookPageId: { in: allowedSites } },
                { siteLink: { in: allowedSites } }
              ]
            }
          ]
        };
      }
    }

    // Filter by selected site / meta page ID if specified in the query
    const siteParam = req.nextUrl?.searchParams?.get("site") || req.nextUrl?.searchParams?.get("url");
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

    const countOnly = req.nextUrl?.searchParams?.get("countOnly") === "1";
    if (countOnly) {
      let hiddenIds = new Set();
      try {
        const hiddenRows = await prisma.$queryRaw(
          Prisma.sql`SELECT id FROM approvals WHERE assignee_id = ${assigneeId} AND hidden_from_assignee = true`
        );
        hiddenIds = new Set(
          Array.isArray(hiddenRows) ? hiddenRows.map((r) => String((r && r.id) || "")).filter(Boolean) : []
        );
      } catch {}

      let skippedIds = new Set();
      try {
        const skippedRows = await prisma.$queryRaw(
          Prisma.sql`SELECT id FROM approvals WHERE assignee_id = ${assigneeId} AND skipped_assignee_review = true`
        );
        skippedIds = new Set(
          Array.isArray(skippedRows) ? skippedRows.map((r) => String((r && r.id) || "")).filter(Boolean) : []
        );
      } catch {}

      const matchRows = await prisma.approval.findMany({
        where: {
          ...whereClause,
          status: { in: ["pending", "edited"] },
        },
        select: { id: true },
      });

      const count = matchRows.filter((a) => !hiddenIds.has(a.id) && !skippedIds.has(a.id)).length;

      return new Response(JSON.stringify({ count }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const rows = await prisma.approval.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        userEditedTitle: true,
        caption: true,
        userEditedCaption: true,
        instructions: true,
        userEditedInstructions: true,
        bodyText: true,
        imagePath: true,
        status: true,
        userEditedText: true,
        respondedAt: true,
        lastAction: true,
        createdAt: true,
        updatedAt: true,
        hiddenFromAssignee: true,
        skippedAssigneeReview: true,
      },
    });

    let hiddenIds = new Set();
    try {
      const hiddenRows = await prisma.$queryRaw(
        Prisma.sql`SELECT id FROM approvals WHERE assignee_id = ${assigneeId} AND hidden_from_assignee = true`
      );
      hiddenIds = new Set(
        Array.isArray(hiddenRows) ? hiddenRows.map((r) => String((r && r.id) || "")).filter(Boolean) : []
      );
    } catch {
      // Column missing or DB mismatch — return all rows for this assignee
    }

    let approvals = rows.filter((a) => !hiddenIds.has(a.id));

    if (!forSmmDisplay) {
      let skippedIds = new Set();
      try {
        const skippedRows = await prisma.$queryRaw(
          Prisma.sql`SELECT id FROM approvals WHERE assignee_id = ${assigneeId} AND skipped_assignee_review = true`
        );
        skippedIds = new Set(
          Array.isArray(skippedRows)
            ? skippedRows.map((r) => String((r && r.id) || "")).filter(Boolean)
            : []
        );
      } catch {
        // Column missing — keep all visible rows
      }
      approvals = approvals.filter((a) => !skippedIds.has(a.id));
    }

    const captionMap = await fetchCaptionMapByApprovalIds(
      prisma,
      approvals.map((a) => a.id)
    );
    approvals = mergeCaptionFieldsIntoApprovals(approvals, captionMap);

    return new Response(JSON.stringify({ approvals }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Failed to load approvals" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
