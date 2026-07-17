import { requireSuperAdmin } from "../../../../lib/middleware/auth";
import { runManualClientReports } from "../../../../lib/clientReportJobs";

export const runtime = "nodejs";

/**
 * POST /api/admin/client-reports/send
 * Body: { siteKey?: string, recipientEmail?: string }
 * - siteKey only → all approvers for that site
 * - neither → all approver/site pairs
 */
export async function POST(req) {
  try {
    await requireSuperAdmin();
    const body = await req.json().catch(() => ({}));
    const siteKey = body.siteKey ? String(body.siteKey).trim() : "";
    const recipientEmail = body.recipientEmail ? String(body.recipientEmail).trim() : "";

    const result = await runManualClientReports({
      siteKey: siteKey || undefined,
      recipientEmail: recipientEmail || undefined,
      trigger: "manual",
    });

    return new Response(JSON.stringify({ ok: result.ok, ...result }), {
      status: result.ok ? 200 : 400,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const status =
      error.message === "Unauthorized" || String(error.message || "").includes("Super admin")
        ? 403
        : 500;
    return new Response(JSON.stringify({ error: error.message || "Failed to send reports." }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
