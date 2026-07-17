import { requireSuperAdmin } from "../../../../lib/middleware/auth";
import { runManualClientReports } from "../../../../lib/clientReportJobs";

export const runtime = "nodejs";

/**
 * POST /api/reports/send
 * Superadmin manual send for current site (body: { siteKey }).
 */
export async function POST(req) {
  try {
    await requireSuperAdmin();
    const body = await req.json().catch(() => ({}));
    const siteKey = String(body.siteKey || "").trim();
    if (!siteKey) {
      return new Response(JSON.stringify({ error: "siteKey is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await runManualClientReports({ siteKey, trigger: "manual" });
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 400,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const status =
      error.message === "Unauthorized" || String(error.message || "").includes("Super admin")
        ? 403
        : 500;
    return new Response(JSON.stringify({ error: error.message || "Send failed." }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
