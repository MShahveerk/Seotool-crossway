import { resolveWebsiteAccess } from "../../../../lib/resolveWebsiteAccess.js";
import {
  fetchDomainOverview,
  fetchDomainCompetitors,
  fetchDomainKeywords,
  resolveDomainFromSite,
  getBundleForSite,
} from "../../../../lib/seranking/api.js";
import { getCachedSnapshot } from "../../../../lib/seranking/cache.js";
import { DATA_TYPES, DEFAULT_SOURCE, isSerankingConfigured } from "../../../../lib/seranking/config.js";
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
    const part = req.nextUrl.searchParams.get("part") || "all";
    const domain = resolveDomainFromSite(siteUrl);

    if (!force && part === "all") {
      const bundle = await getBundleForSite(siteUrl);
      return Response.json({
        siteUrl,
        domain,
        overview: bundle.overview,
        competitors: bundle.competitors,
        keywords: bundle.keywords,
        meta: bundle.meta,
        fromCache: true,
      });
    }

    const loadPart = async (type, fetcher) => {
      if (!force) {
        const sk = type === DATA_TYPES.DOMAIN_KEYWORDS ? DEFAULT_SOURCE : "";
        const cached = await getCachedSnapshot(siteUrl, type, sk);
        if (cached?.payload && !cached.expired) return { data: cached.payload, fromCache: true };
      }
      const r = await fetcher(siteUrl, domain, { allowManual, force: true });
      return { data: r.data, fromCache: false, creditsSpent: r.creditsSpent };
    };

    const out = { siteUrl, domain };
    if (part === "overview" || part === "all") {
      out.overview = (await loadPart(DATA_TYPES.DOMAIN_OVERVIEW, fetchDomainOverview)).data;
    }
    if (part === "competitors" || part === "all") {
      out.competitors = (await loadPart(DATA_TYPES.DOMAIN_COMPETITORS, fetchDomainCompetitors)).data;
    }
    if (part === "keywords" || part === "all") {
      out.keywords = (await loadPart(DATA_TYPES.DOMAIN_KEYWORDS, fetchDomainKeywords)).data;
    }

    return Response.json(out);
  } catch (err) {
    const status = err instanceof SerankingApiError ? err.status : err.status || 500;
    return Response.json({ error: err.message || "Domain analysis failed." }, { status });
  }
}
