import {
  setWordpressPostStatus,
  upsertWordpressPost,
  verifyWordpressPostPublished,
} from "../wordpressClient.js";

function isLiveStatus(status) {
  return ["publish", "private"].includes(String(status || ""));
}

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
      await setWordpressPostStatus(config, existingWpId, "publish");
      result = {
        externalId: String(existingWpId),
        responseBody: null,
        status: null,
        link: null,
      };
    } else {
      throw err;
    }
  }

  const wpId = result.externalId || existingWpId;

  if (mode === "publish") {
    if (!wpId) {
      const err = new Error("WordPress publish did not return a post id.");
      err.skippable = false;
      throw err;
    }

    // If write response wasn't clearly live, nudge status once more before verify.
    if (!isLiveStatus(result.status)) {
      try {
        await setWordpressPostStatus(config, wpId, "publish");
      } catch (err) {
        console.warn(`[wordpress] status nudge failed for #${wpId}: ${err.message}`);
      }
    }

    const verified = await verifyWordpressPostPublished(config, wpId);
    if (!verified.ok) {
      const err = new Error(
        `WordPress post #${wpId} is not live after publish (status: ${verified.status || "unknown"}).`
      );
      err.skippable = false;
      throw err;
    }

    return {
      externalId: verified.externalId || String(wpId),
      responseBody: result.responseBody,
      status: verified.status,
      link: verified.link || result.link || null,
      verified: true,
    };
  }

  return {
    externalId: result.externalId,
    responseBody: result.responseBody,
    status: result.status,
    link: result.link,
    verified: false,
  };
}
