import { resolveWebsiteAccess } from "../../../../lib/resolveWebsiteAccess.js";
import { loadBacklinks } from "../../../../lib/seranking/loadBundle.js";
import { isSerankingConfigured } from "../../../../lib/seranking/config.js";
import { SerankingApiError } from "../../../../lib/seranking/client.js";
import { SEO_DATA_NOT_CONFIGURED } from "../../../../lib/seoDataMessages.js";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    if (!isSerankingConfigured()) {
      return Response.json({ error: SEO_DATA_NOT_CONFIGURED }, { status: 503 });
    }
    const { siteUrl } = await resolveWebsiteAccess(req);
    const force = req.nextUrl.searchParams.get("refresh") === "1";
    const target = req.nextUrl.searchParams.get("target") || undefined;

    const result = await loadBacklinks(siteUrl, { allowManual: true, force, target });
    return Response.json({
      siteUrl: result.siteUrl,
      domain: result.domain,
      data: result.data,
      summary: result.summary,
      fromCache: result.fromCache,
      fetchedAt: result.fetchedAt,
      expiresAt: result.expiresAt,
      creditsSpent: result.creditsSpent || 0,
    });
  } catch (err) {
    const status = err instanceof SerankingApiError ? err.status : err.status || 500;
    return Response.json({ error: err.message || "Backlinks request failed." }, { status });
  }
}
