/**
 * Superadmin-managed settings for automated approver (client) reports.
 */
import prisma from "./prisma.js";

const ENABLED_KEY = "client_reports_enabled";

export async function getClientReportsEnabled() {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: ENABLED_KEY } });
    if (!row) return null;
    const v = String(row.value || "").trim().toLowerCase();
    if (v === "true" || v === "1" || v === "yes") return true;
    if (v === "false" || v === "0" || v === "no") return false;
    return null;
  } catch {
    return null;
  }
}

export async function setClientReportsEnabled(enabled) {
  const value = enabled ? "true" : "false";
  await prisma.appSetting.upsert({
    where: { key: ENABLED_KEY },
    create: { key: ENABLED_KEY, value },
    update: { value },
  });
  return enabled;
}

function envFlag(name) {
  const v = String(process.env[name] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Enabled if UI toggle is true, or CLIENT_REPORTS_EMAIL env (UI false wins). */
export async function isClientReportsEnabled() {
  const dbEnabled = await getClientReportsEnabled();
  if (dbEnabled === false) return false;
  if (dbEnabled === true) return true;
  return envFlag("CLIENT_REPORTS_EMAIL");
}

export async function listRecentReportSendLogs(limit = 40) {
  try {
    return await prisma.clientReportSendLog.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
    });
  } catch {
    return [];
  }
}

export async function logReportSend({ siteKey, recipientEmail, reportTypes, trigger, status, errorMessage }) {
  try {
    return await prisma.clientReportSendLog.create({
      data: {
        siteKey: String(siteKey || "").slice(0, 512),
        recipientEmail: String(recipientEmail || "").slice(0, 191),
        reportTypes: Array.isArray(reportTypes) ? reportTypes : [],
        trigger: String(trigger || "manual").slice(0, 32),
        status: String(status || "sent").slice(0, 32),
        errorMessage: errorMessage ? String(errorMessage).slice(0, 2000) : null,
      },
    });
  } catch {
    return null;
  }
}

export { ENABLED_KEY };
