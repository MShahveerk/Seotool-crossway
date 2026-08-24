/**
 * Email Service Utility
 * Handles sending emails using Nodemailer with SMTP configuration.
 * Supports Gmail, SendGrid, Mailgun, or any SMTP provider.
 */

import nodemailer from "nodemailer";
import path from "path";
import { existsSync } from "fs";
import { logger } from "./logger";
import { humanMonthYear } from "./smmReportMonthRange.js";

const LOGO_CID = "roboseo-logo";

function resolveEmailLogoPath() {
  const candidates = [
    path.join(process.cwd(), "public", "brand", "roboseo-lockup.png"),
    path.join(process.cwd(), "public", "crossway-logo-email.png"),
    path.join(process.cwd(), "public", "crossway-logo.png"),
  ];
  return candidates.find((p) => existsSync(p)) || null;
}

/**
 * Create the email transporter based on environment configuration
 */
function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    logger.warn("SMTP not configured. Emails will be logged to console instead.");
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = createTransporter();
  }
  return transporter;
}

/**
 * Send an email
 * Falls back to console logging if SMTP is not configured
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML body
 * @param {string} [options.text] - Plain text body (optional)
 * @returns {Promise<boolean>} True if sent successfully
 */
export async function sendEmail({ to, subject, html, text, attachments }) {
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@crossway-tool.com";

  try {
    const transport = getTransporter();

    if (!transport) {
      // Fallback: log to console in development
      logger.info("EMAIL (console fallback)", {
        to,
        subject,
        preview: text || html?.substring(0, 200),
      });
      return true;
    }

    // Inline the RoboSEO.Ai logo when the template references it, so it renders
    // even in clients that block remote images.
    let allAttachments = attachments || [];
    if (html && html.includes(`cid:${LOGO_CID}`)) {
      const logoPath = resolveEmailLogoPath();
      if (logoPath) {
        allAttachments = [
          ...allAttachments,
          { filename: "roboseo-lockup.png", path: logoPath, cid: LOGO_CID },
        ];
      }
    }

    const info = await transport.sendMail({
      from: `"RoboSEO.Ai" <${fromAddress}>`,
      to,
      subject,
      html,
      text: text || html?.replace(/<[^>]*>/g, ""),
      attachments: allAttachments.length ? allAttachments : undefined,
    });

    logger.info("Email sent successfully", {
      to,
      subject,
      messageId: info.messageId,
    });

    return true;
  } catch (error) {
    logger.error("Failed to send email", {
      to,
      subject,
      error: error.message,
    });
    return false;
  }
}

/**
 * Send email verification link to a newly created user
 * @param {string} email - User email address
 * @param {string} name - User name
 * @param {string} token - Verification token (unhashed, for URL)
 * @returns {Promise<boolean>}
 */
export async function sendVerificationEmail(email, name, token) {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const verificationUrl = `${baseUrl}/verify-email?token=${token}`;

  const subject = "Verify Your Email - RoboSEO.Ai SEO Tool";
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Nunito,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#00A3FF 0%,#0077CC 100%);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#000000;font-size:24px;font-weight:700;font-family:Nunito,Helvetica,Arial,sans-serif;">RoboSEO.Ai SEO Tool</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:600;">Welcome${name ? `, ${name}` : ""}!</h2>
              <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6;">
                An account has been created for you on the RoboSEO.Ai SEO Tool platform. Please verify your email address to activate your account.
              </p>
              <p style="margin:0 0 28px;color:#4b5563;font-size:15px;line-height:1.6;">
                Click the button below to verify your email and get started:
              </p>
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${verificationUrl}" 
                       style="display:inline-block;padding:14px 36px;background-color:#00A3FF;color:#000000;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">
                      Verify Email Address
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 0;color:#6b7280;font-size:13px;line-height:1.5;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:8px 0 0;color:#2563eb;font-size:13px;word-break:break-all;">
                <a href="${verificationUrl}" style="color:#2563eb;">${verificationUrl}</a>
              </p>
              <hr style="margin:28px 0;border:none;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">
                This link will expire in <strong>24 hours</strong>. If it has expired, please contact your administrator to resend the verification email.
              </p>
              <p style="margin:8px 0 0;color:#9ca3af;font-size:12px;line-height:1.5;">
                If you did not expect this email, you can safely ignore it.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                &copy; ${new Date().getFullYear()} RoboSEO.Ai SEO Tool. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Welcome${name ? `, ${name}` : ""}!\n\nAn account has been created for you on the RoboSEO.Ai SEO Tool.\n\nPlease verify your email by visiting:\n${verificationUrl}\n\nThis link expires in 24 hours.\n\nIf you did not expect this email, you can safely ignore it.`;

  return sendEmail({ to: email, subject, html, text });
}

/**
 * Send notification to Super Admin when a user verifies their email
 * @param {string} adminEmail - Super admin email
 * @param {Object} verifiedUser - The user who verified
 * @returns {Promise<boolean>}
 */
import { generateApprovalNotificationEmail, generateStatusChangeEmail } from "./emailTemplates.js";
import {
  APPROVAL_MEDIA_CID,
  BLOG_MEDIA_CID,
  buildInlineMediaAttachment,
  resolvePublicMediaUrl,
} from "./emailMedia.js";
import { approvalMediaViewUrl, blogMediaViewUrl, createApprovalQuickActionToken } from "./approvalQuickAction.js";

function normalizeBaseUrl() {
  return (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
}

function buildApprovalMediaOptions(approval, baseUrl, token) {
  const mediaViewUrl = token ? approvalMediaViewUrl(baseUrl, approval.id, token) : null;
  const attachment = buildInlineMediaAttachment(approval.imagePath, APPROVAL_MEDIA_CID);
  return {
    mediaViewUrl,
    inlineMediaSrc: attachment ? `cid:${APPROVAL_MEDIA_CID}` : null,
    attachment,
  };
}

function buildBlogMediaOptions(blog, baseUrl, token) {
  const mediaViewUrl = token ? blogMediaViewUrl(baseUrl, blog.id, token) : null;
  const attachment = buildInlineMediaAttachment(blog.featuredImagePath, BLOG_MEDIA_CID);
  return {
    mediaViewUrl,
    inlineMediaSrc: attachment ? `cid:${BLOG_MEDIA_CID}` : null,
    attachment,
  };
}

export async function sendPostApprovalNotification(email, approval, assignee, token) {
  const baseUrl = normalizeBaseUrl();
  const media = buildApprovalMediaOptions(approval, baseUrl, token);
  const subject = `Action Required: Review Post "${approval.title}"`;
  const html = generateApprovalNotificationEmail(approval, assignee, baseUrl, token, {
    mediaViewUrl: media.mediaViewUrl,
    inlineMediaSrc: media.inlineMediaSrc,
  });
  const mediaLink = media.mediaViewUrl || resolvePublicMediaUrl(approval.imagePath, baseUrl);
  const text = `Hello ${assignee.name},\n\nA new post "${approval.title}" requires your approval.\n${mediaLink ? `\nView post media: ${mediaLink}\n` : ""}\nPlease log into the dashboard to review it: ${baseUrl}/login`;

  return sendEmail({
    to: email,
    subject,
    html,
    text,
    attachments: media.attachment ? [media.attachment] : undefined,
  });
}

export async function sendPostStatusChangeNotification(approval, actionUser, status, detail = "") {
  const baseUrl = normalizeBaseUrl();
  const media = buildApprovalMediaOptions(approval, baseUrl, createApprovalQuickActionToken(approval.id));
  const subject = `Post Status Update: "${approval.title}" is ${status.toUpperCase()}`;
  const html = generateStatusChangeEmail(approval, actionUser, status, detail, baseUrl, {
    mediaViewUrl: media.mediaViewUrl,
    inlineMediaSrc: media.inlineMediaSrc,
  });
  const text = `The post "${approval.title}" has been updated to ${status.toUpperCase()} by ${actionUser.name || "User"}.`;
  const mailExtras = media.attachment ? { attachments: [media.attachment] } : {};

  const prisma = (await import("./prisma")).default;
  const notifiedEmails = new Set();

  if (approval.assignee?.email) {
    console.log(`[INFO] Sending status email to assignee: ${approval.assignee.email}`);
    await sendEmail({ to: approval.assignee.email, subject, html, text, ...mailExtras });
    notifiedEmails.add(approval.assignee.email);
  }

  if (approval.createdBy?.email) {
    if (!notifiedEmails.has(approval.createdBy.email)) {
      console.log(`[INFO] Sending status email to creator: ${approval.createdBy.email}`);
      await sendEmail({ to: approval.createdBy.email, subject, html, text, ...mailExtras });
      notifiedEmails.add(approval.createdBy.email);
    }
  } else if (approval.createdById) {
    try {
      const creator = await prisma.user.findUnique({
        where: { id: approval.createdById },
        select: { email: true }
      });
      if (creator?.email && !notifiedEmails.has(creator.email)) {
        console.log(`[INFO] Sending status email to creator (resolved): ${creator.email}`);
        await sendEmail({ to: creator.email, subject, html, text, ...mailExtras });
        notifiedEmails.add(creator.email);
      }
    } catch {}
  }

  try {
    const superAdmins = await prisma.user.findMany({
      where: { role: "super_admin", isActive: true },
      select: { email: true }
    });
    for (const admin of superAdmins) {
      if (admin.email && !notifiedEmails.has(admin.email)) {
        console.log(`[INFO] Sending copy of status email to Super Admin: ${admin.email}`);
        await sendEmail({ to: admin.email, subject, html, text, ...mailExtras });
        notifiedEmails.add(admin.email);
      }
    }
  } catch {}

  try {
    const selectedSite = approval.selectedSite || approval.siteLink || "";
    const normSelected = selectedSite ? String(selectedSite).toLowerCase().trim() : "";

    const relevantSmms = await prisma.user.findMany({
      where: { role: "smm", isActive: true },
      select: {
        id: true,
        email: true,
        siteLink: true,
        facebookPageId: true,
        instagramUserId: true,
        accessibleSites: { select: { siteLink: true } }
      }
    });

    for (const smm of relevantSmms) {
      const isCreator = smm.id === approval.createdById;
      const primary = smm.siteLink ? String(smm.siteLink).toLowerCase().trim() : "";
      
      const isSiteMatch = (primary && primary === normSelected) || (smm.accessibleSites || []).some(
        (entry) => entry.siteLink && String(entry.siteLink).toLowerCase().trim() === normSelected
      );
      const isMetaMatch = (smm.facebookPageId && String(smm.facebookPageId).toLowerCase().trim() === normSelected) || 
                          (smm.instagramUserId && String(smm.instagramUserId).toLowerCase().trim() === normSelected);
      
      if ((isCreator || isSiteMatch || isMetaMatch) && smm.email && !notifiedEmails.has(smm.email)) {
        console.log(`[INFO] Sending copy of status email to SMM: ${smm.email}`);
        await sendEmail({ to: smm.email, subject, html, text, ...mailExtras });
        notifiedEmails.add(smm.email);
      }
    }
  } catch {}

  return true;
}

export async function sendAdminVerificationNotification(adminEmail, verifiedUser) {
  const subject = "User Verified - RoboSEO.Ai SEO Tool";
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Nunito,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#00A3FF 0%,#0077CC 100%);padding:24px 40px;text-align:center;">
              <h1 style="margin:0;color:#000000;font-size:20px;font-weight:700;">User Verified</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 12px;color:#4b5563;font-size:15px;line-height:1.6;">
                A user has successfully verified their email and activated their account:
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                <tr style="background-color:#f9fafb;">
                  <td style="padding:10px 16px;font-weight:600;color:#374151;font-size:14px;border-bottom:1px solid #e5e7eb;">Name</td>
                  <td style="padding:10px 16px;color:#4b5563;font-size:14px;border-bottom:1px solid #e5e7eb;">${verifiedUser.name || "N/A"}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-weight:600;color:#374151;font-size:14px;border-bottom:1px solid #e5e7eb;">Email</td>
                  <td style="padding:10px 16px;color:#4b5563;font-size:14px;border-bottom:1px solid #e5e7eb;">${verifiedUser.email}</td>
                </tr>
                <tr style="background-color:#f9fafb;">
                  <td style="padding:10px 16px;font-weight:600;color:#374151;font-size:14px;border-bottom:1px solid #e5e7eb;">Role</td>
                  <td style="padding:10px 16px;color:#4b5563;font-size:14px;border-bottom:1px solid #e5e7eb;">${verifiedUser.role || "user"}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-weight:600;color:#374151;font-size:14px;">Verified At</td>
                  <td style="padding:10px 16px;color:#4b5563;font-size:14px;">${new Date().toLocaleString()}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f9fafb;padding:16px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">&copy; ${new Date().getFullYear()} RoboSEO.Ai SEO Tool</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return sendEmail({ to: adminEmail, subject, html });
}

/**
 * Send weekly SEO digest to one or more recipients.
 * @param {string|string[]} to
 * @param {object[]} siteSummaries
 */
export async function sendSeoDigestEmail(to, siteSummaries = []) {
  const { generateSeoDigestEmail } = await import("./emailTemplates.js");
  const baseUrl = (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  const html = generateSeoDigestEmail(siteSummaries, baseUrl ? `${baseUrl}/` : "");
  const recipients = Array.isArray(to) ? to : [to];
  const subject = `Weekly SEO digest — ${siteSummaries.length} site(s)`;
  const text = siteSummaries
    .map((s) => {
      const tasks = (s.topTasks || []).join("; ");
      return `${s.siteUrl}: tasks=${s.taskCount || 0}${tasks ? ` — ${tasks}` : ""}${s.error ? ` (error: ${s.error})` : ""}`;
    })
    .join("\n");

  const results = [];
  for (const email of recipients.filter(Boolean)) {
    results.push(await sendEmail({ to: email, subject, html, text }));
  }
  return results;
}

/**
 * Send client report pack (PDF attachments) to an approver.
 */
export async function sendClientReportEmail({ to, recipientName, context, attachments = [], reportMonth }) {
  const name = recipientName || "there";
  const clientName = context?.displayName || context?.siteKey || "your account";
  const monthLabel = reportMonth ? humanMonthYear(reportMonth) : "this month";
  const sectionLabels = attachments.map((a) => {
    if (a.section === "smm") return "Social Media Report";
    if (a.section === "website") return "Website Performance";
    return String(a.section || "").replace(/-/g, " ");
  });
  const includesWebsite = context?.includeWebsiteReports;
  const subject = `Your reports for ${clientName}, ${monthLabel}`;

  const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:#f7f6f3;font-family:Nunito,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#fff;border:1px solid #d4d0c8;">
        <tr><td style="background:#111;padding:28px 32px;border-bottom:3px solid #111;">
          <p style="margin:0 0 6px;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#999;font-family:Nunito,Helvetica,Arial,sans-serif;">RoboSEO.Ai SEO Tool</p>
          <h1 style="margin:0;font-size:22px;color:#fff;font-weight:600;font-family:Nunito,Helvetica,Arial,sans-serif;">Your ${monthLabel} reports</h1>
        </td></tr>
        <tr><td style="padding:36px 32px;">
          <p style="margin:0 0 14px;color:#222;font-size:15px;line-height:1.7;">Hi ${name},</p>
          <p style="margin:0 0 20px;color:#444;font-size:15px;line-height:1.75;">
            Please find attached your latest reports for <strong style="color:#111;">${clientName}</strong>.
            ${
              includesWebsite
                ? "They cover your social media trends (compared with last week and last month) and how your website is performing on Google."
                : "This report focuses on your social media: follower trends compared with last week and last month, plus how your content performed."
            }
          </p>
          <ul style="margin:0 0 24px;padding-left:18px;color:#444;font-size:14px;line-height:1.8;">
            ${sectionLabels.map((label) => `<li style="margin-bottom:6px;">${label}</li>`).join("")}
          </ul>
          <p style="margin:0;font-size:11px;color:#888;font-family:Nunito,Helvetica,Arial,sans-serif;">&copy; ${new Date().getFullYear()} RoboSEO.Ai SEO Tool, ${new Date().toLocaleDateString()}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = `Hi ${name},\n\nYour ${monthLabel} reports for ${clientName} are attached (${sectionLabels.join(", ")}).\n`;

  return sendEmail({
    to,
    subject,
    html,
    text,
    attachments: attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: "application/pdf",
    })),
  });
}

export async function sendBlogApprovalNotification(email, blog, recipient, token, creator = null) {
  const baseUrl = normalizeBaseUrl();
  const media = buildBlogMediaOptions(blog, baseUrl, token);
  const name = recipient?.name || "there";
  const title = blog.userEditedTitle || blog.title || "Untitled blog";
  const approveUrl = token
    ? `${baseUrl}/api/blogs/quick-action?id=${blog.id}&token=${token}&action=approve`
    : `${baseUrl}/login`;
  const declineUrl = token
    ? `${baseUrl}/api/blogs/quick-action?id=${blog.id}&token=${token}&action=decline`
    : `${baseUrl}/login`;
  const { generateBlogApprovalEmail } = await import("./emailTemplates.js");
  const subject = `Action Required: Review Blog "${title}"`;
  const html = generateBlogApprovalEmail(blog, recipient, baseUrl, token, creator || blog.createdBy || null, {
    mediaViewUrl: media.mediaViewUrl,
    inlineMediaSrc: media.inlineMediaSrc,
  });
  const mediaLink = media.mediaViewUrl || resolvePublicMediaUrl(blog.featuredImagePath, baseUrl);
  const text = `Hi ${name},\n\nThe blog "${title}" for ${blog.siteLink} is awaiting your review.\n${mediaLink ? `\nView featured image: ${mediaLink}\n` : ""}\nApprove: ${approveUrl}\nDecline: ${declineUrl}\n\nOr review it in the dashboard: ${baseUrl}/login\n`;
  return sendEmail({
    to: email,
    subject,
    html,
    text,
    attachments: media.attachment ? [media.attachment] : undefined,
  });
}

export async function sendBlogPublishNotification(blog, method, externalId, opts = {}) {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const title = blog.userEditedTitle || blog.title || "Untitled blog";
  const link = opts.link || null;
  const { generateBlogPublishedEmail } = await import("./emailTemplates.js");
  const subject = `Blog Published: "${title}"`;
  const html = generateBlogPublishedEmail(blog, method, externalId, baseUrl, { link });
  const text = [
    `Blog "${title}" was published via ${method || "delivery chain"}${externalId ? ` (ID: ${externalId})` : ""}.`,
    link ? `Live URL: ${link}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const prismaClient = (await import("./prisma.js")).default;
  const emails = new Set();
  if (blog.assignee?.email) emails.add(blog.assignee.email);
  const creator = blog.createdById
    ? await prismaClient.user.findUnique({ where: { id: blog.createdById }, select: { email: true } })
    : null;
  if (creator?.email) emails.add(creator.email);
  for (const to of emails) {
    await sendEmail({ to, subject, html, text });
  }
}
