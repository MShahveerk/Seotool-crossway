import {
  getSitePostConfigForApproval,
  parsePostDeliveryChain,
} from "../postPublishConfig.js";
import { getEffectivePostFields } from "../postPayload.js";
import { fetchCaptionMapByApprovalIds, mergeCaptionFieldsIntoApprovals } from "../approvalCaptionMerge.js";
import prisma from "../prisma.js";
import { publishPostViaMeta } from "./meta.js";
import { publishPostViaWebhook } from "./webhook.js";
import { publishPostViaApi } from "./api.js";
import { publishPostViaEmail } from "./email.js";

const HANDLERS = {
  meta: publishPostViaMeta,
  webhook: publishPostViaWebhook,
  api: publishPostViaApi,
  email: publishPostViaEmail,
};

async function loadApprovalWithCaption(approvalId) {
  const approval = await prisma.approval.findUnique({
    where: { id: approvalId },
    include: { assignee: { select: { id: true, email: true, name: true, facebookPageId: true, instagramUserId: true } } },
  });
  if (!approval) return null;
  const captionMap = await fetchCaptionMapByApprovalIds(prisma, [approval.id]);
  const [merged] = mergeCaptionFieldsIntoApprovals([approval], captionMap);
  return merged;
}

/**
 * Try delivery chain until one succeeds.
 */
export async function publishApprovalPost(approval) {
  let config = await getSitePostConfigForApproval(approval);
  if (!config) {
    config = {
      enabled: true,
      deliveryChain: ["meta"],
      publishToFacebook: true,
      publishToInstagram: true,
    };
  } else if (!config.enabled) {
    return { success: false, errors: ["Post publishing is disabled for this account."] };
  }

  const payload = getEffectivePostFields(approval, approval.caption);
  const chain = parsePostDeliveryChain(config);
  const errors = [];

  for (const method of chain) {
    const handler = HANDLERS[method];
    if (!handler) {
      errors.push(`${method}: unknown delivery method`);
      continue;
    }

    try {
      const result =
        method === "meta" || method === "email"
          ? await handler(payload, config, approval)
          : await handler(payload, config);
      return { success: true, method, externalId: result.externalId, errors, responseBody: result.responseBody };
    } catch (err) {
      const msg = `${method}: ${err.message}`;
      errors.push(msg);
    }
  }

  return { success: false, errors };
}

export async function runScheduledPostPublish(logger = console) {
  const now = new Date();
  const due = await prisma.approval.findMany({
    where: {
      status: "approved",
      publishStatus: "unpublish",
      scheduledFor: { lte: now, not: null },
    },
    include: {
      assignee: { select: { id: true, email: true, name: true, role: true, facebookPageId: true, instagramUserId: true } },
    },
  });

  if (!due.length) return { processed: 0 };

  logger.info?.(`Found ${due.length} post(s) ready to publish.`);

  const captionMap = await fetchCaptionMapByApprovalIds(
    prisma,
    due.map((p) => p.id)
  );
  const posts = mergeCaptionFieldsIntoApprovals(due, captionMap);

  for (const post of posts) {
    try {
      const result = await publishApprovalPost(post);
      const finalStatus = result.success ? "published" : "failed";
      const updatedPost = await prisma.approval.update({
        where: { id: post.id },
        data: {
          publishStatus: finalStatus,
          publishError: result.success ? null : result.errors.join(" | "),
        },
        include: {
          assignee: { select: { id: true, email: true, name: true, role: true } },
        },
      });

      if (finalStatus === "published") {
        try {
          const { sendPostStatusChangeNotification } = await import("../email.js");
          const systemUser = { name: "System Publisher", email: "scheduler@crossway-tool.com" };
          await sendPostStatusChangeNotification(updatedPost, systemUser, "published", result.method || "");
        } catch (err) {
          logger.error?.(`Publish notification failed for ${post.id}: ${err.message}`);
        }
      }

      logger.info?.(`Post ${post.id} marked as ${finalStatus} via ${result.method || "none"}.`);
    } catch (err) {
      logger.error?.(`Post publish failed ${post.id}: ${err.message}`);
      await prisma.approval.update({
        where: { id: post.id },
        data: { publishStatus: "failed", publishError: err.message },
      });
    }
  }

  return { processed: due.length };
}

export async function publishApprovalNow(approvalId) {
  const approval = await loadApprovalWithCaption(approvalId);
  if (!approval) {
    const err = new Error("Approval not found.");
    err.status = 404;
    throw err;
  }
  if (approval.publishStatus === "published") {
    const err = new Error("Post is already published.");
    err.status = 400;
    throw err;
  }
  if (approval.status !== "approved") {
    const err = new Error("Post must be approved before publishing.");
    err.status = 400;
    throw err;
  }

  const result = await publishApprovalPost(approval);
  const finalStatus = result.success ? "published" : "failed";
  await prisma.approval.update({
    where: { id: approval.id },
    data: {
      publishStatus: finalStatus,
      publishError: result.success ? null : result.errors.join(" | "),
    },
  });

  return { ...result, publishStatus: finalStatus };
}
