import { getSitemaps } from "../../../../lib/searchconsole";
import { resolveSearchConsoleRequest } from "../../../../lib/searchConsoleRequest";

export const runtime = "nodejs";

/**
 * GET /api/searchconsole/sitemaps?url=<site>
 */
export async function GET(req) {
  try {
    const { siteUrl } = await resolveSearchConsoleRequest(req);
    const data = await getSitemaps(siteUrl);
    return new Response(
      JSON.stringify({
        siteUrl,
        sitemaps: data.sitemaps || [],
        total: (data.sitemaps || []).length,
        lastUpdated: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
      }
    );
  } catch (error) {
    const status = error.status || 500;
    return new Response(
      JSON.stringify({ error: error.message || "Failed to load sitemaps." }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }
}
