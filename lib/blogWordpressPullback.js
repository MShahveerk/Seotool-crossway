/**
 * Pull a Crossway blog off WordPress's auto-publish path (status → draft).
 * Used when declining or when board-moving out of Approved.
 */
import prisma from "./prisma.js";
import { getSitePublishConfig } from "./blogPublishConfig.js";
import { setWordpressPostStatus, syncWordpressSchedule } from "./wordpressClient.js";
import { logWordpress } from "./wordpressLogger.js";

/**
 * @param {object} blog
 * @param {{ clearSchedule?: boolean, keepDateAsDraft?: boolean }} [opts]
 *   - clearSchedule: also null out Crossway scheduledFor (decline)
 *   - keepDateAsDraft: write the date onto WP as draft (schedule preserved locally, not as future)
 */
export async function pullBlogBackToWordpressDraft(blog, opts = {}) {
  const wpId = blog?.externalPostId || blog?.externalId;
  if (!wpId) return { synced: false, reason: "no_wp_id" };

  const config = await getSitePublishConfig(blog.siteLink);
  if (!config?.wordpressUrl || !config?.wordpressUsername || !config?.wordpressAppPassword) {
    return { synced: false, reason: "no_wp_config" };
  }

  try {
    let newStatus = "draft";
    if (opts.keepDateAsDraft && blog.scheduledFor) {
      await syncWordpressSchedule(config, wpId, blog.scheduledFor, { asDraft: true });
      newStatus = "draft";
    } else {
      newStatus = (await setWordpressPostStatus(config, wpId, "draft")) || "draft";
    }

    const data = { wpStatus: "draft" };
    if (opts.clearSchedule) data.scheduledFor = null;

    await prisma.blogPost.update({
      where: { id: blog.id },
      data,
    });

    logWordpress("pullback_to_draft", {
      blogId: blog.id,
      externalId: wpId,
      siteLink: blog.siteLink,
      wordpressStatus: newStatus,
      clearSchedule: Boolean(opts.clearSchedule),
    });

    return { synced: true, status: newStatus, externalId: String(wpId) };
  } catch (err) {
    logWordpress("pullback_to_draft_failed", {
      blogId: blog.id,
      externalId: wpId,
      siteLink: blog.siteLink,
      error: err.message,
    });
    console.warn(`[blog] WP pullback to draft failed for ${blog.id}: ${err.message}`);
    return { synced: false, reason: err.message };
  }
}
