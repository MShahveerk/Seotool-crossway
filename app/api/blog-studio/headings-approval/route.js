import { declineFormPage, resultPage, QUICK_ACTION_REASON_MAX } from "../../../../lib/quickActionPages.js";
import {
  approveHeadingsAndContinue,
  declineHeadingsAndRevise,
} from "../../../../lib/blogStudio/runner.js";
import prisma from "../../../../lib/prisma.js";
import { findHeadingsCheckpoint, verifyHeadingsApprovalToken } from "../../../../lib/blogStudio/headingsApproval.js";

export const runtime = "nodejs";

async function loadWaitingRun(id, token) {
  if (!id || !token) {
    return {
      error: resultPage({
        title: "Missing details",
        message: "This headings approval link is incomplete. Please use the original link from your email.",
        tone: "warn",
        kindLabel: "Attention",
      }),
    };
  }
  const run = await prisma.blogAutomationRun.findUnique({ where: { id } });
  if (!run) {
    return {
      error: resultPage({
        title: "Run not found",
        message: "We could not find this Blog Studio run.",
        tone: "warn",
        kindLabel: "Attention",
      }),
    };
  }
  const cp = findHeadingsCheckpoint(run.stagesJson);
  const round = Number(cp?.round) || 1;
  if (!verifyHeadingsApprovalToken(run.id, round, token)) {
    return {
      error: resultPage({
        title: "Link not valid",
        message: "This headings link is invalid or was replaced by a newer outline.",
        tone: "warn",
        kindLabel: "Attention",
      }),
    };
  }
  if (run.status !== "waiting") {
    return {
      error: resultPage({
        title: "Already processed",
        message: "This outline has already been reviewed, or the run is no longer waiting.",
        tone: "info",
        kindLabel: "Notice",
        detail: `Current status: ${run.status}`,
      }),
    };
  }
  return { run, topic: run.topic || cp?.topic || "Untitled" };
}

export async function GET(req) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    const token = req.nextUrl.searchParams.get("token");
    const action = String(req.nextUrl.searchParams.get("action") || "").toLowerCase();
    const loaded = await loadWaitingRun(id, token);
    if (loaded.error) return loaded.error;

    if (action === "approve") {
      await approveHeadingsAndContinue(id, token);
      return resultPage({
        title: "Headings approved",
        message: "Thanks. Blog Studio will continue with Architect, Writer, and the rest of the draft.",
        tone: "success",
        kindLabel: "Approved",
        detail: `Topic: ${loaded.topic}`,
      });
    }

    if (action === "decline") {
      return declineFormPage({
        id,
        token,
        itemTitle: loaded.topic,
        postUrl: "/api/blog-studio/headings-approval",
        noun: "outline",
        showStudioRevision: false,
        showRevisionTarget: false,
      });
    }

    return resultPage({
      title: "Unknown action",
      message: "This headings link used an unsupported action.",
      tone: "warn",
      kindLabel: "Attention",
    });
  } catch (error) {
    return resultPage({
      title: "Something went wrong",
      message: error.message || "We could not process this headings approval.",
      tone: "warn",
      kindLabel: "Attention",
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
    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      id = String(form.get("id") || "");
      token = String(form.get("token") || "");
      action = String(form.get("action") || "decline");
      reason = String(form.get("reason") || "");
    } else {
      const body = await req.json().catch(() => ({}));
      id = String(body.id || "");
      token = String(body.token || "");
      action = String(body.action || "decline");
      reason = String(body.reason || "");
    }

    if (action !== "decline") {
      return resultPage({
        title: "Unsupported action",
        message: "Only decline submissions are accepted here.",
        tone: "warn",
        kindLabel: "Attention",
      });
    }

    const trimmed = String(reason || "").trim();
    if (!trimmed) {
      return resultPage({
        title: "Reason required",
        message: "Please tell us what to change in the outline.",
        tone: "warn",
        kindLabel: "Attention",
      });
    }
    if (trimmed.length > QUICK_ACTION_REASON_MAX) {
      return resultPage({
        title: "Reason too long",
        message: `Please keep your reason under ${QUICK_ACTION_REASON_MAX} characters.`,
        tone: "warn",
        kindLabel: "Attention",
      });
    }

    const loaded = await loadWaitingRun(id, token);
    if (loaded.error) return loaded.error;

    await declineHeadingsAndRevise(id, token, trimmed);
    return resultPage({
      title: "Outline declined",
      message: "Your notes were sent back to Headings. You will get a new email when the revised outline is ready.",
      tone: "decline",
      kindLabel: "Rejected",
      detail: trimmed,
    });
  } catch (error) {
    return resultPage({
      title: "Something went wrong",
      message: error.message || "We could not submit your decline.",
      tone: "warn",
      kindLabel: "Attention",
    });
  }
}
