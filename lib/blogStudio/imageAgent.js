import { generateImage } from "./providers.js";
import { DEFAULT_IMAGE_PROMPT_SYSTEM } from "./defaults.js";
import { saveBlogFeaturedImageFromBuffer } from "../blogMedia.js";

export async function runImageAgent({ config, article }) {
  const system = config.imagePromptSystem || DEFAULT_IMAGE_PROMPT_SYSTEM;
  const topicPrompt =
    config.imagePrompt ||
    article?.image_prompt ||
    `Featured image for: ${article?.title || "SEO blog article"}`;
  const prompt = `${system}\n\nTopic prompt:\n${topicPrompt}\n\nAlt guidance: ${article?.alt_text || ""}`.slice(
    0,
    3800
  );

  const result = await generateImage({
    provider: config.imageProvider,
    model: config.imageModel,
    prompt,
    siteConfig: config,
  });

  const featuredImagePath = await saveBlogFeaturedImageFromBuffer(result.buffer, result.mime);
  return {
    featuredImagePath,
    altText: String(article?.alt_text || "").trim() || null,
    costUsd: result.costUsd,
    model: result.model,
    provider: result.provider,
    preview: featuredImagePath,
  };
}
