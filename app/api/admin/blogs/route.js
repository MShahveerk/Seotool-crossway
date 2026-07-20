import { requirePermission } from "../../../../lib/middleware/auth";
import prisma from "../../../../lib/prisma";
import { PERMISSIONS } from "../../../../lib/rbac";
import { buildBlogPayload, parseScheduledDate, parseSeoMetaInput } from "../../../../lib/blogPayload.js";
import { findAssigneesForSite, notifyBlogApprovers, createBlogQuickActionToken } from "../../../../lib/blogAssignee.js";
import { saveBlogFeaturedImage } from "../../../../lib/blogMedia.js";
import { BLOG_INCLUDE } from "../../../../lib/blogAccess.js";
import { recordBlogRevision } from "../../../../lib/blogRevisions.js";
import { resolveSiteEquivalents } from "../../../../lib/siteAccess.js";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    await requirePermission(PERMISSIONS.VIEW_ALL_DATA);
    const site = req.nextUrl.searchParams.get("site") || req.nextUrl.searchParams.get("url") || "";
    let where = {};
    if (site) {
      const siteKeys = await resolveSiteEquivalents(prisma, site);
      where = { siteLink: { in: siteKeys.length ? siteKeys : [site] } };
    }
    const blogs = await prisma.blogPost.findMany({
      where,
      include: BLOG_INCLUDE,
      orderBy: [{ scheduledFor: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
    return Response.json({ blogs });
  } catch (error) {
    const status = error.status || 500;
    return Response.json({ error: error.message || "Failed to list blogs." }, { status });
  }
}

export async function POST(req) {
  try {
    const session = await requirePermission(PERMISSIONS.VIEW_ALL_DATA);
    const contentType = req.headers.get("content-type") || "";
    let fields = {};
    let featuredFile = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      fields = {
        title: form.get("title"),
        content: form.get("content"),
        excerpt: form.get("excerpt"),
        slug: form.get("slug"),
        selectedSite: form.get("selectedSite"),
        scheduledFor: form.get("scheduledFor"),
        wpStatus: form.get("wpStatus") || form.get("status"),
        categories: form.get("categories"),
        tags: form.get("tags"),
        approveOnAssignment: form.get("approveOnAssignment"),
        featuredImageAlt: form.get("featuredImageAlt"),
        seoTitle: form.get("seoTitle"),
        metaDescription: form.get("metaDescription"),
        focusKeyword: form.get("focusKeyword"),
      };
      featuredFile = form.get("featuredImage") || form.get("image");
    } else {
      fields = await req.json();
    }

    const title = String(fields.title || "").trim();
    const content = String(fields.content || "").trim();
    const selectedSite = String(fields.selectedSite || fields.siteLink || "").trim();

    if (!title) return Response.json({ error: "Title is required." }, { status: 400 });
    if (!content) return Response.json({ error: "Content is required." }, { status: 400 });
    if (!selectedSite) return Response.json({ error: "Selected site is required." }, { status: 400 });

    const approveOnAssignment =
      fields.approveOnAssignment === true ||
      fields.approveOnAssignment === "1" ||
      fields.approveOnAssignment === "true" ||
      fields.approveOnAssignment === "on";

    const scheduledFor = parseScheduledDate(fields.scheduledFor || fields.date);
    let categories = [];
    let tags = [];
    try {
      categories = fields.categories ? JSON.parse(String(fields.categories)) : [];
    } catch {
      categories = String(fields.categories || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    try {
      tags = fields.tags ? JSON.parse(String(fields.tags)) : [];
    } catch {
      tags = String(fields.tags || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const { assignee, allApprovers, siteUrlLink } = await findAssigneesForSite(selectedSite, {
      operatorUser: session.user,
    });

    let featuredImagePath = null;
    if (featuredFile && typeof featuredFile !== "string" && featuredFile.size) {
      featuredImagePath = await saveBlogFeaturedImage(featuredFile);
    } else if (fields.featuredImageUrl) {
      featuredImagePath = String(fields.featuredImageUrl).trim();
    }

    const payload = buildBlogPayload({
      title,
      content,
      excerpt: fields.excerpt,
      slug: fields.slug,
      status: fields.wpStatus || "draft",
      date: scheduledFor,
      categories,
      tags,
      featuredImageAlt: fields.featuredImageAlt,
      featuredImageUrl: featuredImagePath,
      seoTitle: fields.seoTitle,
      metaDescription: fields.metaDescription,
      focusKeyword: fields.focusKeyword,
      meta: fields.meta,
    });

    const now = new Date();
    const blog = await prisma.blogPost.create({
      data: {
        siteLink: siteUrlLink,
        assigneeId: assignee.id,
        createdById: session.user.id,
        status: approveOnAssignment ? "approved" : "pending",
        source: "manual",
        title,
        slug: payload.slug,
        excerpt: payload.excerpt,
        content,
        wpStatus: payload.status,
        featuredImagePath,
        featuredImageAlt: String(fields.featuredImageAlt || "").trim() || null,
        payload,
        scheduledFor,
        lastAction: approveOnAssignment ? "approve" : null,
        respondedAt: approveOnAssignment ? now : null,
        skippedAssigneeReview: approveOnAssignment,
        publishStatus: "unpublish",
      },
      include: BLOG_INCLUDE,
    });

    await recordBlogRevision(blog, { action: "create", actorId: session.user.id });

    const token = createBlogQuickActionToken(blog.id);
    await notifyBlogApprovers({
      blog,
      approvers: allApprovers,
      creator: session.user,
      token,
      skipped: approveOnAssignment,
    });

    return Response.json({ blog }, { status: 201 });
  } catch (error) {
    const status = error.status || 500;
    return Response.json({ error: error.message || "Failed to create blog." }, { status });
  }
}
