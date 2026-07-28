import { resolveWebsiteAccess } from "../../../../lib/resolveWebsiteAccess.js";
import {
  fetchKeywordExport,
  fetchKeywordResearch,
  loadSeedKeywordMetrics,
  enrichKeywordRowsFromExport,
} from "../../../../lib/seranking/api.js";
import { loadKeywordSeeds } from "../../../../lib/seranking/loadBundle.js";
import { isSerankingConfigured, geoToSerankingSource } from "../../../../lib/seranking/config.js";
import { SerankingApiError } from "../../../../lib/seranking/client.js";
import { normalizeKeywordResearchList } from "../../../../lib/seranking/normalize.js";
import { normKeyword } from "../../../../lib/seranking/keywordMetrics.js";

export const runtime = "nodejs";

const RESEARCH_TYPES = new Set(["similar", "related", "questions", "longtail", "export"]);

function sameKeyword(a, b) {
  return normKeyword(a) === normKeyword(b);
}

export async function GET(req) {
  try {
    if (!isSerankingConfigured()) {
      return Response.json({ error: "SE Ranking is not configured." }, { status: 503 });
    }
    const { siteUrl } = await resolveWebsiteAccess(req);
    const force = req.nextUrl.searchParams.get("refresh") === "1";

    const result = await loadKeywordSeeds(siteUrl, { allowManual: true, force });
    const source = geoToSerankingSource("us");
    const seeds = normalizeKeywordResearchList(result.seeds || [], source);
    const domainKeywords = normalizeKeywordResearchList(
      result.domainKeywords?.data || result.domainKeywords?.keywords || result.domainKeywords || [],
      source
    );

    return Response.json({ ...result, seeds, domainKeywords });
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
    const type = String(body.type || "similar").toLowerCase();
    const source = geoToSerankingSource(body.source || body.geo || "us");
    const limit = Math.min(50, Math.max(5, Number(body.limit) || 25));
    const sort = String(body.sort || "volume");
    const sortOrder = String(body.sortOrder || body.sort_order || "desc");
    const force = body.refresh === true || body.refresh === 1 || body.refresh === "1";

    if (!keyword && type !== "export") {
      return Response.json({ error: "keyword is required." }, { status: 400 });
    }
    if (!RESEARCH_TYPES.has(type)) {
      return Response.json({ error: `Invalid type. Use: ${[...RESEARCH_TYPES].join(", ")}` }, { status: 400 });
    }

    if (type === "export") {
      const keywords = Array.isArray(body.keywords)
        ? body.keywords
        : keyword
          ? keyword.split(/[\n,]+/).map((k) => k.trim()).filter(Boolean)
          : [];
      if (!keywords.length) {
        return Response.json({ error: "keywords array or keyword string is required for export." }, { status: 400 });
      }
      const result = await fetchKeywordExport(keywords, { source, allowManual: true, siteUrl });
      return Response.json({
        siteUrl,
        type,
        source,
        data: result.data,
        creditsSpent: result.creditsSpent,
      });
    }

    const [result, seedResult] = await Promise.all([
      fetchKeywordResearch(type, keyword, {
        limit,
        source,
        sort,
        sortOrder,
        allowManual: true,
        siteUrl,
        force,
      }),
      loadSeedKeywordMetrics(keyword, { source, siteUrl, allowManual: true, force }),
    ]);

    const enriched = await enrichKeywordRowsFromExport(
      [seedResult.metrics, ...(result.data || [])].filter(Boolean),
      { source, siteUrl, allowManual: true, force }
    );
    const enrichedSeed =
      enriched.data.find((row) => sameKeyword(row.keyword, keyword)) || seedResult.metrics;
    const enrichedRelated = enriched.data.filter((row) => !sameKeyword(row.keyword, keyword));

    const creditsSpent = (result.creditsSpent || 0) + (seedResult.creditsSpent || 0) + (enriched.creditsSpent || 0);
    const fromCache = Boolean(result.fromCache && seedResult.fromCache && enriched.fromCache);
    const fetchedAt = result.fetchedAt || seedResult.fetchedAt || null;
    const expiresAt = result.expiresAt || seedResult.expiresAt || null;

    return Response.json({
      siteUrl,
      keyword: result.keyword,
      type: result.type,
      source: result.source,
      data: enrichedRelated,
      seedMetrics: enrichedSeed,
      creditsSpent,
      fromCache,
      fetchedAt,
      expiresAt,
      cacheNote: fromCache ? "Served from cache — refreshes weekly." : null,
    });
  } catch (err) {
    const status = err instanceof SerankingApiError ? err.status : err.status || 500;
    return Response.json({ error: err.message || "Keyword research failed." }, { status });
  }
}
