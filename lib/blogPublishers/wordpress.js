import { upsertWordpressPost } from "../wordpressClient.js";

export async function publishViaWordpress(payload, config, blog) {
  if (!config?.wordpressUrl || !config?.wordpressUsername || !config?.wordpressAppPassword) {
    const err = new Error("WordPress URL, username, and application password are required.");
    err.skippable = true;
    throw err;
  }

  const existingWpId =
    blog?.externalPostId || blog?.externalId || payload?.wordpress?.id || payload?.meta?.wordpress_id || null;

  const result = await upsertWordpressPost(config, payload, existingWpId);
  return { externalId: result.externalId, responseBody: result.responseBody };
}
