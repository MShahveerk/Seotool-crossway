/**
 * Unified weekly / manual report delivery using landscape slide decks.
 */
import prisma from "../prisma.js";
import { ROLES } from "../rbac.js";
import { isMetaPageId } from "../siteAccess.js";
import { normalizeSiteOrigin } from "../validation.js";
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
import { formatPropertyLabel } from "./slideDeckTheme.js";

function uniqueKeys(keys) {
  return [...new Set((keys || []).map((k) => String(k || "").trim()).filter(Boolean))];
}

async function sitesForUser(user) {
  const keys = [];
  if (user.siteLink) keys.push(user.siteLink);
  if (user.facebookPageId) keys.push(user.facebookPageId);
  if (user.instagramUserId) keys.push(user.instagramUserId);
  for (const s of user.accessibleSites || []) {
    keys.push(typeof s === "string" ? s : s.siteLink);
  }
  return uniqueKeys(keys);
}

async function allClientSiteKeys() {
  const [sites, users] = await Promise.all([
    prisma.site.findMany({
      select: { siteUrl: true, facebookPageId: true, instagramUserId: true },
    }),
    prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      select: {
        siteLink: true,
        facebookPageId: true,
        instagramUserId: true,
        accessibleSites: { select: { siteLink: true } },
      },
    }),
  ]);
  const keys = [];
  for (const s of sites) {
    if (s.siteUrl) keys.push(s.siteUrl);
    if (s.facebookPageId) keys.push(s.facebookPageId);
  }
  for (const u of users) {
    keys.push(...(await sitesForUser(u)));
  }
  return uniqueKeys(keys);
}

async function buildAttachmentsForSite(siteKey, {
  wantWebsite,
  wantSmm,
  wantCombined,
  includeInternal,
  reportMonth,
  preparedFor,
}) {
  const attachments = [];
  const month = reportMonth || formatYearMonth(new Date());
  const metaOnly = isMetaPageId(siteKey);

  // Combined alone is enough — it implies website + SMM content in one deck.
  if (wantCombined) {
    try {
      const kind = metaOnly ? "smm" : "combined";
      const bytes = await buildSlideDeckPdfBytes(kind, siteKey, {
        reportMonth: month,
        preparedFor,
        includeInternal,
      });
      attachments.push({
        filename: slideDeckFilename(kind, siteKey, month),
        content: Buffer.from(bytes),
        contentType: "application/pdf",
        section: kind === "smm" ? "combined" : "combined",
      });
    } catch (err) {
      attachments.push({ section: "combined", error: err.message });
    }
  }

  if (!wantCombined && wantWebsite && !metaOnly) {
    try {
      const bytes = await buildSlideDeckPdfBytes("website", siteKey, {
        reportMonth: month,
        preparedFor,
        includeInternal,
      });
      attachments.push({
        filename: slideDeckFilename("website", siteKey, month),
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
      });
      attachments.push({
        filename: slideDeckFilename("smm", siteKey, month),
        content: Buffer.from(bytes),
        contentType: "application/pdf",
        section: "smm",
      });
    } catch (err) {
      attachments.push({ section: "smm", error: err.message });
    }
  }

  // Combined failed → fall back to separate decks the user would otherwise get
  if (wantCombined && !attachments.some((a) => a.content)) {
    if (!metaOnly) {
      try {
        const bytes = await buildSlideDeckPdfBytes("website", siteKey, {
          reportMonth: month,
          preparedFor,
          includeInternal,
        });
        attachments.push({
          filename: slideDeckFilename("website", siteKey, month),
          content: Buffer.from(bytes),
          contentType: "application/pdf",
          section: "website",
        });
      } catch {
        /* ignore */
      }
    }
    try {
      const bytes = await buildSlideDeckPdfBytes("smm", siteKey, {
        reportMonth: month,
        preparedFor,
        includeInternal,
      });
      attachments.push({
        filename: slideDeckFilename("smm", siteKey, month),
        content: Buffer.from(bytes),
        contentType: "application/pdf",
        section: "smm",
      });
    } catch {
      /* ignore */
    }
  }

  return attachments;
}

async function sendReportEmail({ to, name, siteKey, attachments, reportMonth, kindLabel }) {
  const clientName = formatPropertyLabel(siteKey);
  const month = reportMonth || formatYearMonth(new Date());
  const subject = `${kindLabel} — ${clientName} (${month})`;
  const html = `
<!DOCTYPE html>
<html><body style="margin:0;padding:32px;background:#faf9f5;font-family:Inter,system-ui,sans-serif;color:#141413;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8e6e0;border-radius:12px;padding:28px;">
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#87867f;">Crossway Consulting</p>
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;">${kindLabel}</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#3d3d3a;">
      Hi ${name || "there"}, your report for <strong>${clientName}</strong> (${month}) is attached.
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

/**
 * Client-facing reports based on user receive* flags (any role).
 * Super admins always get all sites.
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
      // Admin-created users are active; don't block on emailVerified edge cases
      ...(userId ? { id: userId } : {}),
    },
    include: { accessibleSites: true },
  });

  const allSites = siteKey ? [siteKey] : await allClientSiteKeys();

  for (const user of users) {
    const isSuper = user.role === ROLES.SUPER_ADMIN;
    const wantCombined = isSuper
      ? Boolean(user.receiveCombinedReport)
      : userWantsCombinedReport(user);
    // Combined alone implies website + SMM content for that user
    const wantWebsite =
      isSuper || userWantsClientWebsiteReport(user) || wantCombined;
    const wantSmm = isSuper || userWantsClientSmmReport(user) || wantCombined;

    if (!wantWebsite && !wantSmm && !wantCombined) continue;

    const userSites = isSuper ? allSites : await sitesForUser(user);
    const targets = siteKey ? userSites.filter((k) => k === siteKey || normalizeSiteOrigin(k) === normalizeSiteOrigin(siteKey)) : userSites;
    if (!targets.length) continue;

    for (const sk of targets) {
      try {
        const attachments = await buildAttachmentsForSite(sk, {
          wantWebsite,
          wantSmm,
          wantCombined,
          includeInternal: false,
          reportMonth: month,
          preparedFor: user.name || user.email,
        });
        const valid = attachments.filter((a) => a.content);
        if (!valid.length) {
          results.push({ email: user.email, siteKey: sk, ok: false, error: "No PDFs generated" });
          await logReportSend({
            siteKey: sk,
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
          siteKey: sk,
          attachments: valid,
          reportMonth: month,
          kindLabel: "Your Crossway report",
        });
        await logReportSend({
          siteKey: sk,
          recipientEmail: user.email,
          reportTypes: valid.map((a) => a.section),
          trigger,
          status: ok ? "sent" : "failed",
          errorMessage: ok ? null : "Email send failed",
        });
        results.push({ email: user.email, siteKey: sk, ok, sections: valid.map((a) => a.section) });
      } catch (err) {
        results.push({ email: user.email, siteKey: sk, ok: false, error: err.message });
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

  const allSites = siteKey ? [siteKey] : await allClientSiteKeys();

  for (const user of users) {
    const isSuper = user.role === ROLES.SUPER_ADMIN;
    if (!isSuper && !userWantsStaffDigest(user)) continue;

    const userSites = isSuper ? allSites : await sitesForUser(user);
    const targets = siteKey
      ? userSites.filter((k) => k === siteKey || normalizeSiteOrigin(k) === normalizeSiteOrigin(siteKey))
      : userSites;
    if (!targets.length) continue;

    for (const sk of targets) {
      try {
        const wantWebsite = !isMetaPageId(sk);
        const wantSmm = true;
        const attachments = await buildAttachmentsForSite(sk, {
          wantWebsite,
          wantSmm,
          wantCombined: wantWebsite,
          includeInternal: true,
          reportMonth: month,
          preparedFor: user.name || user.email,
        });
        const valid = attachments.filter((a) => a.content);
        if (!valid.length) {
          results.push({ email: user.email, siteKey: sk, ok: false, error: "No PDFs generated" });
          continue;
        }
        const ok = await sendReportEmail({
          to: user.email,
          name: user.name,
          siteKey: sk,
          attachments: valid,
          reportMonth: month,
          kindLabel: "Weekly performance digest",
        });
        results.push({ email: user.email, siteKey: sk, ok, sections: valid.map((a) => a.section) });
      } catch (err) {
        results.push({ email: user.email, siteKey: sk, ok: false, error: err.message });
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
