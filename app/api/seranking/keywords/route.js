import { resolveWebsiteAccess } from "../../../../lib/resolveWebsiteAccess.js";
import { fetchSimilarKeywords } from "../../../../lib/seranking/api.js";
import { loadKeywordSeeds } from "../../../../lib/seranking/loadBundle.js";
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

    const result = await loadKeywordSeeds(siteUrl, { allowManual: true, force });
    return Response.json(result);
  } catch (err) {
    const status = err instanceof SerankingApiError ? err.status : err.status || 500;
    return Response.json({ error: err.message || "Keyword data failed." }, { status });
  }
}

export async function POST(req) {
  try {
    if (!isSerankingConfigured()) {
      return Response.json({ error: "SE Ranking is not configured." }, { status: 503 });
    }
    const { siteUrl } = await resolveWebsiteAccess(req);
    const body = await req.json().catch(() => ({}));
    const keyword = String(body.keyword || "").trim();
    const limit = Math.min(20, Math.max(5, Number(body.limit) || 15));

    if (!keyword) {
      return Response.json({ error: "keyword is required." }, { status: 400 });
    }

    const result = await fetchSimilarKeywords(keyword, { limit, allowManual: true, siteUrl });
    return Response.json({
      siteUrl,
      keyword,
      data: result.data,
      creditsSpent: result.creditsSpent,
    });
  } catch (err) {
    const status = err instanceof SerankingApiError ? err.status : err.status || 500;
    return Response.json({ error: err.message || "Similar keywords failed." }, { status });
  }
}
