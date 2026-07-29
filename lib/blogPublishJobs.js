import prisma from "./prisma.js";
import { isScheduleDue } from "./approvalSchedule.js";
import { publishBlogPost } from "./blogPublishers/index.js";
import { getSitePublishConfig } from "./blogPublishConfig.js";
import { syncWordpressSchedule, verifyWordpressPostPublished } from "./wordpressClient.js";

const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
};

/** Cron look-ahead so a due post isn't stuck until the next full minute tick. */
const DUE_LOOKAHEAD_MS = 45_000;

async function adoptWordpressIfAlreadyLive(blog) {
  const wpId = blog.externalPostId || blog.externalId;
  if (!wpId) return null;
  const config = await getSitePublishConfig(blog.siteLink);
  if (!config?.wordpressUrl) return null;
  try {
    const verified = await verifyWordpressPostPublished(config, wpId);
    if (!verified.ok) return null;
    return {
      success: true,
      method: "wordpress",
      externalId: verified.externalId,
      link: verified.link,
      verified: true,
      errors: [],
      adopted: true,
    };
  } catch {
    return null;
  }
}

function canSendPublishEmail(blog, result) {
  if (!result?.success) return false;
  // WP-linked blogs: only email after verified live WordPress publish.
  const wpLinked = Boolean(blog?.externalId || blog?.externalPostId || blog?.source === "wordpress_pull");
  if (wpLinked) {
    return result.method === "wordpress" && result.verified === true;
  }
  return true;
}

async function markPublishResult(blog, result, loggerIn) {
  const finalStatus = result.success ? "published" : "failed";
  await prisma.blogPost.update({
    where: { id: blog.id },
    data: {
      status: blog.status === "edited" ? "approved" : blog.status,
      publishStatus: finalStatus,
      publishError: result.success ? null : (result.errors || []).join(" | "),
      externalPostId: result.externalId || undefined,
      wpStatus: result.success ? "publish" : blog.wpStatus,
    },
  });

  if (canSendPublishEmail(blog, result)) {
    try {
      const { sendBlogPublishNotification } = await import("./email.js");
      await sendBlogPublishNotification(blog, result.method, result.externalId, {
        link: result.link || null,
      });
    } catch (err) {
      loggerIn.error(`Blog publish email failed for ${blog.id}: ${err.message}`);
    }
  } else if (result.success) {
    loggerIn.info(
      `Blog ${blog.id} published via ${result.method || "unknown"} — skipped publish email (not a verified WordPress live publish).`
    );
  }

  loggerIn.info(`Blog ${blog.id} marked as ${finalStatus} via ${result.method || "none"}.`);
  return finalStatus;
}

export async function runScheduledBlogPublish(loggerIn = logger) {
  const horizon = new Date(Date.now() + DUE_LOOKAHEAD_MS);
  // Include prior "failed" rows so a transient WP error can recover next minute
  // instead of leaving the card stuck in Failed forever.
  // Look ahead slightly so cron + WP future stay aligned within ~1 minute.
  const due = await prisma.blogPost.findMany({
    where: {
      status: "approved",
      publishStatus: { in: ["unpublish", "failed"] },
      scheduledFor: { lte: horizon, not: null },
    },
    include: { assignee: { select: { id: true, email: true, name: true } } },
  });

  if (!due.length) return { processed: 0 };

  loggerIn.info(`Found ${due.length} blog(s) ready to publish.`);

  for (const blog of due) {
    try {
      // WP may have already fired its own `future` job — adopt without rewriting the public date.
      let result = await adoptWordpressIfAlreadyLive(blog);
      if (!result) {
        result = await publishBlogPost(blog, {
          forcePublish: true,
          preferWordpress: true,
          mode: "publish",
        });
      } else {
        loggerIn.info(`Blog ${blog.id} already live on WordPress — adopting without rewrite.`);
      }

      // One immediate retry for transient TLS / WP blips
      if (!result.success) {
        const transient = (result.errors || []).some((e) =>
          /transient|TLS|ECONN|ETIMEDOUT|socket|aborted|503|502|429/i.test(String(e))
        );
        if (transient) {
          loggerIn.info(`Retrying blog ${blog.id} after transient publish error…`);
          await new Promise((r) => setTimeout(r, 1500));
          result =
            (await adoptWordpressIfAlreadyLive(blog)) ||
            (await publishBlogPost(blog, {
              forcePublish: true,
              preferWordpress: true,
              mode: "publish",
            }));
        }
      }

      await markPublishResult(blog, result, loggerIn);
    } catch (err) {
      loggerIn.error(`Blog publish failed ${blog.id}: ${err.message}`);
      await prisma.blogPost.update({
        where: { id: blog.id },
        data: { publishStatus: "failed", publishError: err.message },
      });
    }
  }

  return { processed: due.length };
}

export async function publishBlogNow(blogId, loggerIn = logger) {
  const blog = await prisma.blogPost.findUnique({
    where: { id: blogId },
    include: { assignee: { select: { id: true, email: true, name: true } } },
  });

  if (!blog) {
    const err = new Error("Blog not found.");
    err.status = 404;
    throw err;
  }

  if (blog.publishStatus === "published") {
    const err = new Error("Blog is already published.");
    err.status = 400;
    throw err;
  }

  if (!["approved", "edited"].includes(blog.status)) {
    const err = new Error("Blog must be approved before publishing.");
    err.status = 400;
    throw err;
  }

  const result = await publishBlogPost(blog, {
    forcePublish: true,
    preferWordpress: true,
    mode: "publish",
  });

  await prisma.blogPost.update({
    where: { id: blog.id },
    data: {
      status: blog.status === "edited" ? "approved" : blog.status,
      publishStatus: result.success ? "published" : "failed",
      publishError: result.success ? null : result.errors.join(" | "),
      externalPostId: result.externalId || undefined,
      wpStatus: result.success ? "publish" : blog.wpStatus,
      scheduledFor: blog.scheduledFor || new Date(),
    },
  });

  if (canSendPublishEmail(blog, result)) {
    try {
      const { sendBlogPublishNotification } = await import("./email.js");
      await sendBlogPublishNotification(blog, result.method, result.externalId, {
        link: result.link || null,
      });
    } catch (err) {
      loggerIn.error(`Blog publish email failed for ${blog.id}: ${err.message}`);
    }
  }

  return {
    success: result.success,
    method: result.method,
    externalId: result.externalId,
    errors: result.errors,
    link: result.link,
    verified: result.verified,
  };
}

/**
 * Write Crossway schedule onto WordPress.
 * Due schedules → live publish; future schedules → WP `future` via date_gmt only.
 */
export async function syncBlogScheduleToWordpress(blog, scheduledFor, { publishIfDue = true } = {}) {
  const wpId = blog.externalPostId || blog.externalId;
  if (!wpId || !scheduledFor) return { synced: false, reason: "missing_id_or_date" };
  const config = await getSitePublishConfig(blog.siteLink);
  if (!config?.wordpressUrl) return { synced: false, reason: "no_wp_config" };

  if (publishIfDue && isScheduleDue(scheduledFor) && ["approved", "edited"].includes(blog.status)) {
    if (blog.publishStatus !== "published") {
      const published = await publishBlogNow(blog.id);
      return {
        synced: Boolean(published?.success),
        published: true,
        status: published?.success ? "publish" : null,
        externalId: published?.externalId || wpId,
        reason: published?.success ? undefined : (published?.errors || []).join(" | "),
      };
    }
    return { synced: true, published: true, status: "publish", externalId: wpId };
  }

  try {
    const result = await syncWordpressSchedule(config, wpId, scheduledFor, { asDraft: false });
    await prisma.blogPost.update({
      where: { id: blog.id },
      data: { wpStatus: result?.status || "future", publishError: null },
    });
    return { synced: true, status: result?.status, externalId: result?.externalId };
  } catch (err) {
    console.warn(`[blog] WP schedule sync failed for ${blog.id}: ${err.message}`);
    return { synced: false, reason: err.message };
  }
}
