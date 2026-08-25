/**
 * OpenRouter chat completions for content humanization.
 */
import { normalizeArticleHtml } from "./blogStudio/articleHtml.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export function getOpenrouterConfig() {
  const apiKey = String(process.env.OPENROUTER_API_KEY || "").trim();
  if (!apiKey) {
    const err = new Error("OPENROUTER_API_KEY is not configured on the server.");
    err.status = 503;
    throw err;
  }
  return {
    apiKey,
    siteUrl: String(process.env.OPENROUTER_SITE_URL || process.env.NEXTAUTH_URL || "").trim(),
    appName: String(process.env.OPENROUTER_APP_NAME || "Crossway SEO Tool").trim(),
  };
}

function stripMarkdownFences(text) {
  return String(text || "")
    .trim()
    .replace(/^```(?:html|markdown|text)?\s*\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();
}

export async function humanizeText(text, type = "caption") {
  const input = String(text || "").trim();
  if (!input) {
    const err = new Error("Text is required.");
    err.status = 400;
    throw err;
  }

  const kind = type === "blog" ? "blog" : "caption";
  const { apiKey, siteUrl, appName } = getOpenrouterConfig();
  const model =
    kind === "blog"
      ? process.env.OPENROUTER_MODEL_BLOG || "anthropic/claude-sonnet-5"
      : process.env.OPENROUTER_MODEL_CAPTION || "google/gemini-3.1-flash-lite";

  const systemPrompt =
    kind === "blog"
      ? "You rewrite blog content to sound natural and human-written. Preserve all HTML tags and structure (headings, paragraphs, lists, links). Keep every fact, name, number, and keyword. Do not add hype or AI clichés. Return only the rewritten HTML with no markdown code fence."
      : "You rewrite social media captions to sound natural and conversational. Keep the same meaning, CTAs, hashtags, and emojis unless they sound robotic. Return only the rewritten caption with no quotes or explanation.";

  const maxInput = kind === "caption" ? 2000 : 48000;
  const clipped = input.length > maxInput ? input.slice(0, maxInput) : input;

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (siteUrl) {
    headers["HTTP-Referer"] = siteUrl;
    headers["X-Title"] = appName;
  }

  let res;
  try {
    res = await axios.post(
      OPENROUTER_URL,
      {
        model,
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: clipped },
        ],
      },
      { headers, timeout: 120000 }
    );
  } catch (error) {
    const message = error?.response?.data?.error?.message || error?.response?.data?.message || error.message;
    const err = new Error(message || "OpenRouter request failed.");
    err.status = error?.response?.status || 502;
    throw err;
  }

  let output = stripMarkdownFences(res.data?.choices?.[0]?.message?.content);
  if (kind === "blog") output = normalizeArticleHtml(output);
  if (kind === "caption" && output.length > 2000) {
    output = output.slice(0, 2000);
  }
  if (!output) {
    const err = new Error("OpenRouter returned an empty response.");
    err.status = 502;
    throw err;
  }

  return { text: output, model };
}
