import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "../auth/[...nextauth]/route";
import prisma from "../../../lib/prisma";
import { ROLES } from "../../../lib/rbac";
import {
  fetchCaptionMapByApprovalIds,
  mergeCaptionFieldsIntoApprovals,
} from "../../../lib/approvalCaptionMerge";
import {
  buildApprovalSiteOrFilter,
  buildSiteApproverApprovalWhere,
  resolveSiteEquivalents,
} from "../../../lib/siteAccess";
import { canAccessSection } from "../../../lib/modulePermissions";

export const runtime = "nodejs";

const APPROVAL_SELECT = {
  id: true,
  title: true,
  userEditedTitle: true,
  caption: true,
  userEditedCaption: true,
  instructions: true,
  userEditedInstructions: true,
  bodyText: true,
  imagePath: true,
  backupImagePaths: true,
  status: true,
  userEditedText: true,
  respondedAt: true,
  lastAction: true,
  createdAt: true,
  updatedAt: true,
  hiddenFromAssignee: true,
  skippedAssigneeReview: true,
  awaitingAdminReview: true,
  scheduledFor: true,
  publishStatus: true,
  siteLink: true,
  facebookPageId: true,
  instagramUserId: true,
  source: true,
  assigneeId: true,
  createdById: true,
};

/** GET — approvals for SMM Post Approvals. Query: site, smmDisplay=1, countOnly=1 */
export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!canAccessSection(session.user, "my-approvals")) {
      return new Response(JSON.stringify({ error: "Forbidden: Approvals access not granted." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const role = session.user.role;
    const userId = session.user.id;
    const forSmmDisplay = req.nextUrl?.searchParams?.get("smmDisplay") === "1";
    const siteParam =
      req.nextUrl?.searchParams?.get("site") || req.nextUrl?.searchParams?.get("url");

    // Pending / actionable posts must always be listable for SMM + super_admin.
    // Site approvers/users see primary-assignee rows OR any post for their mapped sites
    // (same audience as approval emails — secondary approvers were previously excluded).
    let whereClause;
    if (role === ROLES.SUPER_ADMIN || role === ROLES.SMM) {
      whereClause = { status: { not: "draft" } };
    } else if (role === ROLES.APPROVER || role === ROLES.USER) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { accessibleSites: true },
      });
      whereClause = await buildSiteApproverApprovalWhere(prisma, user || { id: userId });
    } else {
      whereClause = { assigneeId: userId, status: { not: "draft" } };
    }

    if (siteParam) {
      const equivalents = await resolveSiteEquivalents(prisma, String(siteParam).trim());
      const siteFilter = buildApprovalSiteOrFilter(equivalents);
      if (siteFilter) {
        whereClause = { AND: [whereClause, siteFilter] };
      }
    }

    const countOnly = req.nextUrl?.searchParams?.get("countOnly") === "1";
    if (countOnly) {
      const matchRows = await prisma.approval.findMany({
        where: {
          AND: [
            whereClause,
            { status: { in: ["pending", "edited"] } },
            { hiddenFromAssignee: false },
            ...(forSmmDisplay ? [] : [{ skippedAssigneeReview: false }]),
          ],
        },
        select: { id: true },
      });
      return new Response(JSON.stringify({ count: matchRows.length }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const selectWithAssignee = {
      ...APPROVAL_SELECT,
      assignee: { select: { id: true, name: true, email: true } },
    };

    let rows;
    try {
      rows = await prisma.approval.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        select: selectWithAssignee,
      });
    } catch (selectErr) {
      // Fallback if backupImagePaths column not migrated yet
      if (
        String(selectErr.message || "").includes("backupImagePaths") ||
        String(selectErr.message || "").includes("backup_image")
      ) {
        const { backupImagePaths: _b, ...rest } = APPROVAL_SELECT;
        rows = await prisma.approval.findMany({
          where: whereClause,
          orderBy: { createdAt: "desc" },
          select: {
            ...rest,
            assignee: { select: { id: true, name: true, email: true } },
          },
        });
        rows = rows.map((r) => ({ ...r, backupImagePaths: [] }));
      } else {
        throw selectErr;
      }
    }

    // Assignees: hide draft-like hidden rows. SMM/super_admin still see non-draft pending.
    let approvals = rows.filter((a) => {
      if (role === ROLES.APPROVER && a.hiddenFromAssignee) return false;
      if (role === ROLES.APPROVER && a.skippedAssigneeReview && !forSmmDisplay) return false;
      return true;
    });

    // For pure assignee view (not smmDisplay), skip auto-approved-on-assignment
    if (role !== ROLES.SUPER_ADMIN && role !== ROLES.SMM && !forSmmDisplay) {
      approvals = approvals.filter((a) => !a.skippedAssigneeReview);
      approvals = approvals.filter((a) => !a.hiddenFromAssignee);
    }

    // Prefer actionable first in the payload order
    const rank = (s) => {
      const v = String(s || "").toLowerCase();
      if (v === "pending") return 0;
      if (v === "edited") return 1;
      if (v === "approved") return 2;
      return 3;
    };
    approvals.sort((a, b) => {
      const d = rank(a.status) - rank(b.status);
      if (d !== 0) return d;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

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
    console.error("[approvals GET]", error);
    return new Response(JSON.stringify({ error: error.message || "Failed to list approvals" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
