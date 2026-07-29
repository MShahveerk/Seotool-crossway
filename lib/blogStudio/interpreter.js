/**
 * Parse uploaded .txt / .docx into SEO seed fields via Interpreter agent.
 */
import mammoth from "mammoth";
import { chatCompletion } from "./providers.js";
import { DEFAULT_INTERPRETER_PROMPT } from "./defaults.js";

export async function extractTextFromUpload(file) {
  if (!file) {
    const err = new Error("File is required.");
    err.status = 400;
    throw err;
  }
  const name = String(file.name || "upload").toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".txt") || String(file.type || "").includes("text/plain")) {
    return buf.toString("utf8").slice(0, 120000);
  }

  if (name.endsWith(".docx") || String(file.type || "").includes("wordprocessingml")) {
    const result = await mammoth.extractRawText({ buffer: buf });
    return String(result.value || "").slice(0, 120000);
  }

  const err = new Error("Unsupported file type. Upload a .txt or .docx file.");
  err.status = 400;
  throw err;
}

export async function interpretDocument({ config, text }) {
  const body = String(text || "").trim();
  if (!body) {
    const err = new Error("Document text is empty.");
    err.status = 400;
    throw err;
  }

  const system = config.interpreterPrompt || DEFAULT_INTERPRETER_PROMPT;
  const result = await chatCompletion({
    provider: config.interpreterProvider,
    model: config.interpreterModel,
    system,
    user: `Extract SEO seed fields from this document:\n\n${body.slice(0, 90000)}`,
    siteConfig: config,
    jsonMode: true,
  });

  if (!result.json) {
    const err = new Error("Interpreter returned non-JSON output.");
    err.status = 502;
    throw err;
  }

  const j = result.json;
  return {
    fields: {
      topic: String(j.topic || "").trim(),
      seedPrompt: String(j.seed_prompt || j.seedPrompt || "").trim(),
      mustFollowKeywords: String(j.must_follow_keywords || j.mustFollowKeywords || "").trim(),
      secondaryKeywords: String(j.secondary_keywords || j.secondaryKeywords || "").trim(),
      targetAudience: String(j.target_audience || j.targetAudience || "").trim(),
      location: String(j.location || "").trim(),
      ctaText: String(j.cta_text || j.ctaText || "").trim(),
      ctaUrl: String(j.cta_url || j.ctaUrl || "").trim(),
      wordCountRange: String(j.word_count_range || j.wordCountRange || "").trim(),
      contentType: String(j.content_type || j.contentType || "").trim(),
      brandNotes: String(j.brand_notes || j.brandNotes || "").trim(),
      serpNotes: String(j.serp_notes || j.serpNotes || "").trim(),
      internalLinksJson: Array.isArray(j.internal_links) ? j.internal_links : [],
      externalLinksJson: Array.isArray(j.external_links) ? j.external_links : [],
    },
    usage: {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
      model: result.model,
      provider: result.provider,
    },
  };
}
