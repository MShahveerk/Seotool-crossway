import { resolveSearchConsoleRequest } from "../../../../lib/searchConsoleRequest";
import { getInspectionMonitor } from "../../../../lib/urlInspectionJobs";

export const runtime = "nodejs";

/**
 * GET /api/searchconsole/inspection-monitor?url=&date=YYYY-MM-DD
 * Daily snapshot: counts + indexed / not-indexed lists for monitored URLs.
 */
export async function GET(req) {
  try {
    const { siteUrl } = await resolveSearchConsoleRequest(req);
    const date = String(req.nextUrl.searchParams.get("date") || "").trim() || null;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response(JSON.stringify({ error: "date must be YYYY-MM-DD." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const data = await getInspectionMonitor(siteUrl, date);
    return new Response(
      JSON.stringify({
        ...data,
        note:
          "Shows monitored URLs from sitemaps + Search Console top pages (daily capped/rotated), not Google’s entire Coverage inventory.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
      }
    );
  } catch (error) {
    const status = error.status || 500;
    return new Response(
      JSON.stringify({ error: error.message || "Failed to load inspection monitor." }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }
}
