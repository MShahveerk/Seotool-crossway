/**
 * Email Service Utility
 * Handles sending emails using Nodemailer with SMTP configuration.
 * Supports Gmail, SendGrid, Mailgun, or any SMTP provider.
 */

import nodemailer from "nodemailer";
import { logger } from "./logger";

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
export async function sendEmail({ to, subject, html, text }) {
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

    const info = await transport.sendMail({
      from: `"Crossway SEO Tool" <${fromAddress}>`,
      to,
      subject,
      html,
      text: text || html?.replace(/<[^>]*>/g, ""),
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

  const subject = "Verify Your Email - Crossway SEO Tool";
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0EFF2A 0%,#0BCC22 100%);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#000000;font-size:24px;font-weight:700;">Crossway SEO Tool</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:600;">Welcome${name ? `, ${name}` : ""}!</h2>
              <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6;">
                An account has been created for you on the Crossway SEO Tool platform. Please verify your email address to activate your account.
              </p>
              <p style="margin:0 0 28px;color:#4b5563;font-size:15px;line-height:1.6;">
                Click the button below to verify your email and get started:
              </p>
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${verificationUrl}" 
                       style="display:inline-block;padding:14px 36px;background-color:#0EFF2A;color:#000000;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">
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
                &copy; ${new Date().getFullYear()} Crossway SEO Tool. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Welcome${name ? `, ${name}` : ""}!\n\nAn account has been created for you on the Crossway SEO Tool.\n\nPlease verify your email by visiting:\n${verificationUrl}\n\nThis link expires in 24 hours.\n\nIf you did not expect this email, you can safely ignore it.`;

  return sendEmail({ to: email, subject, html, text });
}

/**
 * Send notification to Super Admin when a user verifies their email
 * @param {string} adminEmail - Super admin email
 * @param {Object} verifiedUser - The user who verified
 * @returns {Promise<boolean>}
 */
import { generateApprovalNotificationEmail, generateStatusChangeEmail } from "./emailTemplates.js";

export async function sendPostApprovalNotification(email, approval, assignee, token) {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const subject = `Action Required: Review Post "${approval.title}"`;
  const html = generateApprovalNotificationEmail(approval, assignee, baseUrl, token);
  const text = `Hello ${assignee.name},\n\nA new post "${approval.title}" requires your approval.\nPlease log into the dashboard to review it: ${baseUrl}/login`;

  return sendEmail({ to: email, subject, html, text });
}

export async function sendPostStatusChangeNotification(approval, actionUser, status, detail = "") {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const subject = `Post Status Update: "${approval.title}" is ${status.toUpperCase()}`;
  const html = generateStatusChangeEmail(approval, actionUser, status, detail, baseUrl);
  const text = `The post "${approval.title}" has been updated to ${status.toUpperCase()} by ${actionUser.name || "User"}.`;

  const prisma = (await import("./prisma")).default;
  const notifiedEmails = new Set();

  if (approval.assignee?.email) {
    console.log(`[INFO] Sending status email to assignee: ${approval.assignee.email}`);
    await sendEmail({ to: approval.assignee.email, subject, html, text });
    notifiedEmails.add(approval.assignee.email);
  }

  if (approval.createdBy?.email) {
    if (!notifiedEmails.has(approval.createdBy.email)) {
      console.log(`[INFO] Sending status email to creator: ${approval.createdBy.email}`);
      await sendEmail({ to: approval.createdBy.email, subject, html, text });
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
        await sendEmail({ to: creator.email, subject, html, text });
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
        await sendEmail({ to: admin.email, subject, html, text });
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
        await sendEmail({ to: smm.email, subject, html, text });
        notifiedEmails.add(smm.email);
      }
    }
  } catch {}

  return true;
}

export async function sendAdminVerificationNotification(adminEmail, verifiedUser) {
  const subject = "User Verified - Crossway SEO Tool";
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#0EFF2A 0%,#0BCC22 100%);padding:24px 40px;text-align:center;">
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
              <p style="margin:0;color:#9ca3af;font-size:12px;">&copy; ${new Date().getFullYear()} Crossway SEO Tool</p>
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
