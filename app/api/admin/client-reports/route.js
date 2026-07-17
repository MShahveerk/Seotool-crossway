import { requireSuperAdmin } from "../../../../lib/middleware/auth";
import {
  getClientReportsEnabled,
  setClientReportsEnabled,
  isClientReportsEnabled,
  listRecentReportSendLogs,
} from "../../../../lib/clientReportSettings";
import { listApproverReportTargets } from "../../../../lib/clientReportBuilder";
import { envFlag } from "../../../../lib/seoJobs";

export const runtime = "nodejs";

/**
 * GET /api/admin/client-reports
 */
export async function GET() {
  try {
    await requireSuperAdmin();
    const [dbEnabled, effectiveEnabled, targets, logs] = await Promise.all([
      getClientReportsEnabled(),
      isClientReportsEnabled(),
      listApproverReportTargets(),
      listRecentReportSendLogs(30),
    ]);

    const uniqueApprovers = new Set(targets.map((t) => t.approver.email).filter(Boolean));
    const uniqueSites = new Set(targets.map((t) => t.siteKey));

    return new Response(
      JSON.stringify({
        enabled: dbEnabled === true ? true : dbEnabled === false ? false : null,
        effectiveEnabled,
        envFlag: envFlag("CLIENT_REPORTS_EMAIL"),
        schedule: "Mondays 07:00 (server local time)",
        approverCount: uniqueApprovers.size,
        siteAssignmentCount: targets.length,
        uniqueSiteCount: uniqueSites.size,
        targets: targets.map((t) => ({
          email: t.approver.email,
          name: t.approver.name,
          siteKey: t.siteKey,
        })),
        recentLogs: logs,
        note:
          "Approvers receive PDF reports for sites assigned to them. Meta-only pages without website + GTM link get SMM reports only.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
      }
    );
  } catch (error) {
    const status =
      error.message === "Unauthorized" || String(error.message || "").includes("Super admin")
        ? 403
        : 500;
    return new Response(
      JSON.stringify({ error: status === 403 ? "Forbidden: Super admin access required" : error.message }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * PUT /api/admin/client-reports
 * Body: { enabled?: boolean }
 */
export async function PUT(req) {
  try {
    await requireSuperAdmin();
    const body = await req.json().catch(() => ({}));
    let enabled = await getClientReportsEnabled();
    if (typeof body.enabled === "boolean") {
      enabled = await setClientReportsEnabled(body.enabled);
    }
    const effectiveEnabled = await isClientReportsEnabled();
    return new Response(JSON.stringify({ ok: true, enabled, effectiveEnabled }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const status =
      error.message === "Unauthorized" || String(error.message || "").includes("Super admin")
        ? 403
        : 500;
    return new Response(JSON.stringify({ error: error.message || "Failed to save settings." }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
