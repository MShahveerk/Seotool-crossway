import { resolveWebsiteAccess } from "../../../../lib/resolveWebsiteAccess.js";
import { loadSeoOverview } from "../../../../lib/seranking/loadBundle.js";
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
    const includeAi = req.nextUrl.searchParams.get("ai") === "1";

    const result = await loadSeoOverview(siteUrl, { allowManual: true, force, includeAi });
    return Response.json(result);
  } catch (err) {
    const status = err instanceof SerankingApiError ? err.status : err.status || 500;
    return Response.json({ error: err.message || "SEO overview failed." }, { status });
  }
}
