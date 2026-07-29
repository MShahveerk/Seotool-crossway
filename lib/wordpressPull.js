/**
 * Pull WordPress drafts/future posts into the blog approval queue.
 */
import prisma from "./prisma.js";
import { ROLES } from "./rbac.js";
import { buildBlogPayload } from "./blogPayload.js";
import { findAssigneesForSite, notifyBlogApprovers, createBlogQuickActionToken } from "./blogAssignee.js";
import { getSitePublishConfig } from "./blogPublishConfig.js";
import { extractFeaturedFromPost, fetchWordpressMediaUrl, fetchWordpressPostById, fetchWordpressPosts, isWordpressScheduledPost, probeWordpressAccess, wpPostToCanonical } from "./wordpressClient.js";
import { resolveWordpressTimezone } from "./wordpressTimezone.js";
import { defaultUnscheduledDraftTimes } from "./timezone.js";
import { logWordpress, logWordpressConfig } from "./wordpressLogger.js";
import { saveBlogFeaturedImageFromUrl } from "./blogMedia.js";
import { BLOG_INCLUDE } from "./blogAccess.js";
import { recordBlogRevision } from "./blogRevisions.js";
import { resolveSiteEquivalents } from "./siteAccess.js";

const CRON_MAX_UNSCHEDULED_DRAFTS = 3;

function wpPostModifiedMs(post) {
  const raw = post?.modified_gmt || post?.date_gmt || post?.modified || post?.date;
  if (!raw) return 0;
  let s = String(raw).trim().replace(" ", "T");
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) s = `${s}Z`;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function parsePullStatuses(config) {
  const raw = config?.wordpressPullStatuses;
  if (Array.isArray(raw) && raw.length) {
    const parsed = raw.map((s) => String(s).trim()).filter(Boolean);
    if (parsed.length) return parsed;
  }
  if (typeof raw === "string" && raw.trim()) {
    const parsed = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (parsed.length) return parsed;
  }
  return ["draft", "future", "pending"];
}

function formatStatusCounts(statusCounts = {}, scheduledDraftCount = 0) {
  const parts = Object.entries(statusCounts)
    .map(([status, count]) => `${status}: ${count}`)
    .join(", ");
  if (scheduledDraftCount > 0) {
    return `${parts} (${scheduledDraftCount} draft(s) with a future publish date)`;
  }
  return parts;
}

export async function pullWordpressDraftsForSite(siteLink, opts = {}) {
  const config = await getSitePublishConfig(siteLink);
  logWordpressConfig("pull_start", {
    siteLink,
    url: config?.wordpressUrl,
    username: config?.wordpressUsername,
    password: config?.wordpressAppPassword,
    passwordSource: "database",
    extra: {
      onlyScheduled: Boolean(opts.onlyScheduled),
      cronPull: Boolean(opts.cronPull),
      includeTrash: Boolean(opts.includeTrash),
      wordpressPostIds: opts.wordpressPostIds || [],
    },
  });

  if (!config?.wordpressUrl || !config?.wordpressUsername || !config?.wordpressAppPassword) {
    const err = new Error("WordPress credentials are not configured for this site.");
    err.status = 400;
    throw err;
  }

  if (!opts.force && !config.wordpressPullEnabled) {
    return { imported: 0, updated: 0, skipped: 0, message: "WordPress pull is disabled for this site." };
  }

  const siteTimezone = await resolveWordpressTimezone(config);
  const maxUnscheduledDrafts = Number.isFinite(opts.maxUnscheduledDrafts)
    ? Math.max(0, opts.maxUnscheduledDrafts)
    : CRON_MAX_UNSCHEDULED_DRAFTS;

  const statuses = [...(opts.statuses || parsePullStatuses(config))];
  if (opts.includeTrash && !statuses.includes("trash")) statuses.push("trash");
  if (opts.cronPull) {
    // Hourly cron: all scheduled (future) posts + unscheduled drafts (capped below).
    statuses.length = 0;
    statuses.push("future", "draft");
  } else if (opts.onlyScheduled) {
    statuses.length = 0;
    statuses.push("future");
  }

  let wpPosts = [];
  let statusCounts = {};
  let scheduledDraftCount = 0;
  let statusFilterBroken = false;
  let accessProbe = null;
  const pullErrors = [];

  if (Array.isArray(opts.wordpressPostIds) && opts.wordpressPostIds.length) {
    for (const rawId of opts.wordpressPostIds) {
      try {
        wpPosts.push(await fetchWordpressPostById(config, rawId));
      } catch (err) {
        pullErrors.push(err.message);
      }
    }
    statusCounts = { by_id: wpPosts.length };
  } else {
    const fetched = await fetchWordpressPosts(config, {
      statuses,
      perPage: opts.perPage || 50,
      maxPages: opts.maxPages || 10,
    });
    wpPosts = fetched.posts;
    statusCounts = fetched.statusCounts;
    scheduledDraftCount = fetched.scheduledDraftCount;
    statusFilterBroken = fetched.statusFilterBroken;
  }

  if (!wpPosts.length && !pullErrors.length && opts.probeAccess) {
    accessProbe = await probeWordpressAccess(config);
  }

  const now = new Date();
  /** @type {Map<string, Date>} externalId → default schedule for unscheduled cron drafts */
  const defaultScheduleByExternalId = new Map();

  if (opts.onlyScheduled && !opts.cronPull) {
    wpPosts = wpPosts.filter(
      (post) => post?.status === "future" || isWordpressScheduledPost(post, now, { siteTimezone })
    );
    scheduledDraftCount = wpPosts.filter(
      (post) => post?.status === "draft" && isWordpressScheduledPost(post, now, { siteTimezone })
    ).length;
  }

  if (opts.cronPull) {
    const scheduled = [];
    const unscheduledDrafts = [];
    for (const post of wpPosts) {
      const scheduledPost =
        post?.status === "future" || isWordpressScheduledPost(post, now, { siteTimezone });
      if (scheduledPost) {
        scheduled.push(post);
      } else if (post?.status === "draft") {
        unscheduledDrafts.push(post);
      }
    }
    unscheduledDrafts.sort((a, b) => wpPostModifiedMs(a) - wpPostModifiedMs(b));

    // Prefer drafts not already in the queue; fill remaining slots with oldest drafts.
    const siteKeysForCap = await resolveSiteEquivalents(prisma, config.siteLink || siteLink);
    const siteLinkKeysForCap = [...new Set([config.siteLink, siteLink, ...siteKeysForCap].filter(Boolean))];
    const existingExternalIds = new Set(
      (
        await prisma.blogPost.findMany({
          where: {
            siteLink: { in: siteLinkKeysForCap },
            externalId: { in: unscheduledDrafts.map((p) => String(p.id)).filter(Boolean) },
            status: { not: "deleted" },
          },
          select: { externalId: true },
        })
      )
        .map((row) => String(row.externalId || ""))
        .filter(Boolean)
    );

    const newDrafts = unscheduledDrafts.filter((p) => !existingExternalIds.has(String(p.id)));
    const alreadyInQueue = unscheduledDrafts.filter((p) => existingExternalIds.has(String(p.id)));
    const selectedUnscheduled = [...newDrafts, ...alreadyInQueue].slice(0, maxUnscheduledDrafts);

    const defaults = defaultUnscheduledDraftTimes(selectedUnscheduled.length, {
      timeZone: siteTimezone,
      now,
    });
    selectedUnscheduled.forEach((post, index) => {
      if (defaults[index]) defaultScheduleByExternalId.set(String(post.id), defaults[index]);
    });

    wpPosts = [...scheduled, ...selectedUnscheduled];
    scheduledDraftCount = scheduled.filter((p) => p?.status === "draft").length;
  }

  const { assignee, allApprovers } = await findAssigneesForSite(siteLink, {
    operatorUser: opts.operatorUser,
  });
  const siteKeys = await resolveSiteEquivalents(prisma, config.siteLink || siteLink);
  const siteLinkKeys = [...new Set([config.siteLink, siteLink, ...siteKeys].filter(Boolean))];
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
    let featured = extractFeaturedFromPost(wpPost);
    if (!featured.url && featured.id) {
      try {
        featured = { ...featured, url: await fetchWordpressMediaUrl(config, featured.id) };
      } catch {
        /* ignore missing media */
      }
    }

    const canonical = wpPostToCanonical(wpPost, featured, { siteTimezone });

    if (!canonical.externalId) {
      skipped += 1;
      continue;
    }

    let existing = await prisma.blogPost.findFirst({
      where: { siteLink: { in: siteLinkKeys }, externalId: canonical.externalId },
    });

    // Rows soft-deleted by the old tombstone behavior: clear them out and
    // re-import the post fresh.
    if (existing && existing.status === "deleted") {
      await prisma.blogPost.delete({ where: { id: existing.id } });
      existing = null;
    }

    let featuredImagePath = existing?.featuredImagePath || null;
    if (!featuredImagePath && (canonical.featuredImageUrl || featured.id)) {
      try {
        featuredImagePath = await saveBlogFeaturedImageFromUrl(canonical.featuredImageUrl, {
          wordpressBase: config.wordpressUrl,
          mediaId: featured.id,
          wpConfig: config,
        });
      } catch (imgErr) {
        console.warn(`[wordpress-pull] featured image failed for WP#${canonical.externalId}: ${imgErr.message}`);
        // Do not store remote WP URLs as featuredImagePath (breaks local preview / publish upload).
        featuredImagePath = null;
      }
    }

    const payload = buildBlogPayload({
      ...canonical.payload,
      featuredImageUrl: featuredImagePath,
    });

    const defaultSchedule = defaultScheduleByExternalId.get(canonical.externalId) || null;
    // Unscheduled cron drafts: ignore WP's non-publish date; keep an existing
    // Crossway schedule if the assignee/admin already set one.
    const scheduledFor = defaultSchedule
      ? existing?.scheduledFor || defaultSchedule
      : canonical.scheduledFor ?? existing?.scheduledFor ?? null;

    if (existing) {
      if (existing.publishStatus === "published") {
        skipped += 1;
        continue;
      }
      if (!["pending", "edited", "approved"].includes(existing.status)) {
        skipped += 1;
        continue;
      }

      const updatedBlog = await prisma.blogPost.update({
        where: { id: existing.id },
        data: {
          title: canonical.title,
          slug: canonical.slug,
          excerpt: canonical.excerpt,
          content: canonical.content,
          // Preserve Crossway-assigned future intent; don't reset to WP draft while scheduled locally.
        wpStatus: defaultSchedule || scheduledFor ? existing.wpStatus || "draft" : canonical.wpStatus,
          payload,
          scheduledFor,
          featuredImagePath: featuredImagePath || existing.featuredImagePath,
          featuredImageAlt: canonical.featuredImageAlt || existing.featuredImageAlt,
          source: "wordpress_pull",
        },
        include: BLOG_INCLUDE,
      });
      await recordBlogRevision(updatedBlog, { action: "pull_update" });

      // Keep WP as draft with the date until Crossway approve (avoids WP auto-publish pre-approval).
      if (scheduledFor && canonical.externalId && (defaultSchedule || opts.syncScheduleToWordpress)) {
        try {
          const { syncWordpressSchedule } = await import("./wordpressClient.js");
          await syncWordpressSchedule(config, canonical.externalId, scheduledFor, { asDraft: true });
        } catch (syncErr) {
          console.warn(
            `[wordpress-pull] schedule sync to WP failed for #${canonical.externalId}: ${syncErr.message}`
          );
        }
      }

      // Pending blogs get approval emails when never notified, or when a manual
      // pull explicitly asks to resend (so a bad first send can be corrected).
      if (
        updatedBlog.status === "pending" &&
        (!updatedBlog.approvalNotifiedAt || opts.resendApprovals)
      ) {
        const existingToken = createBlogQuickActionToken(updatedBlog.id);
        await notifyBlogApprovers({
          blog: updatedBlog,
          approvers: allApprovers,
          creator: systemUser,
          token: existingToken,
          skipped: false,
          operatorUser: opts.operatorUser || systemUser,
        });
      }
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
        // Stay draft on WP until approve; Crossway still holds scheduledFor for the queue.
        wpStatus: scheduledFor ? "draft" : canonical.wpStatus,
        featuredImagePath,
        featuredImageAlt: canonical.featuredImageAlt || null,
        payload,
        scheduledFor,
        publishStatus: "unpublish",
      },
      include: BLOG_INCLUDE,
    });

    await recordBlogRevision(blog, { action: "pull_create", actorId: systemUser.id });

    // Write date onto WP as draft (not future) so WP cannot auto-publish before Crossway approve.
    if (scheduledFor && canonical.externalId) {
      try {
        const { syncWordpressSchedule } = await import("./wordpressClient.js");
        await syncWordpressSchedule(config, canonical.externalId, scheduledFor, { asDraft: true });
      } catch (syncErr) {
        console.warn(
          `[wordpress-pull] schedule sync to WP failed for #${canonical.externalId}: ${syncErr.message}`
        );
      }
    }

    const token = createBlogQuickActionToken(blog.id);
    await notifyBlogApprovers({
      blog,
      approvers: allApprovers,
      creator: systemUser,
      token,
      skipped: false,
      operatorUser: opts.operatorUser || systemUser,
    });

    imported += 1;
  }

  await prisma.sitePublishConfig.update({
    where: { siteLink: config.siteLink },
    data: { lastWordpressPullAt: new Date() },
  });

  const result = {
    imported,
    updated,
    skipped,
    fetched: wpPosts.length,
    statuses,
    statusCounts,
    scheduledDraftCount,
    statusFilterBroken,
    onlyScheduled: Boolean(opts.onlyScheduled),
    cronPull: Boolean(opts.cronPull),
    unscheduledDraftDefaults: defaultScheduleByExternalId.size,
    total: wpPosts.length,
    message:
      pullErrors.length
        ? pullErrors.join(" ")
        : wpPosts.length === 0
        ? [
            `WordPress returned 0 matching posts (${formatStatusCounts(statusCounts, scheduledDraftCount)}).`,
            accessProbe?.diagnosis ||
              (statusFilterBroken
                ? "The site may be caching REST API responses without query strings — redeploy this fix, then pull again."
                : "Confirm the post is a standard blog post (not a page) with status draft, future, pending, or trash in wp-admin."),
          ].join(" ")
        : [
            `WordPress counts — ${formatStatusCounts(statusCounts, scheduledDraftCount)}.`,
            statusFilterBroken ? "Used post body status (CDN was ignoring status filters)." : null,
          ]
            .filter(Boolean)
            .join(" "),
    diagnosis: accessProbe?.diagnosis || null,
    accessProbe,
    pullErrors,
  };

  logWordpress("pull_complete", {
    siteLink,
    ...result,
  });

  return result;
}

/**
 * List WordPress posts that can be pulled (no import). Used by the manual chooser UI.
 */
export async function listWordpressPullCandidates(siteLink, opts = {}) {
  const config = await getSitePublishConfig(siteLink);
  if (!config?.wordpressUrl || !config?.wordpressUsername || !config?.wordpressAppPassword) {
    const err = new Error("WordPress credentials are not configured for this site.");
    err.status = 400;
    throw err;
  }

  const siteTimezone = await resolveWordpressTimezone(config);
  const statuses = Array.isArray(opts.statuses) && opts.statuses.length
    ? opts.statuses
    : parsePullStatuses(config);

  let fetchStatuses = [...statuses];
  if (opts.onlyScheduled) fetchStatuses = ["future", "draft"];

  const fetched = await fetchWordpressPosts(config, {
    statuses: fetchStatuses,
    perPage: opts.perPage || 50,
    maxPages: opts.maxPages || 6,
  });

  let posts = fetched.posts;
  if (opts.onlyScheduled) {
    const now = new Date();
    posts = posts.filter(
      (post) => post?.status === "future" || isWordpressScheduledPost(post, now, { siteTimezone })
    );
  }

  const siteKeys = await resolveSiteEquivalents(prisma, config.siteLink || siteLink);
  const siteLinkKeys = [...new Set([config.siteLink, siteLink, ...siteKeys].filter(Boolean))];
  const existing = await prisma.blogPost.findMany({
    where: {
      siteLink: { in: siteLinkKeys },
      externalId: { in: posts.map((p) => String(p.id)).filter(Boolean) },
      status: { not: "deleted" },
    },
    select: { externalId: true, status: true, publishStatus: true, scheduledFor: true, title: true },
  });
  const existingById = new Map(existing.map((row) => [String(row.externalId), row]));

  const candidates = [];
  for (const wpPost of posts) {
    // Preview uses _embed only — avoid N+1 media GETs that stall the chooser.
    const featured = extractFeaturedFromPost(wpPost);
    const canonical = wpPostToCanonical(wpPost, featured, { siteTimezone });
    const inQueue = existingById.get(String(canonical.externalId)) || null;
    const scheduled =
      wpPost?.status === "future" || isWordpressScheduledPost(wpPost, new Date(), { siteTimezone });

    candidates.push({
      externalId: String(canonical.externalId),
      title: canonical.title,
      excerpt: canonical.excerpt,
      status: wpPost?.status || canonical.wpStatus,
      wpStatus: canonical.wpStatus,
      scheduledFor: canonical.scheduledFor,
      isScheduled: scheduled,
      modifiedAt: wpPost?.modified_gmt || wpPost?.modified || null,
      featuredImageUrl: featured.url || null,
      link: wpPost?.link || null,
      alreadyInQueue: Boolean(inQueue),
      crosswayStatus: inQueue?.status || null,
      crosswayPublishStatus: inQueue?.publishStatus || null,
    });
  }

  candidates.sort((a, b) => {
    const ta = a.modifiedAt ? new Date(a.modifiedAt).getTime() : 0;
    const tb = b.modifiedAt ? new Date(b.modifiedAt).getTime() : 0;
    return tb - ta;
  });

  let diagnosis = null;
  if (!candidates.length) {
    const countBits = Object.entries(fetched.statusCounts || {})
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    diagnosis = fetched.statusFilterBroken
      ? "WordPress status filtering looked unreliable. Try Include trash, Pull by post ID, or Show diagnostics."
      : countBits
        ? `WordPress responded but no posts matched (${countBits}).`
        : "WordPress returned no draft/future/pending posts for this site.";
  }

  return {
    candidates,
    statusCounts: fetched.statusCounts,
    statuses: fetchStatuses,
    siteTimezone,
    total: candidates.length,
    diagnosis,
    statusFilterBroken: Boolean(fetched.statusFilterBroken),
  };
}

export async function runWordpressPullForAllSites(logger = console) {
  const configs = await prisma.sitePublishConfig.findMany({
    where: { wordpressPullEnabled: true, enabled: true },
  });

  const results = [];
  for (const config of configs) {
    try {
      // Cron: all scheduled posts + up to 3 unscheduled drafts (default 11:59 / next-day 12:59).
      const result = await pullWordpressDraftsForSite(config.siteLink, {
        force: true,
        cronPull: true,
        maxUnscheduledDrafts: CRON_MAX_UNSCHEDULED_DRAFTS,
      });
      results.push({ siteLink: config.siteLink, ...result });
      logger.info?.(
        `WordPress pull ${config.siteLink}: imported ${result.imported}, updated ${result.updated}` +
          (result.unscheduledDraftDefaults
            ? `, unscheduled drafts slotted: ${result.unscheduledDraftDefaults}`
            : "")
      );
    } catch (err) {
      results.push({ siteLink: config.siteLink, error: err.message });
      logger.error?.(`WordPress pull failed ${config.siteLink}: ${err.message}`);
    }
  }

  return results;
}
