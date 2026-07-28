import { resolveWebsiteAccess } from "../../../../lib/resolveWebsiteAccess.js";
import { loadSerankingMetrics } from "../../../../lib/seranking/loadBundle.js";
import { isSerankingConfigured } from "../../../../lib/seranking/config.js";
import { SerankingApiError } from "../../../../lib/seranking/client.js";
import { SEO_DATA_METRICS_FAILED } from "../../../../lib/seoDataMessages.js";

export const runtime = "nodejs";

/** Lightweight cached metrics for Site Health hub (backlinks + domain overview). */
export async function GET(req) {
  try {
    if (!isSerankingConfigured()) {
      return Response.json({ configured: false, overview: null, backlinks: null });
    }
    const { siteUrl } = await resolveWebsiteAccess(req);
    const force = req.nextUrl.searchParams.get("refresh") === "1";

    const result = await loadSerankingMetrics(siteUrl, { allowManual: true, force });
    return Response.json({ configured: true, ...result });
  } catch (err) {
    const status = err instanceof SerankingApiError ? err.status : err.status || 500;
    return Response.json({ error: err.message || SEO_DATA_METRICS_FAILED }, { status });
  }
}
