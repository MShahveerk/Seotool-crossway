import {
  buildRankedKeywordResearch,
  buildDiscoverKeywordResearch,
  buildSuggestKeywordResearch,
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
 * GET /api/keywords/research?url=&view=ranked|discover|suggest&range=28d&geo=us&seed=&refresh=1
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
    const seed = req.nextUrl.searchParams.get("seed") || "";
    const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1";

    if (view !== "ranked" && view !== "discover" && view !== "suggest") {
      return json({ error: "Invalid view. Use ranked, discover, or suggest." }, 400);
    }

    const configured = isKeywordResearchConfigured();

    if (view === "suggest") {
      const payload = await buildSuggestKeywordResearch(siteUrl, range, geo, { seed, forceRefresh });
      return json({ configured, autocompleteAvailable: true, ...payload });
    }

    const payload =
      view === "discover"
        ? await buildDiscoverKeywordResearch(siteUrl, range, geo, { forceRefresh })
        : await buildRankedKeywordResearch(siteUrl, range, geo, { forceRefresh });

    return json({
      configured,
      autocompleteAvailable: true,
      ...payload,
      ...(configured
        ? {}
        : {
            message:
              "Google Ads Keyword Planner is not configured. Search Console data and free autocomplete suggestions are still available.",
          }),
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("Keyword research API error:", error);
    return json({ error: error.message || "Failed to load keyword research." }, status);
  }
}
