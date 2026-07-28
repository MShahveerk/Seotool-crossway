import { resolveWebsiteAccess } from "../../../../lib/resolveWebsiteAccess.js";
import { fetchBacklinksSummary, resolveDomainFromSite } from "../../../../lib/seranking/api.js";
import { getCachedSnapshot } from "../../../../lib/seranking/cache.js";
import { DATA_TYPES } from "../../../../lib/seranking/config.js";
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
    const allowManual = force;
    const domain = resolveDomainFromSite(siteUrl);

    if (!force) {
      const cached = await getCachedSnapshot(siteUrl, DATA_TYPES.BACKLINKS_SUMMARY);
      if (cached?.payload && !cached.expired) {
        return Response.json({
          siteUrl,
          domain,
          data: cached.payload,
          fromCache: true,
          fetchedAt: cached.fetchedAt,
          expiresAt: cached.expiresAt,
        });
      }
    }

    const result = await fetchBacklinksSummary(siteUrl, domain, { allowManual, force });
    return Response.json({
      siteUrl,
      domain,
      data: result.data,
      fromCache: result.fromCache,
      creditsSpent: result.creditsSpent || 0,
    });
  } catch (err) {
    const status = err instanceof SerankingApiError ? err.status : err.status || 500;
    return Response.json({ error: err.message || "Backlinks request failed." }, { status });
  }
}
