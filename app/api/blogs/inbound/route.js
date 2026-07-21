import prisma from "../../../../lib/prisma";
import { normalizeSiteOrigin } from "../../../../lib/validation";
import { normalizeInboundPayload, normalizeSiteForMatch } from "../../../../lib/blogPayload.js";
import { findAssigneesForSite, notifyBlogApprovers, createBlogQuickActionToken } from "../../../../lib/blogAssignee.js";
import { getSitePublishConfig } from "../../../../lib/blogPublishConfig.js";
import { saveBlogFeaturedImageFromUrl } from "../../../../lib/blogMedia.js";
import { BLOG_INCLUDE } from "../../../../lib/blogAccess.js";
import { recordBlogRevision } from "../../../../lib/blogRevisions.js";

export const runtime = "nodejs";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,x-blog-secret,x-site-link",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

async function verifyInboundSecret(req, siteLink) {
  const incoming = (req.headers.get("x-blog-secret") || "").trim();
  const globalSecret = (process.env.BLOG_INBOUND_SECRET || "").trim();
  const config = await getSitePublishConfig(siteLink);
  const siteSecret = String(config?.inboundSecret || "").trim();

  if (siteSecret && incoming === siteSecret) return true;
  if (globalSecret && incoming === globalSecret) return true;
  if (!siteSecret && !globalSecret && process.env.NODE_ENV !== "production") return true;
  return false;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const siteLinkRaw = String(body.siteLink || body.site_url || req.headers.get("x-site-link") || "").trim();
    const siteLink = normalizeSiteOrigin(siteLinkRaw) || normalizeSiteForMatch(siteLinkRaw) || siteLinkRaw;

    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400, headers: CORS });

    if (!(await verifyInboundSecret(req, siteLink))) {
      return Response.json({ error: "Unauthorized inbound request." }, { status: 401, headers: CORS });
    }

    const normalized = normalizeInboundPayload(body);

    if (normalized.externalId) {
      const existing = await prisma.blogPost.findFirst({
        where: { siteLink, externalId: normalized.externalId },
      });
      if (existing) {
        const updated = await prisma.blogPost.update({
          where: { id: existing.id },
          data: {
            title: normalized.title,
            slug: normalized.slug,
            excerpt: normalized.excerpt,
            content: normalized.content,
            wpStatus: normalized.wpStatus,
            payload: normalized.payload,
            scheduledFor: normalized.scheduledFor ?? existing.scheduledFor,
            status: existing.publishStatus === "published" ? existing.status : "pending",
            publishStatus: existing.publishStatus,
          },
          include: BLOG_INCLUDE,
        });
        await recordBlogRevision(updated, { action: "inbound_update" });
        return Response.json({ blog: updated, updated: true }, { headers: CORS });
      }
    }

    const { assignee, allApprovers } = await findAssigneesForSite(siteLink);

    let featuredImagePath = null;
    const imageUrl = body.featured_image_url || body.featuredImageUrl || normalized.payload?.featured_media?.url;
    if (imageUrl) {
      try {
        featuredImagePath = await saveBlogFeaturedImageFromUrl(imageUrl);
      } catch {
        featuredImagePath = String(imageUrl);
      }
    }

    if (featuredImagePath) {
      normalized.payload.featured_media = {
        ...(normalized.payload.featured_media || {}),
        url: featuredImagePath,
      };
    }

    const systemUser = await prisma.user.findFirst({
      where: { role: "super_admin", isActive: true },
      select: { id: true, email: true, name: true },
    });

    if (!systemUser) {
      return Response.json({ error: "No system user available to own inbound blog." }, { status: 503, headers: CORS });
    }

    const blog = await prisma.blogPost.create({
      data: {
        siteLink,
        assigneeId: assignee.id,
        createdById: systemUser.id,
        status: "pending",
        source: "inbound",
        externalId: normalized.externalId,
        title: normalized.title,
        slug: normalized.slug,
        excerpt: normalized.excerpt,
        content: normalized.content,
        wpStatus: normalized.wpStatus,
        featuredImagePath,
        featuredImageAlt: body.featured_image_alt || body.featuredImageAlt || null,
        payload: normalized.payload,
        scheduledFor: normalized.scheduledFor,
        publishStatus: "unpublish",
      },
      include: BLOG_INCLUDE,
    });

    await recordBlogRevision(blog, { action: "inbound_create", actorId: systemUser.id });

    const token = createBlogQuickActionToken(blog.id);
    await notifyBlogApprovers({
      blog,
      approvers: allApprovers,
      creator: systemUser,
      token,
      skipped: false,
      operatorUser: systemUser,
    });

    return Response.json({ blog }, { status: 201, headers: CORS });
  } catch (error) {
    return Response.json({ error: error.message || "Inbound blog failed." }, { status: error.status || 500, headers: CORS });
  }
}
