/**
 * When a blog is declined, make sure it cannot go live: revert the linked
 * WordPress post to draft so its scheduled publish is cancelled.
 */
import { pullBlogBackToWordpressDraft } from "./blogWordpressPullback.js";

/**
 * Best effort — a failed revert never blocks the decline itself.
 * Returns a short human-readable note (or null if nothing to do).
 */
export async function revertDeclinedBlogToDraft(blog) {
  const result = await pullBlogBackToWordpressDraft(blog, { clearSchedule: true });
  if (!result.synced) {
    if (result.reason === "no_wp_id" || result.reason === "no_wp_config") return null;
    return `Warning: could not revert WordPress post to draft (${result.reason}).`;
  }
  return `WordPress post ${result.externalId} reverted to draft.`;
}
