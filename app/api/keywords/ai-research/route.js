import {
  buildAiKeywordResearch,
  buildAiSiteKeywordBrief,
  getAiKeywordProviderStatus,
} from "../../../../lib/aiKeywordResearch.js";
import { buildRankedKeywordResearch } from "../../../../lib/keywordResearch.js";
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
 * POST /api/keywords/ai-research
 * Body: { mode?: "seed"|"site-brief", seed?, geo?, range?, provider? }
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

    const mode = String(body.mode || "seed").toLowerCase();
    const geo = String(body.geo || "us").toLowerCase();
    const range = String(body.range || "28d");
    const provider = body.provider ? String(body.provider).toLowerCase() : undefined;

    if (mode === "site-brief") {
      const rankedPayload = await buildRankedKeywordResearch(siteUrl, range, geo, {
        forceRefresh: body.refresh === true || body.refresh === "1",
      });
      const payload = await buildAiSiteKeywordBrief({ siteUrl, rankedPayload, provider });
      return json({ mode: "site-brief", ranked: rankedPayload, ...payload });
    }

    const seed = String(body.seed || "").trim();
    const payload = await buildAiKeywordResearch({
      seed,
      geo,
      siteUrl,
      provider,
    });

    return json({ mode: "seed", ...payload });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("AI keyword research error:", error);
    return json({ error: error.message || "AI keyword research failed." }, status);
  }
}
