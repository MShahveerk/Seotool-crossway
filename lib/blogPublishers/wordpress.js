import { upsertWordpressPost } from "../wordpressClient.js";

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

  const result = await upsertWordpressPost(config, payload, existingWpId, {
    mode,
    forcePublish: mode === "publish",
    forceSchedule: mode === "schedule" || mode === "future",
  });

  // Guard: never treat a leftover "future"/"draft" as a successful live publish
  if (mode === "publish" && result.status && !["publish", "private"].includes(String(result.status))) {
    const err = new Error(
      `WordPress returned status "${result.status}" instead of publish (link: ${result.link || "n/a"}).`
    );
    err.skippable = false;
    throw err;
  }

  return { externalId: result.externalId, responseBody: result.responseBody, status: result.status, link: result.link };
}
