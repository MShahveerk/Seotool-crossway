import { requireAdminRoute } from "@/lib/adminAuth";
import {
  getSiteStudioConfig,
  saveSiteStudioConfig,
  sanitizeSiteConfigForClient,
} from "@/lib/postsStudio/engine.js";
import { handleBrandKitPost } from "@/lib/studioBrandKitApi.js";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    await requireAdminRoute(req, "post-automation");
    const url = new URL(req.url);
    const siteLink = String(url.searchParams.get("siteLink") || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });
    const data = await handleBrandKitPost({
      req,
      siteLink,
      getConfig: getSiteStudioConfig,
      saveConfig: saveSiteStudioConfig,
      sanitize: sanitizeSiteConfigForClient,
    });
    return Response.json(data);
  } catch (error) {
    return Response.json(
      { error: error.message || "Brand kit update failed." },
      { status: error.status || 500 }
    );
  }
}
