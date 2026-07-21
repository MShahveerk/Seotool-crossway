/**
 * When a blog is declined, make sure it cannot go live: revert the linked
 * WordPress post to draft so its scheduled publish is cancelled.
 */
import prisma from "./prisma.js";
import { getSitePublishConfig } from "./blogPublishConfig.js";
import { setWordpressPostStatus } from "./wordpressClient.js";
import { logWordpress } from "./wordpressLogger.js";

const WORDPRESS_SOURCES = new Set(["wordpress_pull", "inbound"]);

/**
 * Best effort — a failed revert never blocks the decline itself.
 * Returns a short human-readable note (or null if nothing to do).
 */
export async function revertDeclinedBlogToDraft(blog) {
  if (!blog?.externalId || !WORDPRESS_SOURCES.has(blog.source)) return null;

  try {
    const config = await getSitePublishConfig(blog.siteLink);
    if (!config?.wordpressUrl || !config?.wordpressUsername || !config?.wordpressAppPassword) {
      return null;
    }

    const newStatus = await setWordpressPostStatus(config, blog.externalId, "draft");
    await prisma.blogPost.update({
      where: { id: blog.id },
      data: { wpStatus: "draft", scheduledFor: null },
    });
    logWordpress("decline_revert_to_draft", {
      blogId: blog.id,
      externalId: blog.externalId,
      siteLink: blog.siteLink,
      wordpressStatus: newStatus,
    });
    return `WordPress post ${blog.externalId} reverted to draft.`;
  } catch (err) {
    logWordpress("decline_revert_failed", {
      blogId: blog.id,
      externalId: blog.externalId,
      siteLink: blog.siteLink,
      error: err.message,
    });
    console.error(`[blog] could not revert WordPress post ${blog.externalId} to draft: ${err.message}`);
    return `Warning: could not revert WordPress post to draft (${err.message}).`;
  }
}
