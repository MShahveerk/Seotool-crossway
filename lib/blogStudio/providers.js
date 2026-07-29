/**
 * Unified chat + image providers for Blog Automation Studio.
 */
import axios from "axios";
import { estimateChatCostUsd, estimateImageCostUsd } from "./costs.js";

/** 0 = no axios timeout — long blog/image generations must not abort mid-run. */
const PROVIDER_HTTP_TIMEOUT_MS = 0;

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

/** GPT-5 / o-series Chat Completions reject `max_tokens` — use `max_completion_tokens`. */
export function modelUsesMaxCompletionTokens(model) {
  const m = String(model || "").toLowerCase();
  if (!m) return false;
  return (
    m.includes("gpt-5") ||
    /(^|\/)o1/.test(m) ||
    /(^|\/)o3/.test(m) ||
    /(^|\/)o4/.test(m)
  );
}

/** Some newer OpenAI models only accept default temperature. */
export function modelAllowsCustomTemperature(model) {
  const m = String(model || "").toLowerCase();
  if (!m) return true;
  if (modelUsesMaxCompletionTokens(m)) return false;
  return true;
}

export function formatProviderError(err, { provider, model } = {}) {
  const p = provider || "provider";
  const m = model || "model";
  const status = err?.response?.status;
  const data = err?.response?.data;
  const apiMsg =
    data?.error?.message ||
    data?.error?.code ||
    (typeof data?.error === "string" ? data.error : null) ||
    data?.message ||
    (typeof data === "string" ? data : null) ||
    err?.message ||
    "Unknown provider error";

  let hint = "";
  const lower = String(apiMsg).toLowerCase();
  if (lower.includes("max_tokens") && lower.includes("max_completion_tokens")) {
    hint =
      " Tip: this model needs max_completion_tokens (Studio now sends that automatically — retry the run).";
  } else if (lower.includes("incorrect api key") || lower.includes("invalid api key") || lower.includes("authentication")) {
    hint = " Tip: re-save your API key on the Agents tab (paste the full key, then Save).";
  } else if (lower.includes("model") && (lower.includes("does not exist") || lower.includes("not found") || lower.includes("invalid"))) {
    hint = " Tip: check the model id on the Agents tab (e.g. gpt-5.4-mini, claude-sonnet-4-6).";
  } else if (status === 429) {
    hint = " Tip: rate limited — wait a moment and retry.";
  }

  const prefix = status ? `${p}/${m} HTTP ${status}` : `${p}/${m}`;
  const out = new Error(`${prefix}: ${apiMsg}${hint}`);
  out.status = status && status >= 400 && status < 600 ? status : 502;
  out.provider = p;
  out.model = m;
  out.providerBody = data;
  return out;
}

function buildOpenAiCompatibleBody({ model, system, user, temperature, maxTokens, jsonMode }) {
  const body = {
    model,
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      { role: "user", content: user },
    ],
  };

  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  if (modelUsesMaxCompletionTokens(model)) {
    body.max_completion_tokens = maxTokens;
  } else {
    body.max_tokens = maxTokens;
  }

  if (modelAllowsCustomTemperature(model) && temperature != null) {
    body.temperature = temperature;
  }

  return body;
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
  if (!m) {
    const err = new Error(`Model id is empty for provider "${p}". Set a model on the Agents tab.`);
    err.status = 400;
    throw err;
  }

  const apiKey = resolveApiKey(p, siteConfig);
  if (!apiKey) {
    const err = new Error(
      `Missing API key for provider "${p}". Paste it on the Agents tab and click Save (or set the server env).`
    );
    err.status = 400;
    throw err;
  }

  // json_object mode requires the word "json" somewhere in the messages for OpenAI.
  let systemText = system || "";
  let userText = String(user || "");
  if (jsonMode && p !== "anthropic") {
    const blob = `${systemText}\n${userText}`.toLowerCase();
    if (!blob.includes("json")) {
      userText = `${userText}\n\nRespond with a valid JSON object only.`;
    }
  }

  let text = "";
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    if (p === "anthropic") {
      const res = await axios.post(
        "https://api.anthropic.com/v1/messages",
        {
          model: m,
          max_tokens: maxTokens,
          temperature,
          system: systemText || undefined,
          messages: [{ role: "user", content: userText }],
        },
        {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          timeout: PROVIDER_HTTP_TIMEOUT_MS,
          validateStatus: () => true,
        }
      );
      if (res.status >= 400) {
        throw Object.assign(new Error("Anthropic request failed"), { response: res });
      }
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
      const body = buildOpenAiCompatibleBody({
        model: m,
        system: systemText,
        user: userText,
        temperature,
        maxTokens,
        jsonMode,
      });
      const res = await axios.post("https://openrouter.ai/api/v1/chat/completions", body, {
        headers,
        timeout: PROVIDER_HTTP_TIMEOUT_MS,
        validateStatus: () => true,
      });
      if (res.status >= 400) {
        throw Object.assign(new Error("OpenRouter request failed"), { response: res });
      }
      text = String(res.data?.choices?.[0]?.message?.content || "").trim();
      inputTokens = Number(res.data?.usage?.prompt_tokens) || 0;
      outputTokens = Number(res.data?.usage?.completion_tokens) || 0;
    } else {
      const body = buildOpenAiCompatibleBody({
        model: m,
        system: systemText,
        user: userText,
        temperature,
        maxTokens,
        jsonMode,
      });
      const res = await axios.post("https://api.openai.com/v1/chat/completions", body, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: PROVIDER_HTTP_TIMEOUT_MS,
        validateStatus: () => true,
      });
      if (res.status >= 400) {
        throw Object.assign(new Error("OpenAI request failed"), { response: res });
      }
      text = String(res.data?.choices?.[0]?.message?.content || "").trim();
      inputTokens = Number(res.data?.usage?.prompt_tokens) || 0;
      outputTokens = Number(res.data?.usage?.completion_tokens) || 0;
    }
  } catch (err) {
    throw formatProviderError(err, { provider: p, model: m });
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

function extractImageBuffer(data, fallbackMime = "image/jpeg") {
  const b64 = data?.data?.[0]?.b64_json;
  const url = data?.data?.[0]?.url;
  if (b64) {
    return { buffer: Buffer.from(b64, "base64"), mime: fallbackMime };
  }
  return { url, mime: fallbackMime };
}

/**
 * Generate an image; returns { buffer, mime, costUsd, model, provider }.
 * When `referenceImage` is provided, uses OpenAI /images/edits so style guidelines
 * and the uploaded reference apply (manual + auto).
 */
/** OpenAI gpt-image sizes: 1024x1024 | 1536x1024 | 1024x1536 */
export function normalizeImageSize(size, fallback = "1024x1024") {
  const s = String(size || "").trim();
  if (s === "1024x1024" || s === "1536x1024" || s === "1024x1536") return s;
  return fallback;
}

/**
 * Facebook feed → landscape 1.91:1 (1536x1024).
 * Instagram / both → square 1:1 (1024x1024) — safest IG feed crop.
 */
export function socialImageSizeForPlatform(platform) {
  const p = String(platform || "both").toLowerCase();
  if (p === "facebook") return "1536x1024";
  return "1024x1024";
}

function normalizeReferenceBuffer(referenceImage) {
  if (!referenceImage) return null;
  const raw = referenceImage.buffer ?? referenceImage;
  if (!raw) return null;
  const buffer = Buffer.isBuffer(raw)
    ? raw
    : raw instanceof Uint8Array
      ? Buffer.from(raw)
      : Buffer.isBuffer(raw?.data)
        ? raw.data
        : null;
  if (!buffer?.length) return null;
  const mime = String(referenceImage.mime || "image/png").split(";")[0].trim() || "image/png";
  const ext =
    mime === "image/jpeg"
      ? ".jpg"
      : mime === "image/webp"
        ? ".webp"
        : mime === "image/gif"
          ? ".gif"
          : ".png";
  let fileName = String(referenceImage.fileName || `reference${ext}`).replace(/[^\w.\-]+/g, "_");
  if (!/\.(png|jpe?g|webp|gif)$/i.test(fileName)) fileName = `${fileName}${ext}`;
  return { buffer, mime, fileName };
}

function modelSupportsInputFidelity(model) {
  const m = String(model || "").toLowerCase();
  if (!m.includes("gpt-image")) return false;
  if (m.includes("mini")) return false;
  // gpt-image-2 applies high fidelity by default; sending the flag is still ok for 1 / 1.5
  return true;
}

export async function generateImage({
  provider = "openai",
  model = "gpt-image-1",
  prompt,
  siteConfig = {},
  referenceImage = null,
  size = "1024x1024",
  quality = "medium",
  outputFormat = "jpeg",
  requireReference = false,
} = {}) {
  const p = String(provider || "openai").toLowerCase();
  const m = String(model || "gpt-image-1").trim();
  const apiKey = resolveApiKey(p === "openrouter" ? "openrouter" : "openai", siteConfig);
  if (!apiKey) {
    const err = new Error("Missing API key for image generation (OpenAI or OpenRouter).");
    err.status = 400;
    throw err;
  }

  const cleanPrompt = String(prompt || "").trim().slice(0, 32000);
  if (!cleanPrompt) {
    const err = new Error("Image prompt is empty.");
    err.status = 400;
    throw err;
  }

  if (p === "openrouter") {
    const err = new Error("Image generation via OpenRouter is not enabled in v1. Use OpenAI provider.");
    err.status = 400;
    throw err;
  }

  const resolvedSize = normalizeImageSize(size, "1024x1024");
  const ref = normalizeReferenceBuffer(referenceImage);
  if (requireReference && !ref) {
    const err = new Error(
      "A reference image is required for this run but was not provided to the image API."
    );
    err.status = 400;
    throw err;
  }

  // Prefer higher output quality when matching an Assets reference look.
  const preferredQuality = ref && quality === "medium" ? "high" : quality;
  const resolvedQuality = ["low", "medium", "high", "auto"].includes(String(preferredQuality))
    ? String(preferredQuality)
    : "medium";
  const resolvedFormat = ["png", "jpeg", "webp"].includes(String(outputFormat || "").toLowerCase())
    ? String(outputFormat).toLowerCase()
    : "jpeg";

  try {
    let data;
    let status;

    if (ref) {
      // Use fetch + FormData so the multipart file part is reliable in Node
      // (axios + Blob often dropped the image → generations-like results ignoring the reference).
      const form = new FormData();
      form.append("model", m);
      form.append("prompt", cleanPrompt.slice(0, 32000));
      form.append("size", resolvedSize);
      form.append("quality", resolvedQuality);
      form.append("output_format", resolvedFormat);
      if (modelSupportsInputFidelity(m)) {
        form.append("input_fidelity", "high");
      }
      const bytes = new Uint8Array(ref.buffer);
      form.append("image", new Blob([bytes], { type: ref.mime }), ref.fileName);

      const editRes = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      status = editRes.status;
      data = await editRes.json().catch(() => ({}));
      if (status >= 400) {
        throw Object.assign(new Error("OpenAI image edits (reference) request failed"), {
          response: { status, data },
        });
      }
    } else {
      const genRes = await axios.post(
        "https://api.openai.com/v1/images/generations",
        {
          model: m,
          prompt: cleanPrompt.slice(0, 32000),
          size: resolvedSize,
          quality: resolvedQuality,
          output_format: resolvedFormat,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: PROVIDER_HTTP_TIMEOUT_MS,
          validateStatus: () => true,
        }
      );
      status = genRes.status;
      data = genRes.data;
      if (status >= 400) {
        throw Object.assign(new Error("OpenAI image request failed"), { response: genRes });
      }
    }

    const mimeFromFormat =
      resolvedFormat === "jpeg"
        ? "image/jpeg"
        : resolvedFormat === "webp"
          ? "image/webp"
          : "image/png";

    const extracted = extractImageBuffer(data, mimeFromFormat);
    let buffer = extracted.buffer;
    if (!buffer && extracted.url) {
      const img = await axios.get(extracted.url, {
        responseType: "arraybuffer",
        timeout: PROVIDER_HTTP_TIMEOUT_MS,
      });
      buffer = Buffer.from(img.data);
    }
    if (!buffer) {
      const err = new Error("Image API returned no image data.");
      err.status = 502;
      throw err;
    }

    return {
      buffer,
      mime: mimeFromFormat,
      costUsd: estimateImageCostUsd({ model: m }),
      model: m,
      provider: "openai",
      usedReference: Boolean(ref),
      size: resolvedSize,
      outputFormat: resolvedFormat,
      inputFidelity: ref && modelSupportsInputFidelity(m) ? "high" : null,
    };
  } catch (err) {
    if (err.status === 502) throw err;
    throw formatProviderError(err, { provider: "openai", model: m });
  }
}

export { extractJsonObject, resolveApiKey };
