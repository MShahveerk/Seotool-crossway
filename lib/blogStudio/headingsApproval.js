/**
 * Headings-approval emails and HMAC tokens (no Prisma migration).
 */
import crypto from "crypto";
import { ROLES } from "../rbac.js";
import { findSiteUsersByRole } from "../blogAssignee.js";
import { sendEmail } from "../email.js";

export const HEADINGS_CHECKPOINT = "_checkpoint";
export const HEADINGS_APPROVAL_AGENT = "headings_approval";
export const HEADINGS_MAX_ROUNDS = 6;

export function createHeadingsApprovalToken(runId, round) {
  const secret = process.env.NEXTAUTH_SECRET || "default-secret";
  return crypto
    .createHmac("sha256", secret)
    .update(`headings:${String(runId)}:${Number(round) || 1}`)
    .digest("hex");
}

export function verifyHeadingsApprovalToken(runId, round, token) {
  return String(token || "") === createHeadingsApprovalToken(runId, round);
}

export function findHeadingsCheckpoint(stages) {
  const list = Array.isArray(stages) ? stages : [];
  return list.find((s) => s?.agent === HEADINGS_CHECKPOINT) || null;
}

export function headingsOutlineLines(headings) {
  const h = headings && typeof headings === "object" ? headings : {};
  const lines = [];
  if (h.h1) lines.push(`H1  ${h.h1}`);
  for (const s of h.sections || []) {
    if (s.heading_h2) lines.push(`H2  ${s.heading_h2}`);
    for (const sub of s.subsections || []) {
      if (sub.heading_h3) lines.push(`    H3  ${sub.heading_h3}`);
    }
  }
  return lines;
}

export async function findHeadingsApprovers(siteLink) {
  return findSiteUsersByRole(siteLink, ROLES.USER);
}

export async function sendHeadingsApprovalEmails({
  runId,
  siteLink,
  topic,
  headings,
  round,
  recipients,
}) {
  const { generateHeadingsApprovalEmail } = await import("../emailTemplates.js");
  const baseUrl = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
  const token = createHeadingsApprovalToken(runId, round);
  const approveUrl = `${baseUrl}/api/blog-studio/headings-approval?id=${encodeURIComponent(runId)}&token=${token}&action=approve`;
  const declineUrl = `${baseUrl}/api/blog-studio/headings-approval?id=${encodeURIComponent(runId)}&token=${token}&action=decline`;
  const displayUrl = String(siteLink || "").replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const subject = `Action required: approve headings for “${topic || "Untitled"}”`;
  let sent = 0;
  for (const recipient of recipients || []) {
    const html = generateHeadingsApprovalEmail({
      recipient,
      topic,
      siteLink: displayUrl,
      headings,
      round,
      approveUrl,
      declineUrl,
      baseUrl,
    });
    const lines = headingsOutlineLines(headings).join("\n");
    const text = `Hi ${recipient.name || "there"},\n\nPlease approve or decline this outline for ${displayUrl}.\n\nTopic: ${topic}\n\n${lines}\n\nApprove: ${approveUrl}\nDecline: ${declineUrl}\n`;
    const ok = await sendEmail({ to: recipient.email, subject, html, text });
    if (ok) sent += 1;
  }
  return { sent, token };
}
