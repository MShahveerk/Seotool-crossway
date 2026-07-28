import { resolveWebsiteAccess } from "../../../../lib/resolveWebsiteAccess.js";
import {
  fetchSeedKeywords,
  fetchSimilarKeywords,
  fetchDomainKeywords,
  resolveDomainFromSite,
} from "../../../../lib/seranking/api.js";
import { getCachedSnapshot } from "../../../../lib/seranking/cache.js";
import { DATA_TYPES, DEFAULT_SOURCE, isSerankingConfigured } from "../../../../lib/seranking/config.js";
import { SerankingApiError } from "../../../../lib/seranking/client.js";
import { getTopQueries } from "../../../../lib/searchconsole.js";
import { getDateRangeForPresetId, clampSearchConsoleQueryRange } from "../../../../lib/searchConsoleDateRanges.js";
import { seedKeywordCount } from "../../../../lib/seranking/config.js";

export const runtime = "nodejs";

async function gscSeeds(siteUrl) {
  let { startDate, endDate } = getDateRangeForPresetId("28d");
  ({ startDate, endDate } = clampSearchConsoleQueryRange(startDate, endDate));
  const res = await getTopQueries(siteUrl, startDate, endDate, seedKeywordCount());
  return (res.queries || []).map((q) => q.query).filter(Boolean);
}

export async function GET(req) {
  try {
    if (!isSerankingConfigured()) {
      return Response.json({ error: "SE Ranking is not configured." }, { status: 503 });
    }
    const { siteUrl } = await resolveWebsiteAccess(req);
    const force = req.nextUrl.searchParams.get("refresh") === "1";
    const allowManual = force;
    const domain = resolveDomainFromSite(siteUrl);

    const cachedSeeds = await getCachedSnapshot(siteUrl, DATA_TYPES.KEYWORDS_SEEDS, DEFAULT_SOURCE);
    const cachedDomainKw = await getCachedSnapshot(siteUrl, DATA_TYPES.DOMAIN_KEYWORDS, DEFAULT_SOURCE);

    let seeds = cachedSeeds?.payload;
    let domainKeywords = cachedDomainKw?.payload;

    if (force || !cachedSeeds?.payload || cachedSeeds.expired) {
      const seedList = await gscSeeds(siteUrl).catch(() => []);
      if (seedList.length) {
        const r = await fetchSeedKeywords(siteUrl, seedList, { allowManual, force: true });
        seeds = r.data;
      }
    }

    if (force || !cachedDomainKw?.payload || cachedDomainKw.expired) {
      if (force) {
        const r = await fetchDomainKeywords(siteUrl, domain, { allowManual, force: true });
        domainKeywords = r.data;
      }
    }

    return Response.json({
      siteUrl,
      domain,
      seeds: seeds || [],
      domainKeywords: domainKeywords || null,
      seedsFetchedAt: cachedSeeds?.fetchedAt,
      domainKeywordsFetchedAt: cachedDomainKw?.fetchedAt,
    });
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
