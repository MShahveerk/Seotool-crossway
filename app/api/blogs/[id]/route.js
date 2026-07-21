import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import prisma from "../../../../lib/prisma";
import { ROLES } from "../../../../lib/rbac";
import { buildBlogPayload, parseScheduledDate, parseSeoMetaInput } from "../../../../lib/blogPayload.js";
import { saveBlogFeaturedImage } from "../../../../lib/blogMedia.js";
import { BLOG_INCLUDE } from "../../../../lib/blogAccess.js";
import { recordBlogRevision } from "../../../../lib/blogRevisions.js";

export const runtime = "nodejs";

const OPEN = new Set(["pending", "edited"]);

async function parseBlogActionRequest(req) {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const body = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") body[key] = value;
    }
    const featuredFile = form.get("featuredImage") || form.get("image");
    return { body, featuredFile };
  }
  return { body: await req.json(), featuredFile: null };
}

function applyFeaturedToPayload(
  existingPayload,
  { featuredImagePath, featuredImageAlt, replacedImage = false }
) {
  const payload =
    existingPayload && typeof existingPayload === "object"
      ? { ...existingPayload }
      : {};
  payload.featured_media = {
    ...(payload.featured_media || {}),
    url: featuredImagePath || payload.featured_media?.url || null,
    alt: featuredImageAlt || "",
    // Clear WP media id when a new file is uploaded so publish uploads it.
    id: replacedImage ? null : payload.featured_media?.id ?? null,
  };
  return payload;
}

export async function PATCH(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const { body, featuredFile } = await parseBlogActionRequest(req);
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

    let featuredImagePath = blog.featuredImagePath;
    let featuredImageAlt =
      body.featuredImageAlt !== undefined
        ? String(body.featuredImageAlt || "").trim() || null
        : blog.featuredImageAlt;
    let featuredChanged = body.featuredImageAlt !== undefined;
    let replacedImage = false;

    if (featuredFile && typeof featuredFile !== "string" && featuredFile.size) {
      featuredImagePath = await saveBlogFeaturedImage(featuredFile);
      featuredChanged = true;
      replacedImage = true;
    }

    if (action === "save_image") {
      if (!featuredChanged) {
        return Response.json(
          { error: "Choose an image file or update the alt text, then save." },
          { status: 400 }
        );
      }
      const existingPayload = applyFeaturedToPayload(
        blog.payload && typeof blog.payload === "object" ? { ...blog.payload } : buildBlogPayload(blog),
        { featuredImagePath, featuredImageAlt, replacedImage }
      );
      await prisma.blogPost.update({
        where: { id },
        data: {
          lastAction: "save_image",
          featuredImagePath,
          featuredImageAlt,
          payload: existingPayload,
        },
      });
    } else if (action === "approve" || action === "edit") {
      let existingPayload =
        blog.payload && typeof blog.payload === "object" ? { ...blog.payload } : buildBlogPayload(blog);
      if (Object.keys(seoMeta).length) {
        existingPayload.meta = { ...(existingPayload.meta || {}), ...seoMeta };
      }
      if (featuredChanged) {
        existingPayload = applyFeaturedToPayload(existingPayload, {
          featuredImagePath,
          featuredImageAlt,
          replacedImage,
        });
      }

      await prisma.blogPost.update({
        where: { id },
        data: {
          status: action === "approve" ? "approved" : "edited",
          lastAction: action,
          respondedAt: now,
          awaitingAdminReview: true,
          userEditedTitle: body.editedTitle !== undefined ? String(body.editedTitle).trim() || null : undefined,
          userEditedExcerpt:
            body.editedExcerpt !== undefined ? String(body.editedExcerpt).trim() || null : undefined,
          userEditedContent:
            body.editedContent !== undefined ? String(body.editedContent).trim() || null : undefined,
          userEditedSlug: body.editedSlug !== undefined ? String(body.editedSlug).trim() || null : undefined,
          scheduledFor: body.scheduledFor !== undefined ? parseScheduledDate(body.scheduledFor) : undefined,
          featuredImagePath: featuredChanged ? featuredImagePath : undefined,
          featuredImageAlt: featuredChanged ? featuredImageAlt : undefined,
          payload:
            Object.keys(seoMeta).length || featuredChanged ? existingPayload : undefined,
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
      try {
        const { revertDeclinedBlogToDraft } = await import("../../../../lib/blogDecline.js");
        await revertDeclinedBlogToDraft(blog);
      } catch (err) {
        console.error(`[blog] decline revert failed for ${id}: ${err.message}`);
      }
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
    return Response.json({ error: error.message || "Failed to update blog." }, { status: error.status || 500 });
  }
}

export async function DELETE(_req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const blog = await prisma.blogPost.findUnique({ where: { id } });
    if (!blog) return Response.json({ error: "Blog not found." }, { status: 404 });

    const isAdmin = session.user.role === ROLES.SUPER_ADMIN || session.user.role === ROLES.SMM;
    const isAssignee = blog.assigneeId === session.user.id;
    if (!isAdmin && !isAssignee) return Response.json({ error: "Forbidden" }, { status: 403 });
    if (blog.publishStatus === "published" && !isAdmin) {
      return Response.json({ error: "Published blogs can only be deleted by an admin." }, { status: 403 });
    }

    // Hard delete (revisions and publish logs cascade). A future pull can
    // re-import the post from WordPress if it still exists there.
    await prisma.blogPost.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to delete blog." }, { status: error.status || 500 });
  }
}
