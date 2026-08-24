import prisma from "../../../../lib/prisma";
import { verifyBlogQuickActionToken } from "../../../../lib/blogAssignee.js";
import { declineFormPage, resultPage, QUICK_ACTION_REASON_MAX } from "../../../../lib/quickActionPages.js";

export const runtime = "nodejs";

async function validateBlogQuickAction(id, token) {
  if (!id || !token) {
    return {
      error: resultPage({
        title: "Missing details",
        message: "This blog approval link is incomplete. Please use the original link from your email.",
        tone: "warn",
        kindLabel: "Attention",
      }),
    };
  }
  if (!verifyBlogQuickActionToken(id, token)) {
    return {
      error: resultPage({
        title: "Link not valid",
        message: "This blog approval link is invalid or has expired.",
        tone: "warn",
        kindLabel: "Attention",
      }),
    };
  }

  const blog = await prisma.blogPost.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, email: true, name: true } },
      createdBy: { select: { id: true, email: true, name: true } },
    },
  });

  if (!blog) {
    return {
      error: resultPage({
        title: "Blog not found",
        message: "We could not find this blog approval.",
        tone: "warn",
        kindLabel: "Attention",
      }),
    };
  }

  if (!["pending", "edited"].includes(blog.status)) {
    return {
      error: resultPage({
        title: "Already processed",
        message: "This blog has already been reviewed.",
        tone: "info",
        kindLabel: "Notice",
        detail: `Current status: ${blog.status}`,
      }),
    };
  }

  return { blog };
}

async function processBlogDecline(blog, reason, revisionTarget = "both") {
  const trimmedReason = String(reason || "").trim();
  if (!trimmedReason) {
    return {
      error: resultPage({
        title: "Reason required",
        message: "Please provide a reason for declining this blog.",
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

  await prisma.blogPost.update({
    where: { id: blog.id },
    data: {
      status: "declined",
      lastAction: "decline",
      respondedAt: new Date(),
      awaitingAdminReview: true,
      publishError: trimmedReason,
    },
  });

  try {
    const { revertDeclinedBlogToDraft } = await import("../../../../lib/blogDecline.js");
    await revertDeclinedBlogToDraft(blog);
  } catch (err) {
    console.error(`[blog] decline revert failed for ${blog.id}: ${err.message}`);
  }

  // Feed the remarks straight back into the studio for an immediate revision run.
  try {
    const { enqueueBlogRevisionFromDecline } = await import("../../../../lib/studioRevision.js");
    await enqueueBlogRevisionFromDecline({
      blogPostId: blog.id,
      remarks: trimmedReason,
      target: revisionTarget,
    });
  } catch (err) {
    console.warn(`[blog] revision run enqueue failed for ${blog.id}: ${err.message}`);
  }

  return {
    page: resultPage({
      title: "Blog declined",
      message:
        "Your feedback has been recorded. The RoboSEO team has been notified. If this came from WordPress, the post was moved back to draft so it will not auto-publish.",
      tone: "decline",
      kindLabel: "Rejected",
      detail: trimmedReason,
    }),
  };
}

export async function GET(req) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    const token = req.nextUrl.searchParams.get("token");
    const action = String(req.nextUrl.searchParams.get("action") || "").toLowerCase();

    if (!id || !token || !action) {
      return resultPage({
        title: "Missing details",
        message: "This blog approval link is incomplete. Please use the original link from your email.",
        tone: "warn",
        kindLabel: "Attention",
      });
    }

    const validated = await validateBlogQuickAction(id, token);
    if (validated.error) return validated.error;
    const { blog } = validated;
    const title = blog.userEditedTitle || blog.title || "Untitled blog";

    if (action === "approve") {
      const { isScheduleDue, resolveScheduleOnApprove } = await import(
        "../../../../lib/approvalSchedule.js"
      );
      const scheduledFor = resolveScheduleOnApprove(blog.scheduledFor);
      let updated = await prisma.blogPost.update({
        where: { id },
        data: {
          status: "approved",
          lastAction: "approve",
          respondedAt: new Date(),
          awaitingAdminReview: true,
          scheduledFor,
        },
      });
      try {
        const { publishBlogNow, syncBlogScheduleToWordpress } = await import(
          "../../../../lib/blogPublishJobs.js"
        );
        if (updated.scheduledFor) {
          if (isScheduleDue(updated.scheduledFor)) {
            await publishBlogNow(updated.id);
            updated = await prisma.blogPost.findUnique({ where: { id } });
          } else {
            await syncBlogScheduleToWordpress(updated, updated.scheduledFor, {
              publishIfDue: false,
            });
          }
        }
      } catch (err) {
        console.warn(`[blog] quick-action WP schedule sync failed for ${id}: ${err.message}`);
      }
      return resultPage({
        title: "Blog approved",
        message:
          "Thanks — you have approved this blog. The RoboSEO team has been notified and can proceed with scheduling or publishing.",
        tone: "success",
        kindLabel: "Approved",
        detail: `Blog: ${title}`,
      });
    }

    if (action === "decline") {
      return declineFormPage({
        id,
        token,
        itemTitle: title,
        postUrl: "/api/blogs/quick-action",
        noun: "blog",
      });
    }

    return resultPage({
      title: "Unknown action",
      message: "This blog approval link used an unsupported action.",
      tone: "warn",
      kindLabel: "Attention",
    });
  } catch (error) {
    return resultPage({
      title: "Something went wrong",
      message: "We could not process this blog approval right now. Please try again from your email link.",
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
      return resultPage({
        title: "Unsupported action",
        message: "Only decline submissions are accepted here.",
        tone: "warn",
        kindLabel: "Attention",
      });
    }

    const validated = await validateBlogQuickAction(id, token);
    if (validated.error) return validated.error;

    const result = await processBlogDecline(validated.blog, reason, revisionTarget);
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
