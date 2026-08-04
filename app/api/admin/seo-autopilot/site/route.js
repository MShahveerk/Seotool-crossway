import { requireAdminRoute } from "../../../../../lib/adminAuth";
import {
  getAutopilotConfig,
  saveAutopilotConfig,
  sanitizeAutopilotConfigForClient,
} from "@/lib/seoAutopilot/engine.js";

export const runtime = "nodejs";

function siteFrom(req) {
  const url = new URL(req.url);
  return String(url.searchParams.get("siteLink") || "").trim();
}

export async function GET(req) {
  try {
    await requireAdminRoute(req, "seo-autopilot");
    const siteLink = siteFrom(req);
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });
    const config = await getAutopilotConfig(siteLink);
    return Response.json({ config: sanitizeAutopilotConfigForClient(config) });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to load SEO Autopilot config." },
      { status: error.status || 500 }
    );
  }
}

export async function PUT(req) {
  try {
    await requireAdminRoute(req, "seo-autopilot");
    const siteLink = siteFrom(req);
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });
    const body = await req.json();
    const config = await saveAutopilotConfig(siteLink, body || {});
    return Response.json({ config: sanitizeAutopilotConfigForClient(config) });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to save SEO Autopilot config." },
      { status: error.status || 500 }
    );
  }
}
