import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { validateFocusKeyword, isKeywordResearchConfigured, GEO_TARGETS } from "../../../../lib/keywordResearch.js";
import { ROLES, hasPermission, PERMISSIONS } from "../../../../lib/rbac";

export const runtime = "nodejs";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}

/**
 * GET /api/keywords/validate?keyword=&geo=us
 * Planner metrics for a single focus keyword (blog validation).
 */
export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return json({ error: "Unauthorized" }, 401);

    const userRole = session.user.role || ROLES.USER;
    if (!hasPermission(userRole, PERMISSIONS.ACCESS_SEARCH_CONSOLE)) {
      return json({ error: "Access denied." }, 403);
    }

    const keyword = String(req.nextUrl.searchParams.get("keyword") || "").trim();
    const geo = req.nextUrl.searchParams.get("geo") || "us";

    if (!keyword) return json({ error: "keyword is required." }, 400);

    if (!isKeywordResearchConfigured()) {
      return json({
        configured: false,
        keyword,
        geoOptions: GEO_TARGETS,
        metrics: null,
      });
    }

    const result = await validateFocusKeyword(keyword, geo);
    return json(result);
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("Keyword validate API error:", error);
    return json({ error: error.message || "Validation failed." }, status);
  }
}
