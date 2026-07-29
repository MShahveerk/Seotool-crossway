import { generateImage } from "../blogStudio/providers.js";
import { DEFAULT_IMAGE_PROMPT_SYSTEM } from "./defaults.js";
import { loadBlogUploadBuffer } from "../blogMedia.js";
import { saveApprovalMediaBuffer } from "../approvalMedia.js";

export function buildImagePrompt({ config = {}, post = {} } = {}) {
  const system = String(config.imagePromptSystem || DEFAULT_IMAGE_PROMPT_SYSTEM).trim();
  const siteGuidelines = String(config.imagePrompt || "").trim();
  const topicDirection = String(
    config.topicImagePrompt || post?.image_prompt || post?.imagePrompt || ""
  ).trim();
  const title = String(post?.title || "").trim();
  const alt = String(post?.alt_text || post?.altText || "").trim();

  return [
    system || DEFAULT_IMAGE_PROMPT_SYSTEM,
    siteGuidelines
      ? `Site visual guidelines (must follow):\n${siteGuidelines}`
      : "Site visual guidelines: clean, brand-ready social feed creative.",
    topicDirection
      ? `This post’s image direction:\n${topicDirection}`
      : title
        ? `This post’s image direction:\nFeed image for: ${title}`
        : "This post’s image direction:\nCreate a relevant social feed image.",
    alt ? `Alt-text guidance: ${alt}` : "",
    config.referenceImagePath
      ? "A reference image is attached. Match its style, lighting, and composition while depicting the post topic. Do not copy text overlays."
      : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 12000);
}

export async function runImageAgent({ config, post }) {
  const prompt = buildImagePrompt({ config, post });
  let referenceImage = null;
  const refPath = String(config.referenceImagePath || "").trim();
  if (refPath) {
    referenceImage = await loadBlogUploadBuffer(refPath);
  }

  const result = await generateImage({
    provider: config.imageProvider,
    model: config.imageModel,
    prompt,
    siteConfig: config,
    referenceImage,
  });

  const imagePath = await saveApprovalMediaBuffer(result.buffer, result.mime);
  return {
    imagePath,
    altText: String(post?.alt_text || post?.altText || "").trim() || null,
    costUsd: result.costUsd,
    model: result.model,
    provider: result.provider,
    usedReference: Boolean(referenceImage),
    preview: imagePath,
  };
}
