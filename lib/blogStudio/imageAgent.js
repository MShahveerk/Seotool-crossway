import { generateImage } from "./providers.js";
import { DEFAULT_IMAGE_PROMPT_SYSTEM } from "./defaults.js";
import { saveBlogFeaturedImageFromBuffer } from "../blogMedia.js";
import {
  loadStudioReferenceImages,
  referenceStylePromptBlock,
  buildSubjectImageBrief,
} from "../studioReferenceImage.js";
import {
  aiBrandPromptBlock,
  applyBrandFrame,
  loadBrandLogoAsReference,
  normalizeBrandKit,
} from "../studioBrandKit.js";

const BACKUP_VARIANTS = [
  "Alternate A: different camera angle of the SAME subject; keep style reference look; no text overlays.",
  "Alternate B: tighter crop on the SAME subject; keep style reference look; no text overlays.",
  "Alternate C: alternate lighting of the SAME subject within the reference palette; no text overlays.",
];

export function buildImagePrompt({
  config = {},
  article = {},
  topic = "",
  variantNote = "",
  referenceCount = 0,
} = {}) {
  const system = String(config.imagePromptSystem || DEFAULT_IMAGE_PROMPT_SYSTEM).trim();
  const siteGuidelines = String(config.imagePrompt || "").trim();
  const imageDirection = String(
    config.topicImagePrompt || article?.image_prompt || ""
  ).trim();
  const title = String(article?.title || "").trim();
  const excerpt = String(article?.excerpt || "").trim();
  const alt = String(article?.alt_text || "").trim();

  const subject = buildSubjectImageBrief({
    topic: topic || config.runTopic || "",
    title,
    captionOrExcerpt: excerpt,
    imageDirection,
    altText: alt,
    kind: "blog",
  });

  const kit = normalizeBrandKit(config.brandKitJson);
  const aiChrome = kit.enabled && kit.mode === "ai";
  return [
    subject,
    referenceStylePromptBlock(referenceCount),
    system || DEFAULT_IMAGE_PROMPT_SYSTEM,
    siteGuidelines ? `Site visual guidelines:\n${siteGuidelines}` : "",
    aiChrome
      ? aiBrandPromptBlock(kit)
      : "No logos, watermarks, or dense text overlays.",
    variantNote ? `Variation (same subject):\n${variantNote}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 8000);
}

async function generateOne({ config, article, topic = "", variantNote = "" }) {
  const referenceImages = await loadStudioReferenceImages(config, { label: "blogStudio" });
  const kit = normalizeBrandKit(config.brandKitJson);
  if (kit.enabled && kit.mode === "ai") {
    const logoRef = await loadBrandLogoAsReference(kit);
    if (logoRef) referenceImages.push(logoRef);
  }
  const prompt = buildImagePrompt({
    config,
    article,
    topic,
    variantNote,
    referenceCount: referenceImages.length,
  });

  let imageModel = String(config.imageModel || "gpt-image-1").trim();
  if (referenceImages.length && /mini/i.test(imageModel)) {
    imageModel = "gpt-image-1";
  }

  const result = await generateImage({
    provider: config.imageProvider,
    model: imageModel,
    prompt,
    siteConfig: config,
    referenceImages,
    size: "1536x1024",
    quality: referenceImages.length ? "high" : "medium",
    outputFormat: "jpeg",
    requireReference: referenceImages.length > 0,
  });

  if (referenceImages.length && !result.usedReference) {
    const err = new Error(
      "Image API did not apply the Assets reference image(s). Re-upload under Assets and retry."
    );
    err.status = 502;
    throw err;
  }

  let outBuffer = result.buffer;
  let outMime = result.mime || "image/jpeg";
  if (kit.enabled && kit.mode !== "ai") {
    const framed = await applyBrandFrame(outBuffer, kit);
    if (framed.applied) {
      outBuffer = framed.buffer;
      outMime = "image/jpeg";
    }
  }

  const featuredImagePath = await saveBlogFeaturedImageFromBuffer(outBuffer, outMime);
  return {
    featuredImagePath,
    costUsd: result.costUsd || 0,
    model: result.model,
    provider: result.provider,
    usedReference: Boolean(result.usedReference),
    referenceCount: referenceImages.length,
    promptPreview: prompt.slice(0, 400),
  };
}

export async function runImageAgent({ config, article, topic = "" }) {
  const primary = await generateOne({ config, article, topic });
  const backupPaths = [];
  let totalCost = primary.costUsd || 0;

  if (config.generateBackupImages) {
    for (const note of BACKUP_VARIANTS) {
      try {
        const alt = await generateOne({ config, article, topic, variantNote: note });
        backupPaths.push(alt.featuredImagePath);
        totalCost += alt.costUsd || 0;
      } catch (err) {
        console.warn(`[blogStudio] backup image failed: ${err.message}`);
      }
    }
  }

  return {
    featuredImagePath: primary.featuredImagePath,
    backupImagePaths: backupPaths.slice(0, 3),
    altText: String(article?.alt_text || "").trim() || null,
    costUsd: totalCost,
    model: primary.model,
    provider: primary.provider,
    preview: primary.featuredImagePath,
    usedReference: primary.usedReference,
    referenceCount: primary.referenceCount,
    promptPreview: primary.promptPreview,
  };
}
