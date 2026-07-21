import prisma from "../../../../lib/prisma";
import crypto from "crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const REASON_MAX = 5000;

function generateHmacToken(approvalId) {
  const secret = process.env.NEXTAUTH_SECRET || "default-secret";
  return crypto.createHmac("sha256", secret).update(String(approvalId)).digest("hex");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resultPage({ title, message, tone = "success", detail = "" }) {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const logoUrl = `${baseUrl.replace(/\/+$/, "")}/crossway-logo.png`;
  const accent =
    tone === "success"
      ? { bg: "#ecfdf3", border: "#abefc6", icon: "#099250", label: "Approved" }
      : tone === "decline"
        ? { bg: "#fef3f2", border: "#fecdca", icon: "#d92d20", label: "Rejected" }
        : tone === "info"
          ? { bg: "#f8fafc", border: "#e2e8f0", icon: "#475569", label: "Notice" }
          : { bg: "#fffbeb", border: "#fde68a", icon: "#b45309", label: "Attention" };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · Crossway</title>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root { --ink: #111827; --muted: #6b7280; --card: #ffffff; --page: #f3f4f6; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh;
      font-family: Nunito, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(1200px 500px at 10% -10%, rgba(14, 255, 42, 0.18), transparent 55%),
        radial-gradient(900px 420px at 100% 0%, rgba(16, 185, 129, 0.12), transparent 50%),
        var(--page);
      display: flex; align-items: center; justify-content: center; padding: 24px;
    }
    .card {
      width: 100%; max-width: 480px; background: var(--card);
      border-radius: 20px; border: 1px solid #e5e7eb;
      box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
      padding: 36px 32px 32px; text-align: center;
    }
    .logo {
      width: 72px; height: 72px; object-fit: contain; border-radius: 14px;
      margin: 0 auto 18px; display: block; background: #f9fafb; border: 1px solid #eef2f7;
    }
    .brand { font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #9ca3af; margin-bottom: 18px; }
    .badge {
      display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px;
      background: ${accent.bg}; border: 1px solid ${accent.border}; color: ${accent.icon};
      font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 16px;
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: ${accent.icon}; }
    h1 { margin: 0 0 10px; font-size: 1.65rem; line-height: 1.25; font-weight: 700; }
    p { margin: 0; color: var(--muted); font-size: 0.98rem; line-height: 1.6; }
    .detail {
      margin-top: 14px; padding: 12px 14px; border-radius: 12px;
      background: #f9fafb; border: 1px solid #eef2f7; color: #4b5563; font-size: 0.9rem;
      text-align: left; white-space: pre-wrap;
    }
    .footer { margin-top: 28px; padding-top: 18px; border-top: 1px solid #f1f5f9; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <main class="card">
    <img class="logo" src="${escapeHtml(logoUrl)}" alt="Crossway logo" />
    <div class="brand">Crossway</div>
    <div class="badge"><span class="dot"></span>${escapeHtml(accent.label)}</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    ${detail ? `<div class="detail">${escapeHtml(detail)}</div>` : ""}
    <div class="footer">You can safely close this window.</div>
  </main>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function declineFormPage({ id, token, approvalTitle }) {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const logoUrl = `${baseUrl.replace(/\/+$/, "")}/crossway-logo.png`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Decline post · Crossway</title>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh;
      font-family: Nunito, "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: #111827;
      background:
        radial-gradient(1200px 500px at 10% -10%, rgba(14, 255, 42, 0.12), transparent 55%),
        #f3f4f6;
      display: flex; align-items: center; justify-content: center; padding: 24px;
    }
    .card {
      width: 100%; max-width: 520px; background: #fff; border-radius: 20px;
      border: 1px solid #e5e7eb; box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
      padding: 36px 32px 28px;
    }
    .logo { width: 64px; height: 64px; object-fit: contain; border-radius: 12px; display: block; margin: 0 auto 14px; }
    .brand { text-align: center; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #9ca3af; margin-bottom: 20px; }
    h1 { margin: 0 0 8px; font-size: 1.45rem; text-align: center; }
    .subtitle { margin: 0 0 24px; color: #6b7280; font-size: 0.95rem; text-align: center; line-height: 1.5; }
    label { display: block; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; margin-bottom: 8px; }
    textarea {
      width: 100%; min-height: 120px; padding: 12px 14px; border-radius: 12px;
      border: 1px solid #d1d5db; font-family: inherit; font-size: 0.95rem; line-height: 1.5;
      resize: vertical;
    }
    textarea:focus { outline: none; border-color: #111827; box-shadow: 0 0 0 3px rgba(17, 24, 39, 0.08); }
    .hint { margin-top: 6px; font-size: 0.8rem; color: #9ca3af; }
    .actions { display: flex; gap: 10px; margin-top: 22px; flex-wrap: wrap; }
    button {
      flex: 1; min-width: 140px; padding: 13px 18px; border-radius: 10px;
      font-size: 0.9rem; font-weight: 700; cursor: pointer; border: none;
    }
    .submit { background: #111827; color: #fff; }
    .submit:hover { background: #000; }
    .cancel { background: #fff; color: #374151; border: 1px solid #d1d5db; }
  </style>
</head>
<body>
  <main class="card">
    <img class="logo" src="${escapeHtml(logoUrl)}" alt="Crossway logo" />
    <div class="brand">Crossway</div>
    <h1>Decline this post</h1>
    <p class="subtitle">${approvalTitle ? `Please tell us why you are declining "${escapeHtml(approvalTitle)}". This helps the team revise the content.` : "Please tell us why you are declining this post. This helps the team revise the content."}</p>
    <form method="POST" action="${escapeHtml(`${baseUrl}/api/approvals/quick-action`)}">
      <input type="hidden" name="id" value="${escapeHtml(id)}" />
      <input type="hidden" name="token" value="${escapeHtml(token)}" />
      <input type="hidden" name="action" value="decline" />
      <label for="reason">Reason for rejection <span style="color:#dc2626">*</span></label>
      <textarea id="reason" name="reason" required maxlength="${REASON_MAX}" placeholder="e.g. Caption tone doesn't match our brand, image needs updating, wrong scheduling time…"></textarea>
      <p class="hint">Required — your feedback is sent to the Crossway team.</p>
      <div class="actions">
        <button type="button" class="cancel" onclick="window.close()">Cancel</button>
        <button type="submit" class="submit">Submit decline</button>
      </div>
    </form>
  </main>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function validateQuickAction(id, token) {
  if (!id || !token) {
    return { error: resultPage({ title: "Missing details", message: "This approval link is incomplete.", tone: "warn" }) };
  }
  if (token !== generateHmacToken(id)) {
    return {
      error: resultPage({
        title: "Link not valid",
        message: "This approval link is invalid or has expired.",
        tone: "warn",
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
      }),
    };
  }
  if (approval.status !== "pending") {
    return {
      error: resultPage({
        title: "Already processed",
        message: "This post has already been reviewed.",
        tone: "info",
        detail: `Current status: ${approval.status}`,
      }),
    };
  }
  return { approval };
}

async function processDecline(approval, reason) {
  const trimmedReason = String(reason || "").trim();
  if (!trimmedReason) {
    return {
      error: resultPage({
        title: "Reason required",
        message: "Please provide a reason for declining this post.",
        tone: "warn",
      }),
    };
  }
  if (trimmedReason.length > REASON_MAX) {
    return {
      error: resultPage({
        title: "Reason too long",
        message: `Please keep your reason under ${REASON_MAX} characters.`,
        tone: "warn",
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

  return {
    page: resultPage({
      title: "Post declined",
      message: "Your feedback has been recorded. The Crossway team has been notified and can revise or resubmit the content.",
      tone: "decline",
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
          "Thanks — you have approved this content. The Crossway team has been notified and can proceed with scheduling or publishing.",
        tone: "success",
        detail: approval.title ? `Post: ${approval.title}` : "",
      });
    }

    if (action === "decline") {
      return declineFormPage({ id, token, approvalTitle: approval.title });
    }

    return resultPage({
      title: "Unknown action",
      message: "This approval link used an unsupported action.",
      tone: "warn",
    });
  } catch (error) {
    return resultPage({
      title: "Something went wrong",
      message: "We could not process this approval right now. Please try again or open the dashboard.",
      tone: "warn",
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

    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      id = String(form.get("id") || "");
      token = String(form.get("token") || "");
      action = String(form.get("action") || "");
      reason = String(form.get("reason") || "");
    } else {
      const body = await req.json();
      id = String(body.id || "");
      token = String(body.token || "");
      action = String(body.action || "");
      reason = String(body.reason || "");
    }

    if (action !== "decline") {
      return resultPage({ title: "Unsupported action", message: "Only decline submissions are accepted here.", tone: "warn" });
    }

    const validated = await validateQuickAction(id, token);
    if (validated.error) return validated.error;

    const result = await processDecline(validated.approval, reason);
    if (result.error) return result.error;
    return result.page;
  } catch (error) {
    return resultPage({
      title: "Something went wrong",
      message: "We could not submit your decline. Please try again.",
      tone: "warn",
      detail: process.env.NODE_ENV === "development" ? error.message : "",
    });
  }
}
