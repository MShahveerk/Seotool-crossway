import { buildAiKeywordResearch, getAiKeywordProviderStatus } from "../../../../lib/aiKeywordResearch.js";
import { isGoogleAdsConfigured } from "../../../../lib/googleAds.js";
import { ROLES, hasPermission, PERMISSIONS } from "../../../../lib/rbac.js";
import { resolveWebsiteAccess } from "../../../../lib/resolveWebsiteAccess.js";

export const runtime = "nodejs";
export const maxDuration = 120;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}

/**
 * GET /api/keywords/ai-research — provider status (no AI call).
 */
export async function GET(req) {
  try {
    const { session } = await resolveWebsiteAccess(req);
    const userRole = session.user.role || ROLES.USER;
    if (!hasPermission(userRole, PERMISSIONS.ACCESS_SEARCH_CONSOLE)) {
      return json({ error: "Access denied. Insufficient permissions." }, 403);
    }

    const ai = getAiKeywordProviderStatus();
    return json({
      ai,
      planner: { configured: isGoogleAdsConfigured() },
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("AI keyword status error:", error);
    return json({ error: error.message || "Failed to load AI keyword status." }, status);
  }
}

/**
 * POST /api/keywords/ai-research — run AI keyword research.
 * Body: { seed, geo?, provider? }
 */
export async function POST(req) {
  try {
    const { session, siteUrl } = await resolveWebsiteAccess(req);
    const userRole = session.user.role || ROLES.USER;
    if (!hasPermission(userRole, PERMISSIONS.ACCESS_SEARCH_CONSOLE)) {
      return json({ error: "Access denied. Insufficient permissions." }, 403);
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body." }, 400);
    }

    const seed = String(body.seed || "").trim();
    const geo = String(body.geo || "us").toLowerCase();
    const provider = body.provider ? String(body.provider).toLowerCase() : undefined;

    const payload = await buildAiKeywordResearch({
      seed,
      geo,
      siteUrl,
      provider,
    });

    return json(payload);
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("AI keyword research error:", error);
    return json({ error: error.message || "AI keyword research failed." }, status);
  }
}
