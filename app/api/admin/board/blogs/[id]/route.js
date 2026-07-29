import { requirePermission } from "@/lib/middleware/auth";
import { PERMISSIONS } from "@/lib/rbac";
import prisma from "@/lib/prisma";
import {
  blogColumnToUpdate,
  canManuallyMoveBlog,
  getBlogBoardColumn,
} from "@/lib/boardMeta.js";
import { BLOG_INCLUDE } from "@/lib/blogAccess.js";
import { resolveScheduleOnApprove } from "@/lib/approvalSchedule.js";
import { notifyOnBoardMove } from "@/lib/boardNotifications.js";
import { publishBlogNow, syncBlogScheduleToWordpress } from "@/lib/blogPublishJobs.js";

export const runtime = "nodejs";

/** PATCH — move a blog card to another board column (status). Published is locked. */
export async function PATCH(req, { params }) {
  try {
    const session = await requirePermission(PERMISSIONS.VIEW_ALL_DATA);
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
    }
    if (toColumn === "pending") {
      data.hiddenFromAssignee = false;
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

    if (toColumn === "approved") {
      const dueAt = updated.scheduledFor ? new Date(updated.scheduledFor).getTime() : 0;
      if (dueAt && dueAt <= Date.now()) {
        // Schedule already due → publish live to WordPress now
        publish = await publishBlogNow(updated.id);
        updated = await prisma.blogPost.findUnique({ where: { id }, include: BLOG_INCLUDE });
      } else if (updated.scheduledFor) {
        // Future schedule → reflect on WordPress as future
        scheduleSync = await syncBlogScheduleToWordpress(updated, updated.scheduledFor);
        updated = await prisma.blogPost.findUnique({ where: { id }, include: BLOG_INCLUDE });
      }
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
    });
  } catch (error) {
    return Response.json({ error: error.message || "Move failed." }, { status: error.status || 500 });
  }
}
