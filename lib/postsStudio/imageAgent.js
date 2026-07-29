import { generateImage, socialImageSizeForPlatform } from "../blogStudio/providers.js";
import { DEFAULT_IMAGE_PROMPT_SYSTEM } from "./defaults.js";
import { saveApprovalMediaBuffer } from "../approvalMedia.js";
import {
  loadStudioReferenceImage,
  referenceStylePromptBlock,
} from "../studioReferenceImage.js";

const BACKUP_VARIANTS = [
  "Alternate A: different composition and camera angle; keep the attached reference look; no text overlays.",
  "Alternate B: tighter crop / stronger focal subject; same topic; keep the attached reference look; no text overlays.",
  "Alternate C: softer lighting / alternate color emphasis within the reference palette; same topic; no text overlays.",
];

export function buildImagePrompt({
  config = {},
  post = {},
  variantNote = "",
  hasReference = false,
} = {}) {
  const system = String(config.imagePromptSystem || DEFAULT_IMAGE_PROMPT_SYSTEM).trim();
  const siteGuidelines = String(config.imagePrompt || "").trim();
  const topicDirection = String(
    config.topicImagePrompt || post?.image_prompt || post?.imagePrompt || ""
  ).trim();
  const title = String(post?.title || "").trim();
  const alt = String(post?.alt_text || post?.altText || "").trim();
  const platform = String(post?.platform || config.defaultPlatform || "both").toLowerCase();
  const sizeHint =
    platform === "facebook"
      ? "Compose for Facebook landscape feed (≈1.91:1). Keep subject clear with safe margins."
      : "Compose for Instagram square feed (1:1). Keep subject centered with safe margins.";

  return [
    referenceStylePromptBlock(hasReference),
    system || DEFAULT_IMAGE_PROMPT_SYSTEM,
    siteGuidelines
      ? `Site visual guidelines (must follow):\n${siteGuidelines}`
      : "Site visual guidelines: clean, brand-ready social feed creative.",
    topicDirection
      ? `This post’s image direction:\n${topicDirection}`
      : title
        ? `This post’s image direction:\nFeed image for: ${title}`
        : "This post’s image direction:\nCreate a relevant social feed image.",
    sizeHint,
    variantNote ? `Variation instruction:\n${variantNote}` : "",
    alt ? `Alt-text guidance: ${alt}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 12000);
}

async function generateOne({ config, post, variantNote = "" }) {
  const referenceImage = await loadStudioReferenceImage(config.referenceImagePath, {
    required: true,
    label: "postsStudio",
  });
  const hasReference = Boolean(referenceImage);
  const prompt = buildImagePrompt({ config, post, variantNote, hasReference });
  const platform = String(post?.platform || config.defaultPlatform || "both").toLowerCase();
  const size = socialImageSizeForPlatform(platform);

  const result = await generateImage({
    provider: config.imageProvider,
    model: config.imageModel,
    prompt,
    siteConfig: config,
    referenceImage,
    size,
    quality: hasReference ? "high" : "medium",
    outputFormat: "jpeg",
    requireReference: hasReference,
  });

  if (hasReference && !result.usedReference) {
    const err = new Error(
      "Image API did not apply the Assets reference image. Re-upload the reference and retry."
    );
    err.status = 502;
    throw err;
  }

  const imagePath = await saveApprovalMediaBuffer(result.buffer, result.mime || "image/jpeg");
  return {
    imagePath,
    costUsd: result.costUsd || 0,
    model: result.model,
    provider: result.provider,
    usedReference: Boolean(result.usedReference),
    size,
  };
}

export async function runImageAgent({ config, post }) {
  const primary = await generateOne({ config, post });
  const backupPaths = [];
  let totalCost = primary.costUsd || 0;

  if (config.generateBackupImages) {
    for (const note of BACKUP_VARIANTS) {
      try {
        const alt = await generateOne({ config, post, variantNote: note });
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
    preview: primary.imagePath,
    size: primary.size,
  };
}
