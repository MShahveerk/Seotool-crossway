import { requireAdminRoute } from "../../../../../lib/adminAuth";
import prisma from "../../../../../lib/prisma";

import { buildBlogPayload, parseScheduledDate, parseSeoMetaInput } from "../../../../../lib/blogPayload.js";
import { saveBlogFeaturedImage } from "../../../../../lib/blogMedia.js";
import { BLOG_INCLUDE } from "../../../../../lib/blogAccess.js";
import { recordBlogRevision } from "../../../../../lib/blogRevisions.js";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  try {
    await requireAdminRoute(req);
    const { id } = await params;
    const blog = await prisma.blogPost.findUnique({ where: { id }, include: BLOG_INCLUDE });
    if (!blog) return Response.json({ error: "Blog not found." }, { status: 404 });
    return Response.json({ blog });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to load blog." }, { status: error.status || 500 });
  }
}

export async function PATCH(req, { params }) {
  try {
    const session = await requireAdminRoute(req);
    const { id } = await params;
    const body = await req.json();
    const existing = await prisma.blogPost.findUnique({ where: { id } });
    if (!existing) return Response.json({ error: "Blog not found." }, { status: 404 });

    const scheduledFor =
      body.scheduledFor !== undefined ? parseScheduledDate(body.scheduledFor) : existing.scheduledFor;

    const title = body.title !== undefined ? String(body.title).trim() : existing.title;
    const content = body.content !== undefined ? String(body.content).trim() : existing.content;
    const excerpt = body.excerpt !== undefined ? String(body.excerpt).trim() : existing.excerpt;
    const slug = body.slug !== undefined ? String(body.slug).trim() : existing.slug;
    const wpStatus = body.wpStatus !== undefined ? String(body.wpStatus).trim() : existing.wpStatus;
    const featuredImageAlt =
      body.featuredImageAlt !== undefined
        ? String(body.featuredImageAlt || "").trim() || null
        : existing.featuredImageAlt;

    const payload = buildBlogPayload({
      title,
      content,
      excerpt,
      slug,
      status: wpStatus,
      date: scheduledFor,
      categories: body.categories ?? existing.payload?.categories ?? [],
      tags: body.tags ?? existing.payload?.tags ?? [],
      meta: body.meta ?? existing.payload?.meta ?? {},
      seoTitle: body.seoTitle,
      metaDescription: body.metaDescription,
      focusKeyword: body.focusKeyword,
      featuredImageAlt,
      featuredImageUrl: existing.featuredImagePath,
    });

    // Keep userEdited* in sync so previews (which prefer edited fields) stay accurate.
    const syncEdited = body.syncEditedFields !== false;
    const blog = await prisma.blogPost.update({
      where: { id },
      data: {
        title,
        content,
        excerpt,
        slug,
        wpStatus,
        payload,
        scheduledFor,
        featuredImageAlt,
        ...(syncEdited
          ? {
              userEditedTitle: title || null,
              userEditedContent: content || null,
              userEditedExcerpt: excerpt || null,
              userEditedSlug: slug || null,
            }
          : {}),
        hiddenFromAssignee: body.hiddenFromAssignee ?? existing.hiddenFromAssignee,
        status:
          body.status && ["pending", "approved", "declined", "edited", "draft"].includes(body.status)
            ? body.status
            : undefined,
      },
      include: BLOG_INCLUDE,
    });

    await recordBlogRevision(blog, { action: "admin_update", actorId: session.user.id });

    // Board/admin schedule edits on approved blogs must re-sync WP future date.
    const prevMs = existing.scheduledFor ? new Date(existing.scheduledFor).getTime() : null;
    const nextMs = scheduledFor ? new Date(scheduledFor).getTime() : null;
    const scheduleChanged = body.scheduledFor !== undefined && prevMs !== nextMs;
    if (
      scheduleChanged &&
      scheduledFor &&
      blog.status === "approved" &&
      blog.publishStatus !== "published"
    ) {
      try {
        const { syncBlogScheduleToWordpress } = await import("../../../../../lib/blogPublishJobs.js");
        await syncBlogScheduleToWordpress(blog, scheduledFor);
        const refreshed = await prisma.blogPost.findUnique({ where: { id }, include: BLOG_INCLUDE });
        return Response.json({ blog: refreshed || blog });
      } catch (err) {
        console.warn(`[blog] admin schedule WP sync failed for ${id}: ${err.message}`);
      }
    }

    return Response.json({ blog });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to update blog." }, { status: error.status || 500 });
  }
}

export async function DELETE(_req, { params }) {
  try {
    await requireAdminRoute(req);
    const { id } = await params;
    await prisma.blogPost.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to delete blog." }, { status: error.status || 500 });
  }
}
