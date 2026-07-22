import {
  buildRankedKeywordResearch,
  buildDiscoverKeywordResearch,
  isKeywordResearchConfigured,
  GEO_TARGETS,
} from "../../../../lib/keywordResearch.js";
import { ROLES, hasPermission, PERMISSIONS } from "../../../../lib/rbac";
import { resolveWebsiteAccess } from "../../../../lib/resolveWebsiteAccess";

export const runtime = "nodejs";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}

/**
 * GET /api/keywords/research?url=&view=ranked|discover&range=28d&geo=us&refresh=1
 */
export async function GET(req) {
  try {
    const { session, siteUrl } = await resolveWebsiteAccess(req);

    const userRole = session.user.role || ROLES.USER;
    if (!hasPermission(userRole, PERMISSIONS.ACCESS_SEARCH_CONSOLE)) {
      return json({ error: "Access denied. Insufficient permissions." }, 403);
    }

    const view = String(req.nextUrl.searchParams.get("view") || "ranked").toLowerCase();
    const range = req.nextUrl.searchParams.get("range") || "28d";
    const geo = req.nextUrl.searchParams.get("geo") || "us";
    const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1";

    if (view !== "ranked" && view !== "discover") {
      return json({ error: "Invalid view. Use ranked or discover." }, 400);
    }

    const configured = isKeywordResearchConfigured();
    const payload =
      view === "discover"
        ? await buildDiscoverKeywordResearch(siteUrl, range, geo, { forceRefresh })
        : await buildRankedKeywordResearch(siteUrl, range, geo, { forceRefresh });

    return json({
      configured,
      ...payload,
      ...(configured
        ? {}
        : {
            message:
              "Google Ads Keyword Planner is not configured. Showing Search Console data only — add GOOGLE_ADS_DEVELOPER_TOKEN and GOOGLE_ADS_CUSTOMER_ID for volume and trends.",
          }),
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("Keyword research API error:", error);
    return json({ error: error.message || "Failed to load keyword research." }, status);
  }
}
