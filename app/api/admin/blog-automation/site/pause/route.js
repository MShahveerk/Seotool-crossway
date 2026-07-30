import { requireAdminRoute } from "../../../../../../lib/adminAuth";

import {
  getSiteStudioConfig,
  saveSiteStudioConfig,
  sanitizeSiteConfigForClient,
} from "@/lib/blogStudio/engine.js";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    await requireAdminRoute(req, "blog-automation");
    const url = new URL(req.url);
    const siteLink = String(url.searchParams.get("siteLink") || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const existing = await getSiteStudioConfig(siteLink);
    const autoEnabled =
      body.autoEnabled !== undefined ? Boolean(body.autoEnabled) : !existing.autoEnabled;
    const config = await saveSiteStudioConfig(siteLink, { autoEnabled });
    return Response.json({ config: sanitizeSiteConfigForClient(config) });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to update auto schedule." },
      { status: error.status || 500 }
    );
  }
}
