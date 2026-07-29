/**
 * Unified chat + image providers for Blog Automation Studio.
 */
import axios from "axios";
import { estimateChatCostUsd, estimateImageCostUsd } from "./costs.js";

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function resolveApiKey(provider, siteConfig = {}) {
  const p = String(provider || "").toLowerCase();
  if (p === "openai") {
    return (
      String(siteConfig.openaiApiKey || "").trim() ||
      String(process.env.OPENAI_API_KEY || "").trim()
    );
  }
  if (p === "anthropic") {
    return (
      String(siteConfig.anthropicApiKey || "").trim() ||
      String(process.env.ANTHROPIC_API_KEY || "").trim()
    );
  }
  if (p === "openrouter") {
    return (
      String(siteConfig.openrouterApiKey || "").trim() ||
      String(process.env.OPENROUTER_API_KEY || "").trim()
    );
  }
  return "";
}

export function hasProviderKey(provider, siteConfig = {}) {
  return Boolean(resolveApiKey(provider, siteConfig));
}

/**
 * @returns {{ text, json, inputTokens, outputTokens, costUsd, model, provider, raw }}
 */
export async function chatCompletion({
  provider,
  model,
  system,
  user,
  siteConfig = {},
  temperature = 0.4,
  maxTokens = 8000,
  jsonMode = true,
} = {}) {
  const p = String(provider || "openai").toLowerCase();
  const m = String(model || "").trim();
  const apiKey = resolveApiKey(p, siteConfig);
  if (!apiKey) {
    const err = new Error(`Missing API key for provider "${p}". Add it in Studio settings or server env.`);
    err.status = 400;
    throw err;
  }

  let text = "";
  let inputTokens = 0;
  let outputTokens = 0;

  if (p === "anthropic") {
    const res = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: m,
        max_tokens: maxTokens,
        temperature,
        system: system || undefined,
        messages: [{ role: "user", content: user }],
      },
      {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        timeout: 180000,
      }
    );
    const blocks = Array.isArray(res.data?.content) ? res.data.content : [];
    text = blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text || "")
      .join("\n")
      .trim();
    inputTokens = Number(res.data?.usage?.input_tokens) || 0;
    outputTokens = Number(res.data?.usage?.output_tokens) || 0;
  } else if (p === "openrouter") {
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
    const siteUrl = String(process.env.OPENROUTER_SITE_URL || process.env.NEXTAUTH_URL || "").trim();
    const appName = String(process.env.OPENROUTER_APP_NAME || "Crossway SEO Tool").trim();
    if (siteUrl) {
      headers["HTTP-Referer"] = siteUrl;
      headers["X-Title"] = appName;
    }
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: m,
        temperature,
        max_tokens: maxTokens,
        response_format: jsonMode ? { type: "json_object" } : undefined,
        messages: [
          ...(system ? [{ role: "system", content: system }] : []),
          { role: "user", content: user },
        ],
      },
      { headers, timeout: 180000 }
    );
    text = String(res.data?.choices?.[0]?.message?.content || "").trim();
    inputTokens = Number(res.data?.usage?.prompt_tokens) || 0;
    outputTokens = Number(res.data?.usage?.completion_tokens) || 0;
  } else {
    // openai
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: m,
        temperature,
        max_tokens: maxTokens,
        response_format: jsonMode ? { type: "json_object" } : undefined,
        messages: [
          ...(system ? [{ role: "system", content: system }] : []),
          { role: "user", content: user },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 180000,
      }
    );
    text = String(res.data?.choices?.[0]?.message?.content || "").trim();
    inputTokens = Number(res.data?.usage?.prompt_tokens) || 0;
    outputTokens = Number(res.data?.usage?.completion_tokens) || 0;
  }

  const json = extractJsonObject(text);
  const costUsd = estimateChatCostUsd({
    model: m,
    inputTokens,
    outputTokens,
    pricingOverrides: siteConfig.pricingOverrides || null,
  });

  return {
    text,
    json,
    inputTokens,
    outputTokens,
    costUsd,
    model: m,
    provider: p,
  };
}

/**
 * Generate an image; returns { buffer, mime, costUsd, model, provider }.
 */
export async function generateImage({
  provider = "openai",
  model = "gpt-image-1",
  prompt,
  siteConfig = {},
} = {}) {
  const p = String(provider || "openai").toLowerCase();
  const m = String(model || "gpt-image-1").trim();
  const apiKey = resolveApiKey(p === "openrouter" ? "openrouter" : "openai", siteConfig);
  if (!apiKey) {
    const err = new Error("Missing API key for image generation (OpenAI or OpenRouter).");
    err.status = 400;
    throw err;
  }

  const cleanPrompt = String(prompt || "").trim().slice(0, 3500);
  if (!cleanPrompt) {
    const err = new Error("Image prompt is empty.");
    err.status = 400;
    throw err;
  }

  if (p === "openrouter") {
    // Fall back to OpenAI-compatible if configured; otherwise reject clearly.
    const err = new Error("Image generation via OpenRouter is not enabled in v1. Use OpenAI provider.");
    err.status = 400;
    throw err;
  }

  const res = await axios.post(
    "https://api.openai.com/v1/images/generations",
    {
      model: m,
      prompt: cleanPrompt,
      size: "1536x1024",
      quality: "medium",
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 180000,
    }
  );

  const b64 = res.data?.data?.[0]?.b64_json;
  const url = res.data?.data?.[0]?.url;
  let buffer;
  if (b64) {
    buffer = Buffer.from(b64, "base64");
  } else if (url) {
    const img = await axios.get(url, { responseType: "arraybuffer", timeout: 60000 });
    buffer = Buffer.from(img.data);
  } else {
    const err = new Error("Image API returned no image data.");
    err.status = 502;
    throw err;
  }

  return {
    buffer,
    mime: "image/png",
    costUsd: estimateImageCostUsd({ model: m }),
    model: m,
    provider: "openai",
  };
}

export { extractJsonObject, resolveApiKey };
