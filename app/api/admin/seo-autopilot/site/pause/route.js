import { requireAdminRoute } from "../../../../../../lib/adminAuth";
import { getAutopilotConfig, saveAutopilotConfig, sanitizeAutopilotConfigForClient } from "@/lib/seoAutopilot/engine.js";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    await requireAdminRoute(req, "seo-autopilot");
    const url = new URL(req.url);
    const siteLink = String(url.searchParams.get("siteLink") || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });
    const body = await req.json().catch(() => ({}));
    const existing = await getAutopilotConfig(siteLink);
    const autoEnabled =
      body.autoEnabled !== undefined ? Boolean(body.autoEnabled) : !existing.autoEnabled;
    const config = await saveAutopilotConfig(siteLink, { autoEnabled });
    return Response.json({ config: sanitizeAutopilotConfigForClient(config) });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to toggle schedule." },
      { status: error.status || 500 }
    );
  }
}
