import { setWordpressPostStatus, upsertWordpressPost } from "../wordpressClient.js";

export async function publishViaWordpress(payload, config, blog, options = {}) {
  if (!config?.wordpressUrl || !config?.wordpressUsername || !config?.wordpressAppPassword) {
    const err = new Error("WordPress URL, username, and application password are required.");
    err.skippable = true;
    throw err;
  }

  const existingWpId =
    blog?.externalPostId || blog?.externalId || payload?.wordpress?.id || payload?.meta?.wordpress_id || null;

  const forcePublish = options.forcePublish !== false; // default true for delivery publishes
  const mode = options.mode || (forcePublish ? "publish" : "schedule");

  let result;
  try {
    result = await upsertWordpressPost(config, payload, existingWpId, {
      mode,
      forcePublish: mode === "publish",
      forceSchedule: mode === "schedule" || mode === "future",
    });
  } catch (err) {
    // Last resort for existing WP posts: status-only publish (keeps content already on WP).
    if (mode === "publish" && existingWpId) {
      console.warn(`[wordpress] full upsert failed (${err.message}); trying status-only publish`);
      const status = await setWordpressPostStatus(config, existingWpId, "publish");
      if (["publish", "private"].includes(String(status))) {
        return {
          externalId: String(existingWpId),
          responseBody: JSON.stringify({ id: existingWpId, status }),
          status,
          link: null,
        };
      }
    }
    throw err;
  }

  // Guard: never treat a leftover "future"/"draft" as a successful live publish
  if (mode === "publish" && result.status && !["publish", "private"].includes(String(result.status))) {
    if (existingWpId || result.externalId) {
      const id = existingWpId || result.externalId;
      const status = await setWordpressPostStatus(config, id, "publish");
      if (["publish", "private"].includes(String(status))) {
        return {
          externalId: String(id),
          responseBody: result.responseBody,
          status,
          link: result.link,
        };
      }
    }
    const err = new Error(
      `WordPress returned status "${result.status}" instead of publish (link: ${result.link || "n/a"}).`
    );
    err.skippable = false;
    throw err;
  }

  return {
    externalId: result.externalId,
    responseBody: result.responseBody,
    status: result.status,
    link: result.link,
  };
}
