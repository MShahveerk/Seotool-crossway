/**
 * Monthly report delivery — delegates to landscape slide-deck send jobs.
 * Kept for any remaining imports of the old API surface.
 */
import { sendClientReportsNow } from "./reports/sendJobs.js";
import { envFlag } from "./seoJobs.js";

export async function sendClientReportPackToRecipient({
  siteKey,
  recipientEmail,
  trigger = "manual",
}) {
  const result = await sendClientReportsNow({
    siteKey,
    trigger,
  });
  const mine = (result.results || []).filter(
    (r) => !recipientEmail || String(r.email).toLowerCase() === String(recipientEmail).toLowerCase()
  );
  const ok = mine.some((r) => r.ok);
  return { ok, results: mine, error: ok ? null : result.error || "Send failed" };
}

export async function runManualClientReports({ siteKey, trigger = "manual" } = {}) {
  return sendClientReportsNow({ siteKey, trigger });
}

export async function runWeeklyClientReports(logger = console) {
  logger.info?.("Monthly reports: using slide-deck send pipeline…");
  const result = await sendClientReportsNow({ trigger: "cron" });
  logger.info?.(`Monthly reports: ${(result.results || []).filter((r) => r.ok).length} sent.`);
  return result;
}

export { envFlag };
