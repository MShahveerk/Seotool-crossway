import { resolveSearchConsoleRequest } from "../../../../../lib/searchConsoleRequest";
import { getInspectionHistory } from "../../../../../lib/urlInspectionJobs";

export const runtime = "nodejs";

/**
 * GET /api/searchconsole/inspection-monitor/history?url=&days=30
 */
export async function GET(req) {
  try {
    const { siteUrl } = await resolveSearchConsoleRequest(req);
    const days = Number(req.nextUrl.searchParams.get("days") || 30);
    const data = await getInspectionHistory(siteUrl, days);
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const status = error.status || 500;
    return new Response(
      JSON.stringify({ error: error.message || "Failed to load inspection history." }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }
}
