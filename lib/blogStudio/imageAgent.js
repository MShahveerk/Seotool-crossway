import { generateImage } from "./providers.js";
import { DEFAULT_IMAGE_PROMPT_SYSTEM } from "./defaults.js";
import { loadBlogUploadBuffer, saveBlogFeaturedImageFromBuffer } from "../blogMedia.js";

const BACKUP_VARIANTS = [
  "Alternate A: different composition and camera angle; keep brand look; no text overlays.",
  "Alternate B: tighter crop / stronger focal subject; same topic; no text overlays.",
  "Alternate C: softer lighting / alternate color emphasis; same topic; no text overlays.",
];

/**
 * Build the layered image prompt used for both manual and auto runs:
 * 1) system style guidelines (Agents → Image system prompt)
 * 2) site visual guidelines (Assets → Image generation prompt)
 * 3) per-run / Excel / article direction
 */
export function buildImagePrompt({ config = {}, article = {}, variantNote = "" } = {}) {
  const system = String(config.imagePromptSystem || DEFAULT_IMAGE_PROMPT_SYSTEM).trim();
  const siteGuidelines = String(config.imagePrompt || "").trim();
  const topicDirection = String(
    config.topicImagePrompt || article?.image_prompt || ""
  ).trim();
  const title = String(article?.title || "").trim();
  const alt = String(article?.alt_text || "").trim();

  const parts = [
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
    config.referenceImagePath
      ? "A reference image is attached. Match its style, lighting, color grade, and composition language closely while depicting the article topic. Do not copy text overlays from the reference."
      : "",
  ].filter(Boolean);

  return parts.join("\n\n").slice(0, 12000);
}

async function generateOne({ config, article, variantNote = "" }) {
  const prompt = buildImagePrompt({ config, article, variantNote });

  let referenceImage = null;
  const refPath = String(config.referenceImagePath || "").trim();
  if (refPath) {
    referenceImage = await loadBlogUploadBuffer(refPath);
    if (!referenceImage) {
      console.warn(
        `[blogStudio] reference image missing on disk: ${refPath} — continuing without reference`
      );
    }
  }

  const result = await generateImage({
    provider: config.imageProvider,
    model: config.imageModel,
    prompt,
    siteConfig: config,
    referenceImage,
    size: "1536x1024",
    quality: "medium",
    outputFormat: "jpeg",
  });

  const featuredImagePath = await saveBlogFeaturedImageFromBuffer(
    result.buffer,
    result.mime || "image/jpeg"
  );
  return {
    featuredImagePath,
    costUsd: result.costUsd || 0,
    model: result.model,
    provider: result.provider,
    usedReference: Boolean(referenceImage),
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
