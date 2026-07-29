import { generateImage } from "./providers.js";
import { DEFAULT_IMAGE_PROMPT_SYSTEM } from "./defaults.js";
import { loadBlogUploadBuffer, saveBlogFeaturedImageFromBuffer } from "../blogMedia.js";

/**
 * Build the layered image prompt used for both manual and auto runs:
 * 1) system style guidelines (Agents → Image system prompt)
 * 2) site visual guidelines (Assets → Image generation prompt)
 * 3) per-run / Excel / article direction
 */
export function buildImagePrompt({ config = {}, article = {} } = {}) {
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
    alt ? `Alt-text guidance: ${alt}` : "",
    config.referenceImagePath
      ? "A reference image is attached. Match its style, lighting, color grade, and composition language closely while depicting the article topic. Do not copy text overlays from the reference."
      : "",
  ].filter(Boolean);

  return parts.join("\n\n").slice(0, 12000);
}

export async function runImageAgent({ config, article }) {
  const prompt = buildImagePrompt({ config, article });

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
  });

  const featuredImagePath = await saveBlogFeaturedImageFromBuffer(result.buffer, result.mime);
  return {
    featuredImagePath,
    altText: String(article?.alt_text || "").trim() || null,
    costUsd: result.costUsd,
    model: result.model,
    provider: result.provider,
    preview: featuredImagePath,
    usedReference: Boolean(referenceImage),
    promptPreview: prompt.slice(0, 500),
  };
}
