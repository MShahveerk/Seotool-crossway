import prisma from "../../../../lib/prisma";
import crypto from "crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

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
  <style>
    :root {
      --ink: #111827;
      --muted: #6b7280;
      --card: #ffffff;
      --page: #f3f4f6;
      --accent: #0EFF2A;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(1200px 500px at 10% -10%, rgba(14, 255, 42, 0.18), transparent 55%),
        radial-gradient(900px 420px at 100% 0%, rgba(16, 185, 129, 0.12), transparent 50%),
        var(--page);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      width: 100%;
      max-width: 480px;
      background: var(--card);
      border-radius: 20px;
      border: 1px solid #e5e7eb;
      box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
      padding: 36px 32px 32px;
      text-align: center;
    }
    .logo {
      width: 72px;
      height: 72px;
      object-fit: contain;
      border-radius: 14px;
      margin: 0 auto 18px;
      display: block;
      background: #f9fafb;
      border: 1px solid #eef2f7;
    }
    .brand {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #9ca3af;
      margin-bottom: 18px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-radius: 999px;
      background: ${accent.bg};
      border: 1px solid ${accent.border};
      color: ${accent.icon};
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin-bottom: 16px;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${accent.icon};
    }
    h1 {
      margin: 0 0 10px;
      font-size: 1.65rem;
      line-height: 1.25;
      font-weight: 700;
    }
    p {
      margin: 0;
      color: var(--muted);
      font-size: 0.98rem;
      line-height: 1.6;
    }
    .detail {
      margin-top: 14px;
      padding: 12px 14px;
      border-radius: 12px;
      background: #f9fafb;
      border: 1px solid #eef2f7;
      color: #4b5563;
      font-size: 0.9rem;
    }
    .footer {
      margin-top: 28px;
      padding-top: 18px;
      border-top: 1px solid #f1f5f9;
      font-size: 12px;
      color: #9ca3af;
    }
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

    const expectedToken = generateHmacToken(id);
    if (token !== expectedToken) {
      return resultPage({
        title: "Link not valid",
        message: "This approval link is invalid or has expired. Ask your Crossway admin to resend the request.",
        tone: "warn",
      });
    }

    const approval = await prisma.approval.findUnique({ where: { id } });
    if (!approval) {
      return resultPage({
        title: "Post not found",
        message: "We could not find this content approval. It may have been removed.",
        tone: "warn",
      });
    }

    if (approval.status !== "pending") {
      return resultPage({
        title: "Already processed",
        message: "This post has already been reviewed. No further action is needed.",
        tone: "info",
        detail: `Current status: ${approval.status}`,
      });
    }

    if (action === "approve") {
      await prisma.approval.update({
        where: { id },
        data: {
          status: "approved",
          lastAction: "approve",
          respondedAt: new Date(),
          awaitingAdminReview: true,
        },
      });
      return resultPage({
        title: "Post approved",
        message:
          "Thanks — you have approved this content. The Crossway team has been notified and can proceed with scheduling or publishing.",
        tone: "success",
        detail: approval.title ? `Post: ${approval.title}` : "",
      });
    }

    if (action === "decline") {
      await prisma.approval.update({
        where: { id },
        data: {
          status: "declined",
          lastAction: "decline",
          respondedAt: new Date(),
          awaitingAdminReview: true,
        },
      });
      return resultPage({
        title: "Post rejected",
        message:
          "You have rejected this content. The Crossway team has been notified and can revise or resubmit it.",
        tone: "decline",
        detail: approval.title ? `Post: ${approval.title}` : "",
      });
    }

    return resultPage({
      title: "Unknown action",
      message: "This approval link used an unsupported action. Please use Approve or Reject from your email.",
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
