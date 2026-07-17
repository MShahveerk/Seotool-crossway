import { buildSeoOpportunityPack } from "../../../../lib/seoOpportunities";
import { resolveSearchConsoleRequest } from "../../../../lib/searchConsoleRequest";

export const runtime = "nodejs";

/**
 * GET /api/searchconsole/opportunities?url=&range=28d
 * Striking distance, cannibalization, decay, device gaps, sitemap warnings.
 */
export async function GET(req) {
  try {
    const { siteUrl, range } = await resolveSearchConsoleRequest(req);
    const pack = await buildSeoOpportunityPack(siteUrl, range || "28d");
    return new Response(JSON.stringify(pack), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const status = error.status || 500;
    return new Response(
      JSON.stringify({ error: error.message || "Failed to load SEO opportunities." }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }
}
