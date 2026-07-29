import { generateImage } from "./providers.js";
import { DEFAULT_IMAGE_PROMPT_SYSTEM } from "./defaults.js";
import { saveBlogFeaturedImageFromBuffer } from "../blogMedia.js";
import {
  loadStudioReferenceImage,
  referenceStylePromptBlock,
} from "../studioReferenceImage.js";

const BACKUP_VARIANTS = [
  "Alternate A: different composition and camera angle; keep the attached reference look; no text overlays.",
  "Alternate B: tighter crop / stronger focal subject; same topic; keep the attached reference look; no text overlays.",
  "Alternate C: softer lighting / alternate color emphasis within the reference palette; same topic; no text overlays.",
];

/**
 * Build the layered image prompt used for both manual and auto runs:
 * 1) reference-image fidelity (when Assets image is set) — highest priority
 * 2) system style guidelines (Agents → Image system prompt)
 * 3) site visual guidelines (Assets → Image generation prompt)
 * 4) per-run / Excel / article direction
 */
export function buildImagePrompt({
  config = {},
  article = {},
  variantNote = "",
  hasReference = false,
} = {}) {
  const system = String(config.imagePromptSystem || DEFAULT_IMAGE_PROMPT_SYSTEM).trim();
  const siteGuidelines = String(config.imagePrompt || "").trim();
  const topicDirection = String(
    config.topicImagePrompt || article?.image_prompt || ""
  ).trim();
  const title = String(article?.title || "").trim();
  const alt = String(article?.alt_text || "").trim();

  const parts = [
    referenceStylePromptBlock(hasReference),
    system || DEFAULT_IMAGE_PROMPT_SYSTEM,
    siteGuidelines
      ? `Site visual guidelines (must follow):\n${siteGuidelines}`
      : "Site visual guidelines: match the brand’s professional featured-image look.",
    topicDirection
      ? `This article’s image direction:\n${topicDirection}`
      : title
        ? `This article’s image direction:\nFeatured image for: ${title}`
        : "This article’s image direction:\nCreate a relevant SEO blog featured image.",
    "Compose as a wide blog hero (≈1.91:1 / 1536x1024).",
    variantNote ? `Variation instruction:\n${variantNote}` : "",
    alt ? `Alt-text guidance: ${alt}` : "",
  ].filter(Boolean);

  return parts.join("\n\n").slice(0, 12000);
}

async function generateOne({ config, article, variantNote = "" }) {
  const referenceImage = await loadStudioReferenceImage(config.referenceImagePath, {
    required: true,
    label: "blogStudio",
  });
  const hasReference = Boolean(referenceImage);
  const prompt = buildImagePrompt({ config, article, variantNote, hasReference });

  const result = await generateImage({
    provider: config.imageProvider,
    model: config.imageModel,
    prompt,
    siteConfig: config,
    referenceImage,
    size: "1536x1024",
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

  const featuredImagePath = await saveBlogFeaturedImageFromBuffer(
    result.buffer,
    result.mime || "image/jpeg"
  );
  return {
    featuredImagePath,
    costUsd: result.costUsd || 0,
    model: result.model,
    provider: result.provider,
    usedReference: Boolean(result.usedReference),
  };
}

export async function runImageAgent({ config, article }) {
  const primary = await generateOne({ config, article });
  const backupPaths = [];
  let totalCost = primary.costUsd || 0;

  if (config.generateBackupImages) {
    for (const note of BACKUP_VARIANTS) {
      try {
        const alt = await generateOne({ config, article, variantNote: note });
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
  };
}
