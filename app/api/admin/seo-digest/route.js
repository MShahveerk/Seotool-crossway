import { requireSuperAdmin } from "../../../../lib/middleware/auth";
import { getSeoDigestEnabled, setSeoDigestEnabled } from "../../../../lib/seoDigestSettings";
import { isSeoDigestEnabled, envFlag } from "../../../../lib/seoJobs";
import { sendStaffDigestsNow } from "../../../../lib/reports/sendJobs";
import prisma from "../../../../lib/prisma";
import { ROLES } from "../../../../lib/rbac";

export const runtime = "nodejs";

/**
 * GET /api/admin/seo-digest
 * Kill-switch + preview of users with weeklyDigestEnabled.
 */
export async function GET() {
  try {
    await requireSuperAdmin();
    const [dbEnabled, effectiveEnabled, users] = await Promise.all([
      getSeoDigestEnabled(),
      isSeoDigestEnabled(),
      prisma.user.findMany({
        where: { isActive: true, deletedAt: null },
        select: {
          email: true,
          name: true,
          role: true,
          weeklyDigestEnabled: true,
          siteLink: true,
          facebookPageId: true,
          accessibleSites: { select: { siteLink: true } },
        },
        orderBy: { email: "asc" },
      }),
    ]);

    const digestUsers = users
      .filter((u) => u.role === ROLES.SUPER_ADMIN || u.weeklyDigestEnabled)
      .map((u) => ({
        email: u.email,
        name: u.name,
        role: u.role,
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
        envDigestFlag: envFlag("SEO_DIGEST_EMAIL"),
        digestUsers,
        digestUserCount: digestUsers.length,
        schedule: "Mondays 06:00 (server local time)",
        note:
          "Staff digests use per-user Weekly digest toggles (Admin → user). The global list of digest recipients has been removed. Super admins always receive digests for all sites.",
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
 * PUT /api/admin/seo-digest
 * Body: { enabled?: boolean }
 */
export async function PUT(req) {
  try {
    await requireSuperAdmin();
    const body = await req.json().catch(() => ({}));

    let enabled = await getSeoDigestEnabled();
    if (typeof body.enabled === "boolean") {
      enabled = await setSeoDigestEnabled(body.enabled);
    }

    const effectiveEnabled = await isSeoDigestEnabled();
    return new Response(JSON.stringify({ ok: true, enabled, effectiveEnabled }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const status =
      error.status ||
      (error.message === "Unauthorized" || String(error.message || "").includes("Super admin")
        ? 403
        : 500);
    return new Response(JSON.stringify({ error: error.message || "Failed to save digest settings." }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * POST /api/admin/seo-digest — send staff digests now
 * Body: { siteKey?, userId? }
 */
export async function POST(req) {
  try {
    await requireSuperAdmin();
    const body = await req.json().catch(() => ({}));
    const result = await sendStaffDigestsNow({
      siteKey: body.siteKey ? String(body.siteKey).trim() : undefined,
      userId: body.userId ? String(body.userId).trim() : undefined,
      trigger: "manual",
    });
    return new Response(JSON.stringify({ ok: result.ok, ...result }), {
      status: result.ok ? 200 : 400,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const status =
      error.status ||
      (error.message === "Unauthorized" || String(error.message || "").includes("Super admin")
        ? 403
        : 500);
    return new Response(JSON.stringify({ error: error.message || "Failed to send digests." }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
