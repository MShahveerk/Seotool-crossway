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

export const runtime = "nodejs";

/** PATCH — move a blog card to another board column (status). Published is locked. */
export async function PATCH(req, { params }) {
  try {
    await requirePermission(PERMISSIONS.VIEW_ALL_DATA);
    const { id } = await params;
    const body = await req.json();
    const toColumn = String(body.column || body.status || "").trim().toLowerCase();

    if (!toColumn) {
      return Response.json({ error: "column is required." }, { status: 400 });
    }

    const existing = await prisma.blogPost.findUnique({ where: { id } });
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

    if (toColumn === "approved" && !existing.scheduledFor) {
      data.scheduledFor = resolveScheduleOnApprove(null);
    }

    const updated = await prisma.blogPost.update({
      where: { id },
      data,
      include: BLOG_INCLUDE,
    });

    return Response.json({
      ok: true,
      blog: updated,
      fromColumn,
      toColumn,
      boardColumn: getBlogBoardColumn({ ...updated, ...mapped }),
    });
  } catch (error) {
    return Response.json({ error: error.message || "Move failed." }, { status: error.status || 500 });
  }
}
