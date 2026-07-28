import { publishToFacebookPage, publishToInstagram } from "../metaPublish.mjs";
import { resolveMetaAccessTokenForPost } from "../postPublishConfig.js";

export async function publishPostViaMeta(payload, config, approval) {
  const metaToken = await resolveMetaAccessTokenForPost(approval);
  if (!metaToken) {
    const err = new Error("Meta access token is not configured.");
    err.skippable = true;
    throw err;
  }

  const text = payload.caption || payload.title || "";
  const media = payload.mediaPath;
  const publishFb = config?.publishToFacebook !== false && approval.facebookPageId;
  const publishIg = config?.publishToInstagram !== false && approval.instagramUserId;

  if (!publishFb && !publishIg) {
    const err = new Error("No Meta publish targets configured for this post.");
    err.skippable = true;
    throw err;
  }

  let fbSuccess = false;
  let igSuccess = false;
  const errors = [];
  let externalId = null;

  if (publishFb) {
    try {
      const result = await publishToFacebookPage(approval.facebookPageId, metaToken, media, text);
      fbSuccess = true;
      externalId = result.id || externalId;
    } catch (err) {
      errors.push(`Facebook: ${err.message}`);
    }
  }

  if (publishIg) {
    try {
      const result = await publishToInstagram(approval.instagramUserId, metaToken, media, text);
      igSuccess = true;
      externalId = result.id || externalId;
    } catch (err) {
      errors.push(`Instagram: ${err.message}`);
    }
  }

  if (fbSuccess || igSuccess) {
    const parts = [];
    if (fbSuccess) parts.push("facebook");
    if (igSuccess) parts.push("instagram");
    return {
      externalId: externalId ? String(externalId) : null,
      responseBody: `Published to ${parts.join(" + ")}`,
    };
  }

  throw new Error(errors.join(" | ") || "Meta publish failed.");
}
