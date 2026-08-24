import prisma from "../../../../lib/prisma";
import { verifyApprovalQuickActionToken } from "../../../../lib/approvalQuickAction.js";
import { declineFormPage, resultPage, QUICK_ACTION_REASON_MAX } from "../../../../lib/quickActionPages.js";
import { resolveScheduleOnApprove } from "../../../../lib/approvalSchedule.js";

export const runtime = "nodejs";

async function validateQuickAction(id, token) {
  if (!id || !token) {
    return { error: resultPage({ title: "Missing details", message: "This approval link is incomplete.", tone: "warn", kindLabel: "Attention" }) };
  }
  if (!verifyApprovalQuickActionToken(id, token)) {
    return {
      error: resultPage({
        title: "Link not valid",
        message: "This approval link is invalid or has expired.",
        tone: "warn",
        kindLabel: "Attention",
      }),
    };
  }
  const approval = await prisma.approval.findUnique({
    where: { id },
    include: { assignee: { select: { id: true, email: true, name: true } } },
  });
  if (!approval) {
    return {
      error: resultPage({
        title: "Post not found",
        message: "We could not find this content approval.",
        tone: "warn",
        kindLabel: "Attention",
      }),
    };
  }
  if (approval.status !== "pending") {
    return {
      error: resultPage({
        title: "Already processed",
        message: "This post has already been reviewed.",
        tone: "info",
        kindLabel: "Notice",
        detail: `Current status: ${approval.status}`,
      }),
    };
  }
  return { approval };
}

async function processDecline(approval, reason, revisionTarget = "both") {
  const trimmedReason = String(reason || "").trim();
  if (!trimmedReason) {
    return {
      error: resultPage({
        title: "Reason required",
        message: "Please provide a reason for declining this post.",
        tone: "warn",
        kindLabel: "Attention",
      }),
    };
  }
  if (trimmedReason.length > QUICK_ACTION_REASON_MAX) {
    return {
      error: resultPage({
        title: "Reason too long",
        message: `Please keep your reason under ${QUICK_ACTION_REASON_MAX} characters.`,
        tone: "warn",
        kindLabel: "Attention",
      }),
    };
  }

  const updated = await prisma.approval.update({
    where: { id: approval.id },
    data: {
      status: "declined",
      lastAction: "decline",
      respondedAt: new Date(),
      awaitingAdminReview: true,
      userEditedInstructions: trimmedReason,
    },
    include: {
      assignee: { select: { id: true, email: true, name: true } },
      createdBy: { select: { id: true, email: true, name: true } },
    },
  });

  try {
    const { sendPostStatusChangeNotification } = await import("../../../../lib/email.js");
    const actionUser = updated.assignee || { name: "Approver", email: "" };
    await sendPostStatusChangeNotification(
      updated,
      actionUser,
      "declined",
      `Rejection reason:\n${trimmedReason}`
    );
  } catch (err) {
    console.error("Failed to send decline notification email", err);
  }

  // Feed the remarks straight back into the studio for an immediate revision run.
  try {
    const { enqueuePostRevisionFromDecline } = await import("../../../../lib/studioRevision.js");
    await enqueuePostRevisionFromDecline({
      approvalId: approval.id,
      remarks: trimmedReason,
      target: revisionTarget,
    });
  } catch (err) {
    console.warn(`[approvals] revision run enqueue failed for ${approval.id}: ${err.message}`);
  }

  return {
    page: resultPage({
      title: "Post declined",
      message: "Your feedback has been recorded. The RoboSEO team has been notified and can revise or resubmit the content.",
      tone: "decline",
      kindLabel: "Rejected",
      detail: trimmedReason,
    }),
  };
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const token = searchParams.get("token");
    const action = searchParams.get("action");

    if (!id || !token || !action) {
      return resultPage({
        title: "Missing details",
        message: "This approval link is incomplete. Please use the original link from your email.",
        tone: "warn",
        kindLabel: "Attention",
      });
    }

    const validated = await validateQuickAction(id, token);
    if (validated.error) return validated.error;
    const { approval } = validated;

    if (action === "approve") {
      const updated = await prisma.approval.update({
        where: { id },
        data: {
          status: "approved",
          lastAction: "approve",
          respondedAt: new Date(),
          awaitingAdminReview: true,
          scheduledFor: resolveScheduleOnApprove(approval.scheduledFor),
          publishStatus: approval.publishStatus === "published" ? approval.publishStatus : "unpublish",
        },
        include: {
          assignee: { select: { id: true, email: true, name: true } },
          createdBy: { select: { id: true, email: true, name: true } },
        },
      });
      try {
        const { sendPostStatusChangeNotification } = await import("../../../../lib/email.js");
        await sendPostStatusChangeNotification(
          updated,
          updated.assignee || { name: "Approver", email: "" },
          "approved",
          ""
        );
      } catch (err) {
        console.error("Failed to send approve notification email", err);
      }
      return resultPage({
        title: "Post approved",
        message:
          "Thanks — you have approved this content. It has been scheduled for publishing and the RoboSEO team has been notified.",
        tone: "success",
        kindLabel: "Approved",
        detail: approval.title ? `Post: ${approval.title}` : "",
      });
    }

    if (action === "decline") {
      return declineFormPage({
        id,
        token,
        itemTitle: approval.title,
        postUrl: "/api/approvals/quick-action",
        noun: "post",
      });
    }

    return resultPage({
      title: "Unknown action",
      message: "This approval link used an unsupported action.",
      tone: "warn",
      kindLabel: "Attention",
    });
  } catch (error) {
    return resultPage({
      title: "Something went wrong",
      message: "We could not process this approval right now. Please try again or open the dashboard.",
      tone: "warn",
      kindLabel: "Attention",
      detail: process.env.NODE_ENV === "development" ? error.message : "",
    });
  }
}

export async function POST(req) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let id;
    let token;
    let action;
    let reason;
    let revisionTarget = "both";

    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      id = String(form.get("id") || "");
      token = String(form.get("token") || "");
      action = String(form.get("action") || "");
      reason = String(form.get("reason") || "");
      revisionTarget = String(form.get("revisionTarget") || "both");
    } else {
      const body = await req.json();
      id = String(body.id || "");
      token = String(body.token || "");
      action = String(body.action || "");
      reason = String(body.reason || "");
      revisionTarget = String(body.revisionTarget || "both");
    }

    if (action !== "decline") {
      return resultPage({ title: "Unsupported action", message: "Only decline submissions are accepted here.", tone: "warn", kindLabel: "Attention" });
    }

    const validated = await validateQuickAction(id, token);
    if (validated.error) return validated.error;

    const result = await processDecline(validated.approval, reason, revisionTarget);
    if (result.error) return result.error;
    return result.page;
  } catch (error) {
    return resultPage({
      title: "Something went wrong",
      message: "We could not submit your decline. Please try again.",
      tone: "warn",
      kindLabel: "Attention",
      detail: process.env.NODE_ENV === "development" ? error.message : "",
    });
  }
}
