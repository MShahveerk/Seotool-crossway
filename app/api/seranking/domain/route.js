import { resolveWebsiteAccess } from "../../../../lib/resolveWebsiteAccess.js";
import { loadDomainIntelligence } from "../../../../lib/seranking/loadBundle.js";
import { isSerankingConfigured } from "../../../../lib/seranking/config.js";
import { SerankingApiError } from "../../../../lib/seranking/client.js";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    if (!isSerankingConfigured()) {
      return Response.json({ error: "SE Ranking is not configured." }, { status: 503 });
    }
    const { siteUrl } = await resolveWebsiteAccess(req);
    const force = req.nextUrl.searchParams.get("refresh") === "1";

    const result = await loadDomainIntelligence(siteUrl, { allowManual: true, force });
    return Response.json(result);
  } catch (err) {
    const status = err instanceof SerankingApiError ? err.status : err.status || 500;
    return Response.json({ error: err.message || "Domain analysis failed." }, { status });
  }
}
