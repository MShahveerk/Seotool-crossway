/**
 * Weekly + manual client report delivery to approvers.
 */
import { sendClientReportEmail } from "./email.js";
import {
  isClientReportsEnabled,
  logReportSend,
} from "./clientReportSettings.js";
import {
  buildClientReportPack,
  listApproverReportTargets,
  findApproversForSiteKey,
} from "./clientReportBuilder.js";
import { sectionsForClientPack } from "./siteReportContext.js";
import { envFlag } from "./seoJobs.js";

/**
 * Send report pack to one recipient for one site.
 */
export async function sendClientReportPackToRecipient({
  siteKey,
  recipientEmail,
  recipientName,
  trigger = "manual",
  sections,
  reportMonth,
}) {
  const { context, attachments, reportMonth: month } = await buildClientReportPack(siteKey, {
    sections,
    reportMonth,
  });

  const validAttachments = attachments.filter((a) => a.content && !a.error);
  const failedSections = attachments.filter((a) => a.error).map((a) => a.section);

  if (!validAttachments.length) {
    await logReportSend({
      siteKey,
      recipientEmail,
      reportTypes: sections || sectionsForClientPack(context),
      trigger,
      status: "failed",
      errorMessage: failedSections.join("; ") || "No PDFs generated",
    });
    return { ok: false, error: "No report PDFs could be generated." };
  }

  const reportNames = validAttachments.map((a) => a.section);
  const ok = await sendClientReportEmail({
    to: recipientEmail,
    recipientName,
    context,
    attachments: validAttachments,
    reportMonth: month,
  });

  await logReportSend({
    siteKey,
    recipientEmail,
    reportTypes: reportNames,
    trigger,
    status: ok ? "sent" : "failed",
    errorMessage: ok ? (failedSections.length ? `Partial: ${failedSections.join(", ")}` : null) : "Email send failed",
  });

  return { ok, context, sentSections: reportNames, failedSections };
}

/**
 * Manual send: all approvers for a site, or all approver/site pairs.
 */
export async function runManualClientReports({ siteKey, recipientEmail, trigger = "manual" } = {}) {
  const results = [];

  if (siteKey) {
    const recipients = recipientEmail
      ? [{ email: recipientEmail, name: null }]
      : await findApproversForSiteKey(siteKey);

    if (!recipients.length) {
      return { ok: false, error: "No approvers found for this site.", results: [] };
    }

    for (const r of recipients) {
      try {
        const result = await sendClientReportPackToRecipient({
          siteKey,
          recipientEmail: r.email,
          recipientName: r.name,
          trigger,
        });
        results.push({ siteKey, email: r.email, ...result });
      } catch (err) {
        results.push({ siteKey, email: r.email, ok: false, error: err.message });
      }
    }
    return { ok: results.some((r) => r.ok), results };
  }

  const targets = await listApproverReportTargets();
  if (!targets.length) {
    return { ok: false, error: "No approver/site assignments found.", results: [] };
  }

  for (const { approver, siteKey: sk } of targets) {
    try {
      const result = await sendClientReportPackToRecipient({
        siteKey: sk,
        recipientEmail: approver.email,
        recipientName: approver.name,
        trigger,
      });
      results.push({ siteKey: sk, email: approver.email, ...result });
    } catch (err) {
      results.push({ siteKey: sk, email: approver.email, ok: false, error: err.message });
    }
  }

  return { ok: results.some((r) => r.ok), results };
}

/**
 * Weekly cron: email each approver their site report packs.
 */
export async function runWeeklyClientReports(logger = console) {
  if (!(await isClientReportsEnabled())) {
    logger.info?.("Client reports disabled — skipping weekly approver reports.");
    return { skipped: true };
  }

  const targets = await listApproverReportTargets();
  if (!targets.length) {
    logger.info?.("Client reports: no approver/site targets.");
    return { skipped: true, reason: "no_targets" };
  }

  logger.info?.(`Client reports: sending to ${targets.length} approver/site pair(s).`);
  const results = [];
  let sent = 0;

  for (const { approver, siteKey } of targets) {
    try {
      const result = await sendClientReportPackToRecipient({
        siteKey,
        recipientEmail: approver.email,
        recipientName: approver.name,
        trigger: "weekly",
      });
      if (result.ok) sent += 1;
      results.push({ siteKey, email: approver.email, ...result });
    } catch (err) {
      logger.error?.(`Client report failed ${approver.email} / ${siteKey}: ${err.message}`);
      results.push({ siteKey, email: approver.email, ok: false, error: err.message });
    }
  }

  logger.info?.(`Client reports: ${sent}/${targets.length} email(s) sent.`);
  return { skipped: false, sent, total: targets.length, results };
}

export { envFlag };
