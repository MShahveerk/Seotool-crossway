import {
  getAuthorityScores,
  getAuthorityTrend,
  isAuthorityConfigured,
  toDomain,
} from "../../../lib/authority";
import { ROLES, hasPermission, PERMISSIONS } from "../../../lib/rbac";
import { resolveWebsiteAccess } from "../../../lib/resolveWebsiteAccess";

export const runtime = "nodejs";

const MAX_COMPETITORS = 5;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}

/**
 * GET /api/authority?url=&competitors=a.com,b.com
 * Open PageRank authority score + 90-day trend for the selected website,
 * with optional competitor comparison (public metrics, capped at 5 domains).
 */
export async function GET(req) {
  try {
    const { session, siteUrl } = await resolveWebsiteAccess(req);

    const userRole = session.user.role || ROLES.USER;
    if (!hasPermission(userRole, PERMISSIONS.ACCESS_SEARCH_CONSOLE)) {
      return json({ error: "Access denied. Insufficient permissions." }, 403);
    }

    const domain = toDomain(siteUrl);
    if (!domain) return json({ error: "Could not extract a domain from the selected website." }, 400);

    if (!isAuthorityConfigured()) {
      return json({
        configured: false,
        domain,
        score: null,
        globalRank: null,
        trend: [],
        competitors: [],
      });
    }

    const competitorsParam = req.nextUrl.searchParams.get("competitors") || "";
    const competitorDomains = [
      ...new Set(
        competitorsParam
          .split(",")
          .map((d) => toDomain(d))
          .filter((d) => d && d !== domain)
      ),
    ].slice(0, MAX_COMPETITORS);

    const [scores, trend] = await Promise.all([
      getAuthorityScores([domain, ...competitorDomains]),
      getAuthorityTrend(domain, 90),
    ]);

    const own = scores.get(domain) || { score: null, globalRank: null, found: false };

    return json({
      configured: true,
      domain,
      score: own.score,
      globalRank: own.globalRank,
      referringDomains: own.referringDomains ?? null,
      found: own.found,
      trend: trend.map((t) => ({ date: t.fetchedDate, score: t.score, globalRank: t.globalRank })),
      competitors: competitorDomains.map((d) => {
        const row = scores.get(d);
        return {
          domain: d,
          score: row?.score ?? null,
          globalRank: row?.globalRank ?? null,
          found: Boolean(row?.found),
        };
      }),
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("Authority API error:", error);
    return json({ error: error.message || "Failed to load authority data." }, status);
  }
}
