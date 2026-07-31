import { requireSuperAdmin } from "../../../../lib/middleware/auth";
import {
  getClientReportsEnabled,
  setClientReportsEnabled,
  isClientReportsEnabled,
  listRecentReportSendLogs,
} from "../../../../lib/clientReportSettings";
import { envFlag } from "../../../../lib/seoJobs";
import prisma from "../../../../lib/prisma";
import { ROLES } from "../../../../lib/rbac";

export const runtime = "nodejs";

/**
 * GET /api/admin/client-reports
 * Preview who receives client slide decks from user prefs.
 */
export async function GET() {
  try {
    await requireSuperAdmin();
    const [dbEnabled, effectiveEnabled, users, logs] = await Promise.all([
      getClientReportsEnabled(),
      isClientReportsEnabled(),
      prisma.user.findMany({
        where: { isActive: true, deletedAt: null },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          siteLink: true,
          facebookPageId: true,
          receiveWebsiteReport: true,
          receiveSmmReport: true,
          receiveCombinedReport: true,
          accessibleSites: { select: { siteLink: true } },
        },
        orderBy: { email: "asc" },
      }),
      listRecentReportSendLogs(30),
    ]);

    const recipients = users
      .filter((u) => {
        if (u.role === ROLES.SUPER_ADMIN) return true;
        return u.receiveWebsiteReport || u.receiveSmmReport || u.receiveCombinedReport;
      })
      .map((u) => ({
        email: u.email,
        name: u.name,
        role: u.role,
        receiveWebsiteReport: u.role === ROLES.SUPER_ADMIN ? true : Boolean(u.receiveWebsiteReport),
        receiveSmmReport: u.role === ROLES.SUPER_ADMIN ? true : Boolean(u.receiveSmmReport),
        receiveCombinedReport: Boolean(u.receiveCombinedReport),
        sites: [
          u.siteLink,
          u.facebookPageId,
          ...(u.accessibleSites || []).map((s) => s.siteLink),
        ].filter(Boolean),
      }));

    return new Response(
      JSON.stringify({
        enabled: dbEnabled === true ? true : dbEnabled === false ? false : null,
        effectiveEnabled,
        envFlag: envFlag("CLIENT_REPORTS_EMAIL"),
        schedule: "Mondays 07:00 (server local time)",
        recipientCount: recipients.length,
        recipients,
        recentLogs: logs,
        note:
          "Client landscape PDF decks are emailed per user report preferences (any role). Super admins always receive all eligible sites. Configure toggles under each user in Admin.",
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
