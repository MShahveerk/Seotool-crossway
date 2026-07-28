import { parseScheduledDate } from "./blogPayload.js";
import { isMetaPageId } from "./siteAccess.js";

export function resolveInboundSiteKey(body = {}, headers = {}) {
  return String(
    body.siteKey ||
      body.site_key ||
      body.facebookPageId ||
      body.facebook_page_id ||
      body.selectedSite ||
      body.siteLink ||
      headers.get?.("x-site-key") ||
      headers.get?.("x-meta-page-id") ||
      ""
  ).trim();
}

export function normalizeInboundPostPayload(body = {}) {
  const title = String(body.title || body.heading || "").trim();
  const caption = String(body.caption || body.message || body.text || "").trim();
  const externalId = body.externalId || body.external_id || body.id ? String(body.externalId || body.external_id || body.id).trim() : null;
  const mediaUrl = String(body.mediaUrl || body.media_url || body.imageUrl || body.image_url || body.videoUrl || body.video_url || "").trim();
  const scheduledFor = parseScheduledDate(body.scheduledFor || body.scheduled_for || body.publishAt || body.publish_at);

  let targetPlatform = String(body.targetPlatform || body.target_platform || "").trim().toLowerCase();
  if (!["facebook", "instagram", "both"].includes(targetPlatform)) {
    targetPlatform = "both";
  }

  const publishFacebook = body.publishFacebook !== false && body.publish_facebook !== false && targetPlatform !== "instagram";
  const publishInstagram = body.publishInstagram !== false && body.publish_instagram !== false && targetPlatform !== "facebook";

  return {
    title,
    caption,
    externalId,
    mediaUrl,
    scheduledFor,
    publishFacebook,
    publishInstagram,
    approveOnAssignment:
      body.approveOnAssignment === true ||
      body.approveOnAssignment === "1" ||
      body.approve_on_assignment === true ||
      body.approve_on_assignment === "1",
  };
}

export function resolvePostTargetIds(siteKey, assignee, { publishFacebook, publishInstagram }) {
  const isMeta = isMetaPageId(siteKey);
  let fbPageId = null;
  let igUserId = null;
  let siteUrlLink = null;

  if (isMeta) {
    fbPageId = publishFacebook ? siteKey === assignee.facebookPageId ? siteKey : assignee.facebookPageId || siteKey : null;
    igUserId = publishInstagram
      ? siteKey === assignee.instagramUserId
        ? siteKey
        : assignee.instagramUserId || null
      : null;
    siteUrlLink = assignee.siteLink || null;
  } else {
    siteUrlLink = siteKey.startsWith("http") ? siteKey : assignee.siteLink || siteKey;
    if (publishFacebook) fbPageId = assignee.facebookPageId || null;
    if (publishInstagram) igUserId = assignee.instagramUserId || null;
  }

  return { fbPageId, igUserId, siteUrlLink };
}

export function getEffectivePostFields(approval, captionOverride = "") {
  const publicBase = String(process.env.PUBLIC_URL || process.env.NEXTAUTH_URL || "").replace(/\/+$/, "");
  const mediaPath = approval.imagePath || "";
  const mediaUrl = mediaPath.startsWith("http")
    ? mediaPath
    : publicBase
      ? `${publicBase}/${String(mediaPath).replace(/^\/+/, "")}`
      : mediaPath;

  return {
    id: approval.id,
    title: approval.userEditedTitle || approval.title,
    caption: approval.userEditedCaption || captionOverride || approval.caption || "",
    mediaUrl,
    mediaPath,
    scheduledFor: approval.scheduledFor,
    facebookPageId: approval.facebookPageId,
    instagramUserId: approval.instagramUserId,
    siteLink: approval.siteLink,
    externalId: approval.externalId,
    source: approval.source,
  };
}
