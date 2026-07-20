/**
 * Pull WordPress drafts/future posts into the blog approval queue.
 */
import prisma from "./prisma.js";
import { ROLES } from "./rbac.js";
import { buildBlogPayload } from "./blogPayload.js";
import { findAssigneesForSite, notifyBlogApprovers, createBlogQuickActionToken } from "./blogAssignee.js";
import { getSitePublishConfig } from "./blogPublishConfig.js";
import { extractFeaturedFromPost, fetchWordpressPosts, wpPostToCanonical } from "./wordpressClient.js";
import { saveBlogFeaturedImageFromUrl } from "./blogMedia.js";
import { BLOG_INCLUDE } from "./blogAccess.js";
import { recordBlogRevision } from "./blogRevisions.js";

function parsePullStatuses(config) {
  const raw = config?.wordpressPullStatuses;
  if (Array.isArray(raw) && raw.length) return raw.map((s) => String(s).trim()).filter(Boolean);
  return ["draft", "future"];
}

export async function pullWordpressDraftsForSite(siteLink, opts = {}) {
  const config = await getSitePublishConfig(siteLink);
  if (!config?.wordpressUrl || !config?.wordpressUsername || !config?.wordpressAppPassword) {
    const err = new Error("WordPress credentials are not configured for this site.");
    err.status = 400;
    throw err;
  }

  if (!opts.force && !config.wordpressPullEnabled) {
    return { imported: 0, updated: 0, skipped: 0, message: "WordPress pull is disabled for this site." };
  }

  const statuses = opts.statuses || parsePullStatuses(config);
  const wpPosts = await fetchWordpressPosts(config, { statuses, perPage: opts.perPage || 25 });

  const { assignee, allApprovers } = await findAssigneesForSite(siteLink, {
    operatorUser: opts.operatorUser,
  });
  const systemUser = await prisma.user.findFirst({
    where: { role: ROLES.SUPER_ADMIN, isActive: true },
    select: { id: true, email: true, name: true },
  });
  if (!systemUser) {
    const err = new Error("No system user available for WordPress import.");
    err.status = 503;
    throw err;
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const wpPost of wpPosts) {
    const featured = extractFeaturedFromPost(wpPost);
    const canonical = wpPostToCanonical(wpPost, featured);

    if (!canonical.externalId || !canonical.title) {
      skipped += 1;
      continue;
    }

    const existing = await prisma.blogPost.findFirst({
      where: { siteLink: config.siteLink, externalId: canonical.externalId },
    });

    let featuredImagePath = existing?.featuredImagePath || null;
    if (canonical.featuredImageUrl && !featuredImagePath) {
      try {
        featuredImagePath = await saveBlogFeaturedImageFromUrl(canonical.featuredImageUrl);
      } catch {
        featuredImagePath = canonical.featuredImageUrl;
      }
    }

    const payload = buildBlogPayload({
      ...canonical.payload,
      featuredImageUrl: featuredImagePath,
    });

    if (existing) {
      if (existing.publishStatus === "published") {
        skipped += 1;
        continue;
      }
      if (!["pending", "edited"].includes(existing.status)) {
        skipped += 1;
        continue;
      }

      await prisma.blogPost.update({
        where: { id: existing.id },
        data: {
          title: canonical.title,
          slug: canonical.slug,
          excerpt: canonical.excerpt,
          content: canonical.content,
          wpStatus: canonical.wpStatus,
          payload,
          scheduledFor: canonical.scheduledFor ?? existing.scheduledFor,
          featuredImagePath: featuredImagePath || existing.featuredImagePath,
          featuredImageAlt: canonical.featuredImageAlt || existing.featuredImageAlt,
          source: "wordpress_pull",
        },
        include: BLOG_INCLUDE,
      });
      await recordBlogRevision(
        await prisma.blogPost.findUnique({ where: { id: existing.id }, include: BLOG_INCLUDE }),
        { action: "pull_update" }
      );
      updated += 1;
      continue;
    }

    const blog = await prisma.blogPost.create({
      data: {
        siteLink: config.siteLink,
        assigneeId: assignee.id,
        createdById: systemUser.id,
        status: "pending",
        source: "wordpress_pull",
        externalId: canonical.externalId,
        title: canonical.title,
        slug: canonical.slug,
        excerpt: canonical.excerpt,
        content: canonical.content,
        wpStatus: canonical.wpStatus,
        featuredImagePath,
        featuredImageAlt: canonical.featuredImageAlt || null,
        payload,
        scheduledFor: canonical.scheduledFor,
        publishStatus: "unpublish",
      },
      include: BLOG_INCLUDE,
    });

    await recordBlogRevision(blog, { action: "pull_create", actorId: systemUser.id });

    const token = createBlogQuickActionToken(blog.id);
    await notifyBlogApprovers({
      blog,
      approvers: allApprovers,
      creator: systemUser,
      token,
      skipped: false,
    });

    imported += 1;
  }

  await prisma.sitePublishConfig.update({
    where: { siteLink: config.siteLink },
    data: { lastWordpressPullAt: new Date() },
  });

  return { imported, updated, skipped, total: wpPosts.length };
}

export async function runWordpressPullForAllSites(logger = console) {
  const configs = await prisma.sitePublishConfig.findMany({
    where: { wordpressPullEnabled: true, enabled: true },
  });

  const results = [];
  for (const config of configs) {
    try {
      const result = await pullWordpressDraftsForSite(config.siteLink, { force: true });
      results.push({ siteLink: config.siteLink, ...result });
      logger.info?.(`WordPress pull ${config.siteLink}: imported ${result.imported}, updated ${result.updated}`);
    } catch (err) {
      results.push({ siteLink: config.siteLink, error: err.message });
      logger.error?.(`WordPress pull failed ${config.siteLink}: ${err.message}`);
    }
  }

  return results;
}
