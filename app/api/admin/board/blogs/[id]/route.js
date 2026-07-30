import { requireAdminRoute } from "../../../../../../lib/adminAuth";

import prisma from "@/lib/prisma";
import {
  blogColumnToUpdate,
  canManuallyMoveBlog,
  getBlogBoardColumn,
} from "@/lib/boardMeta.js";
import { BLOG_INCLUDE } from "@/lib/blogAccess.js";
import { isScheduleDue, resolveScheduleOnApprove } from "@/lib/approvalSchedule.js";
import { notifyOnBoardMove } from "@/lib/boardNotifications.js";
import { publishBlogNow, syncBlogScheduleToWordpress } from "@/lib/blogPublishJobs.js";
import { pullBlogBackToWordpressDraft } from "@/lib/blogWordpressPullback.js";
import { revertDeclinedBlogToDraft } from "@/lib/blogDecline.js";

export const runtime = "nodejs";

/** PATCH — move a blog card to another board column (status). Published is locked. */
export async function PATCH(req, { params }) {
  try {
    const session = await requireAdminRoute(req, "blog-board");
    const { id } = await params;
    const body = await req.json();
    const toColumn = String(body.column || body.status || "").trim().toLowerCase();

    if (!toColumn) {
      return Response.json({ error: "column is required." }, { status: 400 });
    }

    const existing = await prisma.blogPost.findUnique({
      where: { id },
      include: BLOG_INCLUDE,
    });
    if (!existing) return Response.json({ error: "Blog not found." }, { status: 404 });

    if (existing.publishStatus === "published" || toColumn === "published") {
      return Response.json({ error: "Published blogs are locked and cannot be moved." }, { status: 400 });
    }
    if (existing.status === "deleted") {
      return Response.json({ error: "Deleted blogs cannot be moved on the board." }, { status: 400 });
    }

    const fromColumn = getBlogBoardColumn(existing);
    if (!canManuallyMoveBlog(fromColumn, toColumn)) {
      return Response.json(
        { error: `Cannot move from ${fromColumn} to ${toColumn}.` },
        { status: 400 }
      );
    }

    const mapped = blogColumnToUpdate(toColumn);
    if (!mapped) return Response.json({ error: "Unknown column." }, { status: 400 });

    const data = {
      status: mapped.status,
      publishStatus: mapped.publishStatus,
    };
    if (typeof mapped.hiddenFromAssignee === "boolean") {
      data.hiddenFromAssignee = mapped.hiddenFromAssignee;
    }

    if (toColumn === "approved") {
      data.scheduledFor = resolveScheduleOnApprove(existing.scheduledFor);
      data.lastAction = "approve";
      data.respondedAt = new Date();
      data.hiddenFromAssignee = false;
      data.publishError = null;
    }
    if (toColumn === "pending" || toColumn === "edited" || toColumn === "draft") {
      data.hiddenFromAssignee = toColumn === "draft" ? true : false;
      // Leaving the publish path — clear stale error badge
      data.publishError = null;
    }
    if (toColumn === "declined") {
      data.lastAction = "decline";
      data.respondedAt = new Date();
    }

    let updated = await prisma.blogPost.update({
      where: { id },
      data,
      include: BLOG_INCLUDE,
    });

    let publish = null;
    let scheduleSync = null;
    let wpPullback = null;

    if (toColumn === "approved") {
      if (isScheduleDue(updated.scheduledFor)) {
        publish = await publishBlogNow(updated.id);
        updated = await prisma.blogPost.findUnique({ where: { id }, include: BLOG_INCLUDE });
      } else if (updated.scheduledFor) {
        scheduleSync = await syncBlogScheduleToWordpress(updated, updated.scheduledFor, {
          publishIfDue: false,
        });
        updated = await prisma.blogPost.findUnique({ where: { id }, include: BLOG_INCLUDE });
      }
    }

    // Leaving Approved/Failed → cancel WP future publish so WordPress cannot go live alone.
    const leavingPublishPath =
      (fromColumn === "approved" || fromColumn === "failed") &&
      ["pending", "edited", "draft", "declined"].includes(toColumn);

    if (leavingPublishPath) {
      if (toColumn === "declined") {
        const note = await revertDeclinedBlogToDraft(updated);
        wpPullback = { synced: Boolean(note && !String(note).startsWith("Warning")), note };
      } else {
        wpPullback = await pullBlogBackToWordpressDraft(updated, {
          clearSchedule: false,
          keepDateAsDraft: Boolean(updated.scheduledFor),
        });
      }
      updated = await prisma.blogPost.findUnique({ where: { id }, include: BLOG_INCLUDE });
    }

    const notify = await notifyOnBoardMove({
      kind: "blog",
      fromColumn,
      toColumn,
      item: updated,
      operatorUser: session.user,
    });

    return Response.json({
      ok: true,
      blog: updated,
      fromColumn,
      toColumn,
      boardColumn: getBlogBoardColumn(updated),
      notify,
      publish,
      scheduleSync,
      wpPullback,
    });
  } catch (error) {
    return Response.json({ error: error.message || "Move failed." }, { status: error.status || 500 });
  }
}
