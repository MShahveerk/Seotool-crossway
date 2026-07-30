import { requireAdminRoute } from "../../../../../../lib/adminAuth";

import { saveBlogFeaturedImage } from "@/lib/blogMedia.js";
import { saveSiteStudioConfig, sanitizeSiteConfigForClient, getSiteStudioConfig } from "@/lib/blogStudio/engine.js";
import {
  MAX_REFERENCE_IMAGES,
  normalizeReferencePaths,
  syncReferenceFields,
} from "@/lib/studioReferenceImage.js";

export const runtime = "nodejs";

/** POST — append a reference image (max 4). */
export async function POST(req) {
  try {
    await requireAdminRoute(req, "blog-automation");
    const url = new URL(req.url);
    const siteLink = String(url.searchParams.get("siteLink") || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });

    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return Response.json({ error: "Image file is required." }, { status: 400 });
    }

    const existing = await getSiteStudioConfig(siteLink);
    const current = normalizeReferencePaths(existing);
    if (current.length >= MAX_REFERENCE_IMAGES) {
      return Response.json(
        { error: `You can attach up to ${MAX_REFERENCE_IMAGES} reference images. Remove one first.` },
        { status: 400 }
      );
    }

    const path = await saveBlogFeaturedImage(file);
    const next = syncReferenceFields([...current, path]);
    const config = await saveSiteStudioConfig(siteLink, next);
    return Response.json({ path, config: sanitizeSiteConfigForClient(config) });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to upload reference image." },
      { status: error.status || 500 }
    );
  }
}

/** DELETE — remove a reference by path (?path=) or clear all (?all=1). */
export async function DELETE(req) {
  try {
    await requireAdminRoute(req, "blog-automation");
    const url = new URL(req.url);
    const siteLink = String(url.searchParams.get("siteLink") || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });
    const existing = await getSiteStudioConfig(siteLink);
    const current = normalizeReferencePaths(existing);
    let nextPaths = current;
    if (url.searchParams.get("all") === "1") {
      nextPaths = [];
    } else {
      const removePath = String(url.searchParams.get("path") || "").trim();
      if (!removePath) {
        return Response.json({ error: "path query is required (or all=1)." }, { status: 400 });
      }
      nextPaths = current.filter((p) => p !== removePath);
    }
    const config = await saveSiteStudioConfig(siteLink, syncReferenceFields(nextPaths));
    return Response.json({ config: sanitizeSiteConfigForClient(config) });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to remove reference image." },
      { status: error.status || 500 }
    );
  }
}
