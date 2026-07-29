import { requirePermission } from "@/lib/middleware/auth";
import { PERMISSIONS } from "@/lib/rbac";
import prisma from "@/lib/prisma";
import {
  canManuallyMovePost,
  getPostBoardColumn,
  postColumnToUpdate,
} from "@/lib/boardMeta.js";
import { resolveScheduleOnApprove } from "@/lib/approvalSchedule.js";

export const runtime = "nodejs";

/** PATCH — move a post card to another board column (status). Published is locked. */
export async function PATCH(req, { params }) {
  try {
    await requirePermission(PERMISSIONS.VIEW_ALL_DATA);
    const { id } = await params;
    const body = await req.json();
    const toColumn = String(body.column || body.status || "").trim().toLowerCase();

    if (!toColumn) {
      return Response.json({ error: "column is required." }, { status: 400 });
    }

    const existing = await prisma.approval.findUnique({ where: { id } });
    if (!existing) return Response.json({ error: "Post not found." }, { status: 404 });

    if (existing.publishStatus === "published" || toColumn === "published") {
      return Response.json({ error: "Published posts are locked and cannot be moved." }, { status: 400 });
    }

    const fromColumn = getPostBoardColumn(existing);
    if (!canManuallyMovePost(fromColumn, toColumn)) {
      return Response.json(
        { error: `Cannot move from ${fromColumn} to ${toColumn}.` },
        { status: 400 }
      );
    }

    const mapped = postColumnToUpdate(toColumn);
    if (!mapped) return Response.json({ error: "Unknown column." }, { status: 400 });

    const data = { ...mapped };

    if (toColumn === "approved") {
      data.scheduledFor = resolveScheduleOnApprove(existing.scheduledFor);
      data.awaitingAdminReview = false;
    }
    if (toColumn === "pending" && existing.status === "draft") {
      data.awaitingAdminReview = false;
    }

    const updated = await prisma.approval.update({
      where: { id },
      data,
      include: {
        assignee: { select: { id: true, email: true, name: true } },
        createdBy: { select: { id: true, email: true, name: true } },
      },
    });

    return Response.json({
      ok: true,
      approval: updated,
      fromColumn,
      toColumn,
      boardColumn: getPostBoardColumn(updated),
    });
  } catch (error) {
    return Response.json({ error: error.message || "Move failed." }, { status: error.status || 500 });
  }
}
