import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { testGoogleAdsConnection } from "../../../../lib/googleAds.js";
import { canAccessSection } from "../../../../lib/modulePermissions";

export const runtime = "nodejs";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}

/**
 * GET /api/keywords/status
 * Diagnose Google Ads Keyword Planner auth (env → OAuth token → test Planner call).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return json({ error: "Unauthorized" }, 401);

    if (!canAccessSection(session.user, "keyword-research")) {
      return json({ error: "Forbidden: Keyword Research access not granted." }, 403);
    }

    const result = await testGoogleAdsConnection();
    return json(result, result.ok ? 200 : 503);
  } catch (error) {
    console.error("Keyword status API error:", error);
    return json({ ok: false, error: error.message || "Status check failed." }, 500);
  }
}
