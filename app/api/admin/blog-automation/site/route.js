import { requireAdminRoute } from "../../../../../lib/adminAuth";

import {
  getSiteStudioConfig,
  saveSiteStudioConfig,
  sanitizeSiteConfigForClient,
} from "@/lib/blogStudio/engine.js";

export const runtime = "nodejs";

function siteFrom(req) {
  const url = new URL(req.url);
  return String(url.searchParams.get("siteLink") || "").trim();
}

export async function GET(req) {
  try {
    await requireAdminRoute(req);
    const siteLink = siteFrom(req);
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });
    const config = await getSiteStudioConfig(siteLink);
    return Response.json({ config: sanitizeSiteConfigForClient(config) });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to load site studio config." },
      { status: error.status || 500 }
    );
  }
}

export async function PUT(req) {
  try {
    await requireAdminRoute(req);
    const siteLink = siteFrom(req);
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });
    const body = await req.json();
    const config = await saveSiteStudioConfig(siteLink, body || {});
    return Response.json({ config: sanitizeSiteConfigForClient(config) });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to save site studio config." },
      { status: error.status || 500 }
    );
  }
}
