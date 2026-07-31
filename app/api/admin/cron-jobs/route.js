import { requireSuperAdmin } from "../../../../lib/middleware/auth";
import {
  listCronJobStatuses,
  setCronJobEnabled,
  isCronJobEnabled,
  getCronJobDbEnabled,
  disableAllSiteDependencies,
  getCronJobDef,
} from "../../../../lib/cronSettings.js";

export const runtime = "nodejs";

/**
 * GET /api/admin/cron-jobs — catalog + effective status for all schedules.
 */
export async function GET() {
  try {
    await requireSuperAdmin();
    const jobs = await listCronJobStatuses();
    return Response.json({
      jobs,
      note: "Global off stops the cron tick even if per-site toggles elsewhere are on. Dependent jobs still need their section toggles for work to run.",
    });
  } catch (error) {
    const status =
      error.message === "Unauthorized" || String(error.message || "").includes("Super admin")
        ? 403
        : error.status || 500;
    return Response.json(
      { error: status === 403 ? "Forbidden: Super admin access required" : error.message },
      { status }
    );
  }
}

/**
 * PUT /api/admin/cron-jobs
 * Body: { id: string, enabled?: boolean, disableAllSites?: boolean }
 */
export async function PUT(req) {
  try {
    await requireSuperAdmin();
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    if (!id || !getCronJobDef(id)) {
      return Response.json({ error: "Valid cron job id is required." }, { status: 400 });
    }

    let sitesCleared = null;
    if (body.disableAllSites === true) {
      sitesCleared = await disableAllSiteDependencies(id);
    }

    let enabled = await getCronJobDbEnabled(id);
    if (typeof body.enabled === "boolean") {
      enabled = await setCronJobEnabled(id, body.enabled);
    }

    const effectiveEnabled = await isCronJobEnabled(id);
    return Response.json({
      ok: true,
      id,
      enabled,
      effectiveEnabled,
      sitesCleared,
    });
  } catch (error) {
    const status =
      error.message === "Unauthorized" || String(error.message || "").includes("Super admin")
        ? 403
        : error.status || 500;
    return Response.json({ error: error.message || "Failed to update cron job." }, { status });
  }
}
