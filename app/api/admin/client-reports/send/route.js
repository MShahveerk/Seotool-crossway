import { requireSuperAdmin } from "../../../../../lib/middleware/auth";
import { sendClientReportsNow } from "../../../../../lib/reports/sendJobs";

export const runtime = "nodejs";

/**
 * POST /api/admin/client-reports/send
 * Body: { siteKey?: string, userId?: string }
 */
export async function POST(req) {
  try {
    await requireSuperAdmin();
    const body = await req.json().catch(() => ({}));
    const siteKey = body.siteKey ? String(body.siteKey).trim() : "";
    const userId = body.userId ? String(body.userId).trim() : "";

    const result = await sendClientReportsNow({
      siteKey: siteKey || undefined,
      userId: userId || undefined,
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
