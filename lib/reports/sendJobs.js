/**
 * Unified weekly / manual report delivery using landscape slide decks.
 */
import prisma from "../prisma.js";
import { ROLES } from "../rbac.js";
import { formatYearMonth } from "../smmReportMonthRange.js";
import { sendEmail } from "../email.js";
import { isClientReportsEnabled, logReportSend } from "../clientReportSettings.js";
import { isSeoDigestEnabled } from "../seoJobs.js";
import {
  userWantsStaffDigest,
  userWantsClientWebsiteReport,
  userWantsClientSmmReport,
  userWantsCombinedReport,
} from "./reportPreferences.js";
import { buildSlideDeckPdfBytes, slideDeckFilename } from "./buildSlideDecks.js";
import {
  resolveReportPacksForUser,
  resolveAllClientReportPacks,
  resolveReportDisplayName,
} from "./resolveReportPacks.js";

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function buildAttachmentsForPack(pack, {
  wantWebsite,
  wantSmm,
  wantCombined,
  includeInternal,
  reportMonth,
  preparedFor,
}) {
  const attachments = [];
  const month = reportMonth || formatYearMonth(new Date());
  const siteKey = pack.siteKey;
  const displayName = pack.displayName;
  const canWebsite = Boolean(pack.includeWebsite && wantWebsite);

  if (wantCombined) {
    try {
      const kind = canWebsite ? "combined" : "smm";
      const bytes = await buildSlideDeckPdfBytes(kind, siteKey, {
        reportMonth: month,
        preparedFor,
        includeInternal,
        displayName,
      });
      attachments.push({
        filename: slideDeckFilename(kind, displayName || siteKey, month),
        content: Buffer.from(bytes),
        contentType: "application/pdf",
        section: "combined",
      });
    } catch (err) {
      attachments.push({ section: "combined", error: err.message });
    }
  }

  if (!wantCombined && canWebsite) {
    try {
      const bytes = await buildSlideDeckPdfBytes("website", siteKey, {
        reportMonth: month,
        preparedFor,
        includeInternal,
        displayName,
      });
      attachments.push({
        filename: slideDeckFilename("website", displayName || siteKey, month),
        content: Buffer.from(bytes),
        contentType: "application/pdf",
        section: "website",
      });
    } catch (err) {
      attachments.push({ section: "website", error: err.message });
    }
  }

  if (!wantCombined && wantSmm) {
    try {
      const bytes = await buildSlideDeckPdfBytes("smm", siteKey, {
        reportMonth: month,
        preparedFor,
        includeInternal,
        displayName,
      });
      attachments.push({
        filename: slideDeckFilename("smm", displayName || siteKey, month),
        content: Buffer.from(bytes),
        contentType: "application/pdf",
        section: "smm",
      });
    } catch (err) {
      attachments.push({ section: "smm", error: err.message });
    }
  }

  // Combined failed → separate fallbacks
  if (wantCombined && !attachments.some((a) => a.content)) {
    if (canWebsite) {
      try {
        const bytes = await buildSlideDeckPdfBytes("website", siteKey, {
          reportMonth: month,
          preparedFor,
          includeInternal,
          displayName,
        });
        attachments.push({
          filename: slideDeckFilename("website", displayName || siteKey, month),
          content: Buffer.from(bytes),
          contentType: "application/pdf",
          section: "website",
        });
      } catch {
        /* ignore */
      }
    }
    if (wantSmm) {
      try {
        const bytes = await buildSlideDeckPdfBytes("smm", siteKey, {
          reportMonth: month,
          preparedFor,
          includeInternal,
          displayName,
        });
        attachments.push({
          filename: slideDeckFilename("smm", displayName || siteKey, month),
          content: Buffer.from(bytes),
          contentType: "application/pdf",
          section: "smm",
        });
      } catch {
        /* ignore */
      }
    }
  }

  return attachments;
}

async function sendReportEmail({ to, name, displayName, attachments, reportMonth, kindLabel }) {
  const clientName = displayName || "your account";
  const month = reportMonth || formatYearMonth(new Date());
  const subject = `${kindLabel} — ${clientName} (${month})`;
  const html = `
<!DOCTYPE html>
<html><body style="margin:0;padding:32px;background:#faf9f5;font-family:Inter,system-ui,sans-serif;color:#141413;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8e6e0;border-radius:12px;padding:28px;">
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#87867f;">Crossway Consulting</p>
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;">${escapeHtml(kindLabel)}</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#3d3d3a;">
      Hi ${escapeHtml(name || "there")}, your report for <strong>${escapeHtml(clientName)}</strong> (${escapeHtml(month)}) is attached.
    </p>
    <p style="margin:0;font-size:13px;color:#87867f;">crosswayconsulting.com</p>
  </div>
</body></html>`;
  return sendEmail({
    to,
    subject,
    html,
    text: `${kindLabel} for ${clientName} (${month}). See attached PDF.`,
    attachments: attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType || "application/pdf",
    })),
  });
}

function filterPacks(packs, siteKey) {
  if (!siteKey) return packs;
  const needle = String(siteKey).trim().toLowerCase();
  return packs.filter((p) => {
    if (String(p.siteKey).toLowerCase() === needle) return true;
    if (String(p.displayName).toLowerCase() === needle) return true;
    return (p.equivalents || []).some((e) => String(e).toLowerCase() === needle);
  });
}

/**
 * Client-facing reports based on user receive* flags (any role).
 * Super admins always get all sites (one email per client pack).
 */
export async function sendClientReportsNow({ siteKey = null, userId = null, trigger = "manual" } = {}) {
  if (!(await isClientReportsEnabled())) {
    return { ok: false, error: "Client reports are disabled.", results: [] };
  }

  const month = formatYearMonth(new Date());
  const results = [];

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      ...(userId ? { id: userId } : {}),
    },
    include: { accessibleSites: true },
  });

  const globalPacks = await resolveAllClientReportPacks();

  for (const user of users) {
    const isSuper = user.role === ROLES.SUPER_ADMIN;
    const wantCombined = isSuper
      ? Boolean(user.receiveCombinedReport)
      : userWantsCombinedReport(user);
    const wantWebsite =
      isSuper || userWantsClientWebsiteReport(user) || wantCombined;
    const wantSmm = isSuper || userWantsClientSmmReport(user) || wantCombined;

    if (!wantWebsite && !wantSmm && !wantCombined) continue;

    let packs = isSuper ? globalPacks : await resolveReportPacksForUser(user);
    packs = filterPacks(packs, siteKey);
    if (!packs.length) continue;

    for (const pack of packs) {
      try {
        const attachments = await buildAttachmentsForPack(pack, {
          wantWebsite,
          wantSmm,
          wantCombined,
          includeInternal: false,
          reportMonth: month,
          preparedFor: user.name || user.email,
        });
        const valid = attachments.filter((a) => a.content);
        if (!valid.length) {
          results.push({
            email: user.email,
            siteKey: pack.siteKey,
            displayName: pack.displayName,
            ok: false,
            error: "No PDFs generated",
          });
          await logReportSend({
            siteKey: pack.siteKey,
            recipientEmail: user.email,
            reportTypes: attachments.map((a) => a.section),
            trigger,
            status: "failed",
            errorMessage: "No PDFs generated",
          });
          continue;
        }
        const ok = await sendReportEmail({
          to: user.email,
          name: user.name,
          displayName: pack.displayName,
          attachments: valid,
          reportMonth: month,
          kindLabel: "Monthly Report",
        });
        await logReportSend({
          siteKey: pack.siteKey,
          recipientEmail: user.email,
          reportTypes: valid.map((a) => a.section),
          trigger,
          status: ok ? "sent" : "failed",
          errorMessage: ok ? null : "Email send failed",
        });
        results.push({
          email: user.email,
          siteKey: pack.siteKey,
          displayName: pack.displayName,
          ok,
          sections: valid.map((a) => a.section),
        });
      } catch (err) {
        results.push({
          email: user.email,
          siteKey: pack.siteKey,
          displayName: pack.displayName,
          ok: false,
          error: err.message,
        });
      }
    }
  }

  return { ok: results.some((r) => r.ok), results };
}

/**
 * Staff weekly digests — site-scoped, includeInternal slides.
 */
export async function sendStaffDigestsNow({ userId = null, siteKey = null, trigger = "manual" } = {}) {
  if (!(await isSeoDigestEnabled())) {
    return { ok: false, error: "Weekly digests are disabled.", results: [] };
  }

  const month = formatYearMonth(new Date());
  const results = [];
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      ...(userId ? { id: userId } : {}),
    },
    include: { accessibleSites: true },
  });

  for (const user of users) {
    const isSuper = user.role === ROLES.SUPER_ADMIN;
    if (!isSuper && !userWantsStaffDigest(user)) continue;

    let packs = isSuper
      ? await resolveAllClientReportPacks()
      : await resolveReportPacksForUser(user);
    packs = filterPacks(packs, siteKey);
    if (!packs.length) continue;

    for (const pack of packs) {
      try {
        const attachments = await buildAttachmentsForPack(pack, {
          wantWebsite: pack.includeWebsite,
          wantSmm: true,
          wantCombined: pack.includeWebsite,
          includeInternal: true,
          reportMonth: month,
          preparedFor: user.name || user.email,
        });
        const valid = attachments.filter((a) => a.content);
        if (!valid.length) {
          results.push({
            email: user.email,
            siteKey: pack.siteKey,
            displayName: pack.displayName,
            ok: false,
            error: "No PDFs generated",
          });
          continue;
        }
        const ok = await sendReportEmail({
          to: user.email,
          name: user.name,
          displayName: pack.displayName,
          attachments: valid,
          reportMonth: month,
          kindLabel: "Monthly Report",
        });
        results.push({
          email: user.email,
          siteKey: pack.siteKey,
          displayName: pack.displayName,
          ok,
          sections: valid.map((a) => a.section),
        });
      } catch (err) {
        results.push({
          email: user.email,
          siteKey: pack.siteKey,
          displayName: pack.displayName,
          ok: false,
          error: err.message,
        });
      }
    }
  }

  return { ok: results.some((r) => r.ok), results };
}

export async function runWeeklySlideDeckReports(logger = console) {
  logger.info?.("Running weekly staff digests (slide decks)...");
  const digests = await sendStaffDigestsNow({ trigger: "cron" });
  logger.info?.(`Staff digests: ${digests.results?.length || 0} attempts`);

  logger.info?.("Running weekly client reports (slide decks)...");
  const clients = await sendClientReportsNow({ trigger: "cron" });
  logger.info?.(`Client reports: ${clients.results?.length || 0} attempts`);

  return { digests, clients };
}

export { resolveReportDisplayName };
