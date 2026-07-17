import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import prisma from "../../../../lib/prisma";
import { ROLES } from "../../../../lib/rbac";
import { buildBlogPayload, parseScheduledDate, parseSeoMetaInput } from "../../../../lib/blogPayload.js";
import { BLOG_INCLUDE } from "../../../../lib/blogAccess.js";
import { recordBlogRevision } from "../../../../lib/blogRevisions.js";

export const runtime = "nodejs";

const OPEN = new Set(["pending", "edited"]);

export async function PATCH(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const action = String(body.action || "").toLowerCase();
    const blog = await prisma.blogPost.findUnique({ where: { id } });
    if (!blog) return Response.json({ error: "Blog not found." }, { status: 404 });

    const isAdmin = session.user.role === ROLES.SUPER_ADMIN || session.user.role === ROLES.SMM;
    const isAssignee = blog.assigneeId === session.user.id;
    if (!isAdmin && !isAssignee) return Response.json({ error: "Forbidden" }, { status: 403 });
    if (!OPEN.has(blog.status) && action !== "schedule") {
      return Response.json({ error: "This blog is already closed." }, { status: 400 });
    }

    const now = new Date();

    const seoMeta = parseSeoMetaInput(body);

    if (action === "approve") {
      const existingPayload =
        blog.payload && typeof blog.payload === "object" ? { ...blog.payload } : buildBlogPayload(blog);
      if (Object.keys(seoMeta).length) {
        existingPayload.meta = { ...(existingPayload.meta || {}), ...seoMeta };
      }
      await prisma.blogPost.update({
        where: { id },
        data: {
          status: "approved",
          lastAction: "approve",
          respondedAt: now,
          awaitingAdminReview: true,
          userEditedTitle: body.editedTitle !== undefined ? String(body.editedTitle).trim() || null : undefined,
          userEditedExcerpt: body.editedExcerpt !== undefined ? String(body.editedExcerpt).trim() || null : undefined,
          userEditedContent: body.editedContent !== undefined ? String(body.editedContent).trim() || null : undefined,
          userEditedSlug: body.editedSlug !== undefined ? String(body.editedSlug).trim() || null : undefined,
          scheduledFor: body.scheduledFor !== undefined ? parseScheduledDate(body.scheduledFor) : undefined,
          payload: Object.keys(seoMeta).length ? existingPayload : undefined,
        },
      });
    } else if (action === "decline") {
      const reason = String(body.declineReason || body.reason || "").trim();
      if (!reason) return Response.json({ error: "Decline reason is required." }, { status: 400 });
      await prisma.blogPost.update({
        where: { id },
        data: {
          status: "declined",
          lastAction: "decline",
          respondedAt: now,
          awaitingAdminReview: true,
          publishError: reason,
        },
      });
    } else if (action === "edit") {
      const existingPayload =
        blog.payload && typeof blog.payload === "object" ? { ...blog.payload } : buildBlogPayload(blog);
      if (Object.keys(seoMeta).length) {
        existingPayload.meta = { ...(existingPayload.meta || {}), ...seoMeta };
      }
      await prisma.blogPost.update({
        where: { id },
        data: {
          status: "edited",
          lastAction: "edit",
          respondedAt: now,
          awaitingAdminReview: true,
          userEditedTitle: body.editedTitle !== undefined ? String(body.editedTitle).trim() || null : undefined,
          userEditedExcerpt: body.editedExcerpt !== undefined ? String(body.editedExcerpt).trim() || null : undefined,
          userEditedContent: body.editedContent !== undefined ? String(body.editedContent).trim() || null : undefined,
          userEditedSlug: body.editedSlug !== undefined ? String(body.editedSlug).trim() || null : undefined,
          scheduledFor: body.scheduledFor !== undefined ? parseScheduledDate(body.scheduledFor) : undefined,
          payload: Object.keys(seoMeta).length ? existingPayload : undefined,
        },
      });
    } else if (action === "schedule" && (isAdmin || blog.status === "approved")) {
      const scheduledFor = parseScheduledDate(body.scheduledFor);
      if (!scheduledFor) return Response.json({ error: "Valid scheduledFor is required." }, { status: 400 });
      await prisma.blogPost.update({ where: { id }, data: { scheduledFor } });
    } else {
      return Response.json({ error: "Invalid action." }, { status: 400 });
    }

    const updated = await prisma.blogPost.findUnique({ where: { id }, include: BLOG_INCLUDE });
    await recordBlogRevision(updated, { action, actorId: session.user.id });
    return Response.json({ blog: updated });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to update blog." }, { status: 500 });
  }
}
