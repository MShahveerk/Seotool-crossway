import prisma from "./prisma.js";
import { createApprovalQuickActionToken } from "./approvalQuickAction.js";
import { createBlogQuickActionToken, notifyBlogApprovers } from "./blogAssignee.js";
import { shouldNotifyApprovalOnMove } from "./boardMoveEffects.js";

/**
 * Send approval emails after a board move when entering Pending (posts + blogs).
 */
export async function notifyOnBoardMove({
  kind,
  fromColumn,
  toColumn,
  item,
  operatorUser,
}) {
  if (!shouldNotifyApprovalOnMove(fromColumn, toColumn)) {
    return { notified: 0, skipped: true };
  }

  if (kind === "blog") {
    const token = createBlogQuickActionToken(item.id);
    const approvers = item.assignee ? [item.assignee] : [];
    return notifyBlogApprovers({
      blog: item,
      approvers,
      creator: item.createdBy || operatorUser,
      token,
      skipped: false,
      operatorUser,
    });
  }

  // posts (approvals)
  try {
    const { sendPostApprovalNotification } = await import("./email.js");
    const { collectApprovalEmailRecipients } = await import("./approvalRecipients.js");

    let caption = item.caption || "";
    if (!caption) {
      try {
        const { Prisma } = await import("@prisma/client");
        const rows = await prisma.$queryRaw(
          Prisma.sql`SELECT caption FROM approvals WHERE id = ${item.id}`
        );
        caption = String(rows?.[0]?.caption || "");
      } catch {
        caption = "";
      }
    }

    const siteKey = item.facebookPageId || item.siteLink || "";
    const creator =
      item.createdBy ||
      operatorUser ||
      (item.createdById
        ? await prisma.user.findUnique({
            where: { id: item.createdById },
            select: { id: true, name: true, email: true, role: true },
          })
        : null);

    const token = createApprovalQuickActionToken(item.id);
    const { recipients } = await collectApprovalEmailRecipients({
      siteLink: item.siteLink || siteKey,
      selectedSite: siteKey,
      creator,
      creatorUserId: creator?.id || item.createdById || null,
      operatorUser: operatorUser || creator,
    });

    const emailApproval = {
      ...item,
      caption,
      selectedSite: siteKey,
      createdByName: creator?.name || operatorUser?.name || "Admin",
      createdByEmail: creator?.email || operatorUser?.email || "",
    };

    let notified = 0;
    for (const recipient of recipients) {
      console.log(
        `[board] Sending ${kind} approval email to ${recipient.role || "recipient"}: ${recipient.email}`
      );
      await sendPostApprovalNotification(recipient.email, emailApproval, recipient, token);
      notified += 1;
    }
    return { notified, skipped: false };
  } catch (err) {
    console.error(`[board] approval notify failed for ${kind} ${item.id}:`, err.message);
    return { notified: 0, skipped: false, error: err.message };
  }
}
