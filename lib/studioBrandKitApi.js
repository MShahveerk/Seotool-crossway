/**
 * Shared brand-kit HTTP actions for Blog + Post studio site configs.
 */
import { saveBlogFeaturedImage } from "./blogMedia.js";
import {
  mergeBrandKitForSave,
  normalizeBrandKit,
  pullFigmaTemplate,
  suggestBrandKitFromLogo,
} from "./studioBrandKit.js";

export async function handleBrandKitPost({
  req,
  siteLink,
  getConfig,
  saveConfig,
  sanitize,
}) {
  const existing = await getConfig(siteLink);
  const contentType = String(req.headers.get("content-type") || "");

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      const err = new Error("Logo image file is required.");
      err.status = 400;
      throw err;
    }
    const path = await saveBlogFeaturedImage(file);
    const brandKitJson = mergeBrandKitForSave(
      { ...normalizeBrandKit(existing.brandKitJson), logoPath: path, enabled: true },
      existing.brandKitJson
    );
    const config = await saveConfig(siteLink, { brandKitJson });
    return { path, config: sanitize(config) };
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "").trim();

  if (action === "suggest") {
    const kit = await suggestBrandKitFromLogo(
      body.logoPath || normalizeBrandKit(existing.brandKitJson).logoPath,
      existing.brandKitJson
    );
    const config = await saveConfig(siteLink, { brandKitJson: kit });
    return { brandKitJson: kit, config: sanitize(config) };
  }

  if (action === "figma-pull") {
    const current = normalizeBrandKit(existing.brandKitJson);
    const patched = mergeBrandKitForSave(
      {
        ...current,
        figmaApiToken: body.figmaApiToken !== undefined ? body.figmaApiToken : current.figmaApiToken,
        figmaFileUrl: body.figmaFileUrl !== undefined ? body.figmaFileUrl : current.figmaFileUrl,
        figmaNodeId: body.figmaNodeId !== undefined ? body.figmaNodeId : current.figmaNodeId,
      },
      existing.brandKitJson
    );
    const pulled = await pullFigmaTemplate(patched);
    const brandKitJson = {
      ...patched,
      figmaTemplatePath: pulled.path,
      figmaFileUrl: body.figmaFileUrl || patched.figmaFileUrl,
      figmaNodeId: pulled.nodeId,
      mode: "figma",
      enabled: true,
    };
    const config = await saveConfig(siteLink, { brandKitJson });
    return { path: pulled.path, config: sanitize(config) };
  }

  if (action === "save" || body.brandKitJson) {
    const brandKitJson = mergeBrandKitForSave(body.brandKitJson || body, existing.brandKitJson);
    const config = await saveConfig(siteLink, { brandKitJson });
    return { config: sanitize(config) };
  }

  const err = new Error("Unknown brand-kit action.");
  err.status = 400;
  throw err;
}
