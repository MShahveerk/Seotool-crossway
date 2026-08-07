import { getServerSession } from "next-auth";
import { authOptions } from "../../../app/api/auth/[...nextauth]/route";
import { assertSectionAccess } from "../../../lib/modulePermissions";
import { querySerper } from "../../../lib/serper";
import { getAuthorityScores, toDomain } from "../../../lib/authority";

export const runtime = "nodejs";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}

/**
 * POST /api/serper
 * Body: { q: string, endpoint: string, gl?: string, hl?: string, ... }
 */
export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return json({ error: "Unauthorized. Please log in." }, 401);
    }

    // Verify user has permission to use Serper Explorer
    try {
      assertSectionAccess(session.user, "serper-explorer");
    } catch {
      return json({ error: "Forbidden: You do not have permission to access Serper Explorer." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const q = String(body.q || "").trim();
    const endpoint = String(body.endpoint || "web").trim().toLowerCase();
    const gl = String(body.gl || "us").trim().toLowerCase();
    const hl = String(body.hl || "en").trim().toLowerCase();

    if (!q) {
      return json({ error: "Search query 'q' is required." }, 400);
    }

    // Call Serper API helper
    const result = await querySerper(endpoint, q, { gl, hl, ...body });

    // Enrich web search results with Domain Authority (Open PageRank) in parallel
    if ((endpoint === "web" || endpoint === "search") && Array.isArray(result.organic)) {
      const organicResults = result.organic;
      const domains = organicResults.map((item) => toDomain(item.link)).filter(Boolean);
      const uniqueDomains = [...new Set(domains)];

      if (uniqueDomains.length > 0) {
        try {
          const authorityMap = await getAuthorityScores(uniqueDomains);
          result.organic = organicResults.map((item) => {
            const domain = toDomain(item.link);
            const auth = domain ? authorityMap.get(domain) : null;
            return {
              ...item,
              domain,
              authority: auth
                ? {
                    score: auth.score,
                    globalRank: auth.globalRank,
                    referringDomains: auth.referringDomains,
                    found: auth.found,
                  }
                : null,
            };
          });
        } catch (err) {
          console.warn("Failed to fetch authority scores for Serper SERP results:", err.message);
        }
      }
    }

    return json(result);
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("Serper API proxy route error:", error);
    return json({ error: error.message || "Failed to query Serper.dev" }, status);
  }
}
