/**
 * Create a pending Approval from Post Automation Studio output.
 */
import { Prisma } from "@prisma/client";
import prisma from "../prisma.js";
import { findAssigneesForSite } from "../blogAssignee.js";
import { resolvePostTargetIds } from "../postPayload.js";
import { createApprovalQuickActionToken } from "../approvalQuickAction.js";

export async function createPendingApprovalFromStudio({
  siteLink,
  title,
  caption,
  bodyText = "",
  imagePath,
  backupImagePaths = [],
  platform = "both",
  assigneeInstructions = "",
  createdById = null,
} = {}) {
  const link = String(siteLink || "").trim();
  if (!link) {
    const err = new Error("siteLink is required.");
    err.status = 400;
    throw err;
  }
  const cleanTitle = String(title || "").trim().slice(0, 255);
  const cleanCaption = String(caption || "").trim().slice(0, 2000);
  const cleanImage = String(imagePath || "").trim();
  if (!cleanTitle) {
    const err = new Error("Post title is required.");
    err.status = 400;
    throw err;
  }
  if (!cleanImage) {
    const err = new Error("Post image is required.");
    err.status = 400;
    throw err;
  }

  const { assignee } = await findAssigneesForSite(link);
  const targetPlatform = ["facebook", "instagram", "both"].includes(String(platform || "").toLowerCase())
    ? String(platform).toLowerCase()
    : "both";
  const publishFacebook = targetPlatform !== "instagram";
  const publishInstagram = targetPlatform !== "facebook";
  const { fbPageId, igUserId, siteUrlLink } = resolvePostTargetIds(link, assignee, {
    publishFacebook,
    publishInstagram,
  });

  let creatorId = createdById;
  if (!creatorId) {
    const systemUser = await prisma.user.findFirst({
      where: { role: "super_admin", isActive: true },
      select: { id: true },
    });
    creatorId = systemUser?.id || assignee.id;
  }

  const backups = (Array.isArray(backupImagePaths) ? backupImagePaths : [])
    .map((p) => String(p || "").trim())
    .filter((p) => p && p !== cleanImage)
    .slice(0, 3);

  const approval = await prisma.approval.create({
    data: {
      title: cleanTitle,
      bodyText: String(bodyText || "").slice(0, 20000),
      imagePath: cleanImage,
      backupImagePaths: backups.length ? backups : undefined,
      assigneeId: assignee.id,
      createdById: creatorId,
      status: "pending",
      awaitingAdminReview: false,
      skippedAssigneeReview: false,
      hiddenFromAssignee: false,
      facebookPageId: fbPageId,
      instagramUserId: igUserId,
      siteLink: siteUrlLink || link,
      source: "post_studio",
      publishStatus: "unpublish",
      userEditedInstructions: String(assigneeInstructions || "").trim() || null,
    },
    include: {
      assignee: { select: { id: true, email: true, name: true } },
      createdBy: { select: { id: true, email: true, name: true } },
    },
  });

  try {
    await prisma.$executeRaw(
      Prisma.sql`UPDATE approvals SET caption = ${cleanCaption} WHERE id = ${approval.id}`
    );
  } catch {
    /* caption column may be legacy-raw in some envs */
  }

  try {
    const { sendPostApprovalNotification } = await import("../email.js");
    const { collectApprovalEmailRecipients } = await import("../approvalRecipients.js");
    const token = createApprovalQuickActionToken(approval.id);
    const creator = approval.createdBy || { id: creatorId, name: "Post Studio", email: "" };
    const { recipients } = await collectApprovalEmailRecipients({
      siteLink: siteUrlLink || link,
      selectedSite: link,
      creator,
      creatorUserId: creatorId,
      operatorUser: creator,
    });
    const emailApproval = {
      ...approval,
      caption: cleanCaption,
      selectedSite: link,
      createdByName: creator.name || "Post Studio",
      createdByEmail: creator.email || "",
    };
    for (const recipient of recipients) {
      await sendPostApprovalNotification(recipient.email, emailApproval, recipient, token);
    }
  } catch (err) {
    console.warn(`[postsStudio] approval email failed: ${err.message}`);
  }

  return { ...approval, caption: cleanCaption };
}
