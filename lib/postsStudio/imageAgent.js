import { generateImage, socialImageSizeForPlatform } from "../blogStudio/providers.js";
import { DEFAULT_IMAGE_PROMPT_SYSTEM } from "./defaults.js";
import { saveApprovalMediaBuffer } from "../approvalMedia.js";
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
  post = {},
  topic = "",
  variantNote = "",
  referenceCount = 0,
} = {}) {
  const system = String(config.imagePromptSystem || DEFAULT_IMAGE_PROMPT_SYSTEM).trim();
  const siteGuidelines = String(config.imagePrompt || "").trim();
  const imageDirection = String(
    config.topicImagePrompt || post?.image_prompt || post?.imagePrompt || ""
  ).trim();
  const title = String(post?.title || "").trim();
  const caption = String(post?.caption || "").trim();
  const alt = String(post?.alt_text || post?.altText || "").trim();
  const platform = String(post?.platform || config.defaultPlatform || "both").toLowerCase();
  const sizeHint =
    platform === "facebook"
      ? "Aspect: Facebook landscape feed ≈1.91:1."
      : "Aspect: Instagram square feed 1:1.";

  // Subject FIRST so edits/generations stay on-topic; style refs second.
  const subject = buildSubjectImageBrief({
    topic: topic || config.runTopic || "",
    title,
    captionOrExcerpt: caption,
    imageDirection,
    altText: alt,
    kind: "social",
  });

  const kit = normalizeBrandKit(config.brandKitJson);
  const aiChrome = kit.enabled && kit.mode === "ai";
  return [
    subject,
    referenceStylePromptBlock(referenceCount),
    system || DEFAULT_IMAGE_PROMPT_SYSTEM,
    siteGuidelines ? `Site visual guidelines:\n${siteGuidelines}` : "",
    sizeHint,
    aiChrome
      ? aiBrandPromptBlock(kit)
      : "No logos, watermarks, or dense text overlays.",
    variantNote ? `Variation (same subject):\n${variantNote}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 8000);
}

async function generateOne({ config, post, topic = "", variantNote = "" }) {
  const referenceImages = await loadStudioReferenceImages(config, { label: "postsStudio" });
  const kit = normalizeBrandKit(config.brandKitJson);
  if (kit.enabled && kit.mode === "ai") {
    const logoRef = await loadBrandLogoAsReference(kit);
    if (logoRef) referenceImages.push(logoRef);
  }
  const prompt = buildImagePrompt({
    config,
    post,
    topic,
    variantNote,
    referenceCount: referenceImages.length,
  });
  const platform = String(post?.platform || config.defaultPlatform || "both").toLowerCase();
  const size = socialImageSizeForPlatform(platform);

  // Prefer a full gpt-image model when locking style from references (mini = weak fidelity).
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
    size,
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
  // Always stamp matte + logo when enabled (AI mode may also paint chrome; Sharp is the guarantee).
  if (kit.enabled) {
    try {
      const framed = await applyBrandFrame(outBuffer, kit);
      if (framed.applied) {
        outBuffer = framed.buffer;
        outMime = "image/jpeg";
      }
    } catch (err) {
      console.warn(`[postsStudio] brand frame failed: ${err.message}`);
    }
  }

  const imagePath = await saveApprovalMediaBuffer(outBuffer, outMime);
  return {
    imagePath,
    costUsd: result.costUsd || 0,
    model: result.model,
    provider: result.provider,
    usedReference: Boolean(result.usedReference),
    referenceCount: referenceImages.length,
    size,
    promptPreview: prompt.slice(0, 400),
  };
}

export async function runImageAgent({ config, post, topic = "" }) {
  const primary = await generateOne({ config, post, topic });
  const backupPaths = [];
  let totalCost = primary.costUsd || 0;

  if (config.generateBackupImages) {
    for (const note of BACKUP_VARIANTS) {
      try {
        const alt = await generateOne({ config, post, topic, variantNote: note });
        backupPaths.push(alt.imagePath);
        totalCost += alt.costUsd || 0;
      } catch (err) {
        console.warn(`[postsStudio] backup image failed: ${err.message}`);
      }
    }
  }

  return {
    imagePath: primary.imagePath,
    backupImagePaths: backupPaths.slice(0, 3),
    altText: String(post?.alt_text || post?.altText || "").trim() || null,
    costUsd: totalCost,
    model: primary.model,
    provider: primary.provider,
    usedReference: primary.usedReference,
    referenceCount: primary.referenceCount,
    preview: primary.imagePath,
    size: primary.size,
    promptPreview: primary.promptPreview,
  };
}
