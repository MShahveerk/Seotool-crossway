import { inspectUrl } from "../../../../lib/searchconsole";
import { resolveSearchConsoleRequest } from "../../../../lib/searchConsoleRequest";
import { isValidUrl } from "../../../../lib/validation";

export const runtime = "nodejs";

/**
 * GET /api/searchconsole/inspect?url=<site>&inspectionUrl=<page>
 */
export async function GET(req) {
  try {
    const { siteUrl } = await resolveSearchConsoleRequest(req);
    const inspectionUrl = String(req.nextUrl.searchParams.get("inspectionUrl") || "").trim();

    if (!inspectionUrl || !isValidUrl(inspectionUrl)) {
      return new Response(
        JSON.stringify({ error: "Provide a valid inspectionUrl (full page URL to inspect)." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await inspectUrl(siteUrl, inspectionUrl);
    return new Response(JSON.stringify({ siteUrl, ...result }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const status = error.status || 500;
    return new Response(
      JSON.stringify({ error: error.message || "URL inspection failed." }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }
}
