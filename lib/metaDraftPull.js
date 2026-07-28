/**
 * Pull scheduled / unpublished Facebook Page posts into the SMM approval queue.
 */
import axios from "axios";
import { Prisma } from "@prisma/client";
import prisma from "./prisma.js";
import { findAssigneesForSite } from "./blogAssignee.js";
import { saveApprovalMediaFromUrl } from "./approvalMedia.js";
import { resolvePostTargetIds } from "./postPayload.js";
import { getSitePostConfig, resolveMetaAccessTokenForPost } from "./postPublishConfig.js";
import { createApprovalQuickActionToken } from "./approvalQuickAction.js";
import { isMetaPageId } from "./siteAccess.js";

const GRAPH = "https://graph.facebook.com/v20.0";

async function resolvePageAccessToken(pageId, userOrPageToken) {
  if (!pageId || !userOrPageToken) return null;
  try {
    const res = await axios.get(`${GRAPH}/${pageId}`, {
      params: { fields: "access_token", access_token: userOrPageToken },
      timeout: 20000,
    });
    return res.data?.access_token || userOrPageToken;
  } catch {
    return userOrPageToken;
  }
}

function pickMediaUrl(post) {
  const attachments = post?.attachments?.data || [];
  for (const att of attachments) {
    if (att?.media?.image?.src) return att.media.image.src;
    if (att?.url) return att.url;
    const subs = att?.subattachments?.data || [];
    for (const sub of subs) {
      if (sub?.media?.image?.src) return sub.media.image.src;
    }
  }
  if (post?.full_picture) return post.full_picture;
  return null;
}

function parseScheduledTime(post) {
  const raw = post?.scheduled_publish_time || post?.created_time;
  if (!raw) return null;
  if (typeof raw === "number" || /^\d+$/.test(String(raw))) {
    const d = new Date(Number(raw) * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function fetchScheduledPosts(pageId, pageToken) {
  const fields = "id,message,scheduled_publish_time,created_time,full_picture,attachments{media,type,url,subattachments}";
  const endpoints = [
    `${GRAPH}/${pageId}/scheduled_posts`,
    `${GRAPH}/${pageId}/promotable_posts`,
  ];

  const posts = [];
  const seen = new Set();

  for (const base of endpoints) {
    try {
      const res = await axios.get(base, {
        params: { fields, access_token: pageToken, limit: 50 },
        timeout: 25000,
      });
      for (const item of res.data?.data || []) {
        if (!item?.id || seen.has(item.id)) continue;
        seen.add(item.id);
        posts.push(item);
      }
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      if (!String(msg).includes("nonexisting field")) {
        console.warn(`[metaDraftPull] ${base}: ${msg}`);
      }
    }
  }

  return posts;
}

async function getSystemUser() {
  return prisma.user.findFirst({
    where: { role: "super_admin", isActive: true },
    select: { id: true, email: true, name: true },
  });
}

async function notifyAssignees({ approval, siteKey, assignee, allApprovers, systemUser, caption }) {
  try {
    const { sendPostApprovalNotification } = await import("./email.js");
    const { collectApprovalEmailRecipients } = await import("./approvalRecipients.js");
    const token = createApprovalQuickActionToken(approval.id);
    const { recipients } = await collectApprovalEmailRecipients({
      siteLink: approval.siteLink || siteKey,
      selectedSite: siteKey,
      creator: systemUser,
      creatorUserId: systemUser.id,
      operatorUser: systemUser,
    });
    const emailApproval = {
      ...approval,
      caption,
      selectedSite: siteKey,
      createdByName: "Meta draft pull",
      createdByEmail: systemUser.email || "",
    };
    for (const recipient of recipients) {
      await sendPostApprovalNotification(recipient.email, emailApproval, recipient, token);
    }
  } catch (err) {
    console.warn("[metaDraftPull] notification failed:", err.message);
  }
}

export async function pullMetaDraftsForSite(siteKey, opts = {}) {
  const config = await getSitePostConfig(siteKey);
  const pageId = config?.facebookPageId || (isMetaPageId(siteKey) ? siteKey : null);

  if (!pageId) {
    const err = new Error("Meta draft pull requires a Facebook Page ID.");
    err.status = 400;
    throw err;
  }

  if (!opts.force && !config?.metaPullEnabled) {
    return { imported: 0, updated: 0, skipped: 0, message: "Meta pull is disabled for this account." };
  }

  const token =
    config?.metaPageAccessToken ||
    (await resolveMetaAccessTokenForPost({ facebookPageId: pageId, siteLink: siteKey, instagramUserId: null }));

  if (!token) {
    const err = new Error("Meta access token is not configured for this page.");
    err.status = 400;
    throw err;
  }

  const pageToken = await resolvePageAccessToken(pageId, token);
  const scheduledPosts = await fetchScheduledPosts(pageId, pageToken);

  const systemUser = await getSystemUser();
  if (!systemUser) {
    const err = new Error("No system user available.");
    err.status = 503;
    throw err;
  }

  const { assignee, allApprovers } = await findAssigneesForSite(siteKey);
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const fbPost of scheduledPosts) {
    const externalId = `meta_fb_${fbPost.id}`;
    const existing = await prisma.approval.findFirst({
      where: { externalId, facebookPageId: pageId },
    });

    const message = String(fbPost.message || "").trim();
    const title = message.split("\n")[0].slice(0, 255) || `Scheduled Meta post ${fbPost.id}`;
    const caption = message.slice(0, 2000);
    const mediaUrl = pickMediaUrl(fbPost);
    const scheduledFor = parseScheduledTime(fbPost);

    if (!mediaUrl) {
      skipped += 1;
      continue;
    }

    if (existing) {
      if (existing.publishStatus === "published") {
        skipped += 1;
        continue;
      }
      const imagePath = await saveApprovalMediaFromUrl(mediaUrl);
      await prisma.approval.update({
        where: { id: existing.id },
        data: {
          title,
          imagePath,
          scheduledFor: scheduledFor ?? existing.scheduledFor,
          status: "pending",
        },
      });
      try {
        await prisma.$executeRaw(Prisma.sql`UPDATE approvals SET caption = ${caption} WHERE id = ${existing.id}`);
      } catch {
        /* legacy */
      }
      updated += 1;
      continue;
    }

    const imagePath = await saveApprovalMediaFromUrl(mediaUrl);
    const { fbPageId, igUserId, siteUrlLink } = resolvePostTargetIds(siteKey, assignee, {
      publishFacebook: true,
      publishInstagram: Boolean(config?.instagramUserId || assignee.instagramUserId),
    });

    const approval = await prisma.approval.create({
      data: {
        title,
        bodyText: "",
        imagePath,
        assigneeId: assignee.id,
        createdById: systemUser.id,
        status: "pending",
        scheduledFor,
        facebookPageId: fbPageId || pageId,
        instagramUserId: igUserId,
        siteLink: siteUrlLink,
        source: "meta_pull",
        externalId,
        publishStatus: "unpublish",
      },
    });

    try {
      await prisma.$executeRaw(Prisma.sql`UPDATE approvals SET caption = ${caption} WHERE id = ${approval.id}`);
    } catch {
      /* legacy */
    }

    await notifyAssignees({
      approval,
      siteKey,
      assignee,
      allApprovers,
      systemUser,
      caption,
    });

    imported += 1;
  }

  if (config) {
    await prisma.sitePostConfig.update({
      where: { siteKey: config.siteKey },
      data: { lastMetaPullAt: new Date() },
    });
  }

  return {
    imported,
    updated,
    skipped,
    fetched: scheduledPosts.length,
    message:
      scheduledPosts.length === 0
        ? "No scheduled Meta posts found for this page."
        : `Imported ${imported}, updated ${updated}, skipped ${skipped} (of ${scheduledPosts.length} fetched).`,
  };
}

export async function runMetaPullForAllSites(logger = console) {
  const configs = await prisma.sitePostConfig.findMany({
    where: { metaPullEnabled: true, enabled: true },
  });

  const results = [];
  for (const config of configs) {
    try {
      const result = await pullMetaDraftsForSite(config.siteKey, { force: true, cronPull: true });
      results.push({ siteKey: config.siteKey, ...result });
      logger.info?.(`Meta pull ${config.siteKey}: ${result.message}`);
    } catch (err) {
      logger.error?.(`Meta pull failed ${config.siteKey}: ${err.message}`);
      results.push({ siteKey: config.siteKey, error: err.message });
    }
  }
  return results;
}
