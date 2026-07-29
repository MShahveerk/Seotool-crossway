import { requirePermission } from "@/lib/middleware/auth";
import { PERMISSIONS } from "@/lib/rbac";
import { saveBlogFeaturedImage } from "@/lib/blogMedia.js";
import { saveSiteStudioConfig, sanitizeSiteConfigForClient } from "@/lib/blogStudio/engine.js";

export const runtime = "nodejs";

/** Upload a reference image for the site studio image agent. */
export async function POST(req) {
  try {
    await requirePermission(PERMISSIONS.VIEW_ALL_DATA);
    const url = new URL(req.url);
    const siteLink = String(url.searchParams.get("siteLink") || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });

    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return Response.json({ error: "Image file is required." }, { status: 400 });
    }

    const path = await saveBlogFeaturedImage(file);
    const config = await saveSiteStudioConfig(siteLink, { referenceImagePath: path });
    return Response.json({ path, config: sanitizeSiteConfigForClient(config) });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to upload reference image." },
      { status: error.status || 500 }
    );
  }
}
