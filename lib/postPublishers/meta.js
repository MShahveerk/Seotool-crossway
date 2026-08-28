import { publishToFacebookPage, publishToInstagram, deleteFacebookPost, deleteInstagramMedia, exchangePageAccessToken } from "../metaPublish.mjs";
import { resolveMetaAccessTokenForPost } from "../postPublishConfig.js";
import { resolveMetaPublishTargets } from "../metaPublishTargets.js";
import { encodeMetaExternalIds, parseMetaExternalIds } from "../metaExternalIds.js";

export async function publishPostViaMeta(payload, config, approval) {
  const metaToken = await resolveMetaAccessTokenForPost(approval);
  if (!metaToken) {
    const err = new Error("Meta access token is not configured.");
    err.skippable = true;
    throw err;
  }

  const targets = await resolveMetaPublishTargets(approval, config, { token: metaToken });
  if (targets.igWanted && targets.igMissing && targets.facebookPageId) {
    const pageToken = await exchangePageAccessToken(targets.facebookPageId, metaToken);
    if (pageToken) {
      const again = await resolveMetaPublishTargets(approval, config, { token: pageToken });
      if (again.instagramUserId) {
        targets.instagramUserId = again.instagramUserId;
        targets.publishIg = true;
        targets.igMissing = false;
      }
    }
  }
  const text = payload.caption || payload.title || "";
  const media = payload.mediaPath;

  if (!targets.publishFb && !targets.publishIg) {
    const err = new Error(
      targets.igMissing
        ? "Instagram is turned on for this account but no Instagram user id was found on the Page."
        : "No Meta publish targets configured for this post."
    );
    err.skippable = true;
    throw err;
  }

  if (targets.igWanted && targets.igMissing) {
    console.log("[INFO] Instagram publish is on but no IG account id was resolved", {
      pageId: targets.facebookPageId,
      siteLink: approval.siteLink,
    });
  }

  let fbSuccess = false;
  let igSuccess = false;
  const errors = [];
  let facebookId = null;
  let instagramId = null;

  if (targets.publishFb) {
    try {
      const result = await publishToFacebookPage(targets.facebookPageId, metaToken, media, text);
      fbSuccess = true;
      facebookId = result.id || result.postId || result.photoId || null;
    } catch (err) {
      errors.push(`Facebook: ${err.message}`);
    }
  }

  if (targets.publishIg) {
    try {
      const result = await publishToInstagram(targets.instagramUserId, metaToken, media, text, {
        pageId: targets.facebookPageId,
      });
      igSuccess = true;
      instagramId = result.id || null;
    } catch (err) {
      errors.push(`Instagram: ${err.message}`);
    }
  } else if (targets.igWanted) {
    errors.push("Instagram: skipped because no Instagram account id was resolved for this Page.");
  }

  if (fbSuccess || igSuccess) {
    const parts = [];
    if (fbSuccess) parts.push("facebook");
    if (igSuccess) parts.push("instagram");
    return {
      externalId: encodeMetaExternalIds({ facebookId, instagramId }),
      facebookPageId: targets.facebookPageId,
      instagramUserId: targets.instagramUserId,
      responseBody: `Published to ${parts.join(" + ")}`,
      errors,
      partial: Boolean(errors.length),
    };
  }

  throw new Error(errors.join(" | ") || "Meta publish failed.");
}

export async function unpublishPostFromMeta(approval) {
  const metaToken = await resolveMetaAccessTokenForPost(approval);
  const ids = parseMetaExternalIds(approval?.externalId);
  if (!ids.facebookId && !ids.instagramId) {
    return { attempted: false, deleted: false, errors: [], reason: "no_external_id" };
  }
  if (!metaToken) {
    return {
      attempted: true,
      deleted: false,
      errors: ["Meta access token is not configured."],
      reason: "no_token",
    };
  }

  const errors = [];
  let deleted = false;

  if (ids.facebookId) {
    const result = await deleteFacebookPost(approval.facebookPageId, metaToken, ids.facebookId);
    if (result.ok) deleted = true;
    else if (result.error) errors.push(`Facebook: ${result.error}`);
  }

  if (ids.instagramId) {
    const result = await deleteInstagramMedia(approval.facebookPageId, metaToken, ids.instagramId);
    if (result.ok) deleted = true;
    else if (result.error) errors.push(`Instagram: ${result.error}`);
  }

  return {
    attempted: true,
    deleted: deleted && errors.length === 0,
    partial: deleted && errors.length > 0,
    errors,
    reason: errors.length ? errors.join(" | ") : null,
  };
}
