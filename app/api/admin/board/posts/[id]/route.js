import { requireAdminRoute } from "../../../../../../lib/adminAuth";

import prisma from "@/lib/prisma";
import {
  canManuallyMovePost,
  getPostBoardColumn,
  postColumnToUpdate,
} from "@/lib/boardMeta.js";
import { resolveScheduleOnApprove } from "@/lib/approvalSchedule.js";
import { notifyOnBoardMove } from "@/lib/boardNotifications.js";
import { publishApprovalNow } from "@/lib/postPublishJobs.js";

export const runtime = "nodejs";

async function loadApproval(id) {
  return prisma.approval.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, email: true, name: true, role: true } },
      createdBy: { select: { id: true, email: true, name: true, role: true } },
    },
  });
}

/** PATCH — move a post card to another board column. Dropping onto Published publishes now. */
export async function PATCH(req, { params }) {
  try {
    const session = await requireAdminRoute(req, "post-board");
    const { id } = await params;
    const body = await req.json();
    const toColumn = String(body.column || body.status || "").trim().toLowerCase();

    if (!toColumn) {
      return Response.json({ error: "column is required." }, { status: 400 });
    }

    const existing = await loadApproval(id);
    if (!existing) return Response.json({ error: "Post not found." }, { status: 404 });

    if (existing.publishStatus === "published") {
      return Response.json({ error: "Published posts are locked and cannot be moved." }, { status: 400 });
    }

    const fromColumn = getPostBoardColumn(existing);
    if (!canManuallyMovePost(fromColumn, toColumn)) {
      return Response.json(
        { error: `Cannot move from ${fromColumn} to ${toColumn}.` },
        { status: 400 }
      );
    }

    if (toColumn === "published") {
      if (existing.status !== "approved") {
        await prisma.approval.update({
          where: { id },
          data: {
            status: "approved",
            publishStatus: "unpublish",
            hiddenFromAssignee: false,
            awaitingAdminReview: false,
            lastAction: "approve",
            respondedAt: new Date(),
            publishError: null,
          },
        });
      }
      const publish = await publishApprovalNow(id);
      const updated = await loadApproval(id);

      if (publish.success) {
        try {
          const { sendPostStatusChangeNotification } = await import("@/lib/email.js");
          await sendPostStatusChangeNotification(
            updated,
            session.user,
            "published",
            publish.method || ""
          );
        } catch (err) {
          console.error(`[board] publish notify failed for post ${id}:`, err.message);
        }
      }

      return Response.json({
        ok: true,
        approval: updated,
        fromColumn,
        toColumn,
        boardColumn: getPostBoardColumn(updated),
        publish,
        notify: { notified: 0, skipped: true },
      });
    }

    const mapped = postColumnToUpdate(toColumn);
    if (!mapped) return Response.json({ error: "Unknown column." }, { status: 400 });

    const data = { ...mapped };

    if (toColumn === "approved") {
      data.scheduledFor = resolveScheduleOnApprove(existing.scheduledFor);
      data.awaitingAdminReview = false;
      data.lastAction = "approve";
      data.respondedAt = new Date();
      data.publishError = null;
    }
    if (toColumn === "pending" || toColumn === "edited" || toColumn === "draft") {
      data.awaitingAdminReview = false;
      data.hiddenFromAssignee = toColumn === "draft" ? true : false;
      data.publishError = null;
    }
    if (toColumn === "declined") {
      data.lastAction = "decline";
      data.respondedAt = new Date();
    }

    const updated = await prisma.approval.update({
      where: { id },
      data,
      include: {
        assignee: { select: { id: true, email: true, name: true, role: true } },
        createdBy: { select: { id: true, email: true, name: true, role: true } },
      },
    });

    const notify = await notifyOnBoardMove({
      kind: "post",
      fromColumn,
      toColumn,
      item: updated,
      operatorUser: session.user,
    });

    return Response.json({
      ok: true,
      approval: updated,
      fromColumn,
      toColumn,
      boardColumn: getPostBoardColumn(updated),
      notify,
    });
  } catch (error) {
    return Response.json({ error: error.message || "Move failed." }, { status: error.status || 500 });
  }
}
