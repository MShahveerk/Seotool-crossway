/**
 * Unified chat + image providers for Blog Automation Studio.
 */
import axios from "axios";
import sharp from "sharp";
import { parseAiJson } from "../parseAiJson.js";
import { studioClockSystemPreamble } from "../studioClock.js";
import { estimateChatCostUsd, estimateImageCostUsd } from "./costs.js";
import {
  defaultImageModelForProvider,
  extractSvgMarkup,
  imageModelForReferences,
  normalizeAnthropicImageModel,
} from "./imageModels.js";

/**
 * Per-request ceiling for provider calls. A hung/rate-limited request must FAIL the
 * stage (recoverable — re-run the seed) rather than stall the run forever as "running".
 * Generous by default so legit long blog/image generations still finish; set
 * BLOG_STUDIO_HTTP_TIMEOUT_MS=0 to disable entirely.
 */
const PROVIDER_HTTP_TIMEOUT_MS = (() => {
  const raw = process.env.BLOG_STUDIO_HTTP_TIMEOUT_MS;
  const n = raw == null || raw === "" ? 300000 : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 300000;
})();

function extractJsonObject(text) {
  return parseAiJson(text);
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
  signal = null,
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
  let systemText = studioClockSystemPreamble(system || "");
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
          signal: signal || undefined,
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
        signal: signal || undefined,
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
        signal: signal || undefined,
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
    if (
      err?.name === "CanceledError" ||
      err?.code === "ERR_CANCELED" ||
      signal?.aborted
    ) {
      const cancelled = new Error("Cancelled.");
      cancelled.cancelled = true;
      cancelled.status = 499;
      throw cancelled;
    }
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

export {
  defaultImageModelForProvider,
  extractSvgMarkup,
  imageModelForReferences,
  normalizeAnthropicImageModel,
};

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

function sizeToAspectRatio(size) {
  const s = normalizeImageSize(size, "1024x1024");
  if (s === "1536x1024") return "3:2";
  if (s === "1024x1536") return "2:3";
  return "1:1";
}

/** OpenRouter needs vendor/model slugs; bare OpenAI ids get openai/ prefix. */
export function normalizeOpenRouterImageModel(model) {
  const m = String(model || "").trim();
  if (!m) return "openai/gpt-image-2";
  if (m.includes("/")) return m;
  if (/^(gpt-image|chatgpt-image|dall-e)/i.test(m)) return `openai/${m}`;
  return m;
}

/** Strip openai/ when calling OpenAI directly. */
export function normalizeOpenAiImageModel(model) {
  const m = String(model || "gpt-image-2").trim();
  if (m.toLowerCase().startsWith("openai/")) return m.slice("openai/".length);
  return m || "gpt-image-2";
}

function collectReferenceBuffers({ referenceImage, referenceImages }) {
  const refs = [];
  const refList = Array.isArray(referenceImages)
    ? referenceImages
    : referenceImage
      ? [referenceImage]
      : [];
  for (const item of refList) {
    const normalized = normalizeReferenceBuffer(item);
    if (normalized) refs.push(normalized);
  }
  return refs;
}

function resolveImageOutputFormat(outputFormat) {
  const fmtIn = String(outputFormat || "jpeg").toLowerCase();
  return fmtIn === "jpg" || fmtIn === "jpeg" ? "jpeg" : fmtIn === "webp" ? "webp" : "png";
}

function mimeFromOutputFormat(resolvedFormat) {
  return resolvedFormat === "jpeg"
    ? "image/jpeg"
    : resolvedFormat === "webp"
      ? "image/webp"
      : "image/png";
}

async function bufferFromImageApiPayload(data, fallbackMime) {
  const extracted = extractImageBuffer(data, fallbackMime);
  let buffer = extracted.buffer;
  if (!buffer && extracted.url) {
    const img = await axios.get(extracted.url, {
      responseType: "arraybuffer",
      timeout: PROVIDER_HTTP_TIMEOUT_MS,
    });
    buffer = Buffer.from(img.data);
  }
  if (!buffer && data?.data?.[0]?.b64_json) {
    buffer = Buffer.from(data.data[0].b64_json, "base64");
  }
  // OpenRouter chat-completions style: message.images / content parts
  if (!buffer) {
    const msg = data?.choices?.[0]?.message;
    const parts = Array.isArray(msg?.images)
      ? msg.images
      : Array.isArray(msg?.content)
        ? msg.content
        : [];
    for (const part of parts) {
      const url =
        part?.image_url?.url ||
        part?.imageUrl?.url ||
        (typeof part?.image_url === "string" ? part.image_url : null) ||
        part?.url;
      if (typeof url === "string" && url.startsWith("data:")) {
        const b64 = url.split(",")[1];
        if (b64) {
          buffer = Buffer.from(b64, "base64");
          break;
        }
      }
      if (part?.b64_json) {
        buffer = Buffer.from(part.b64_json, "base64");
        break;
      }
      if (typeof url === "string" && /^https?:\/\//i.test(url)) {
        const img = await axios.get(url, {
          responseType: "arraybuffer",
          timeout: PROVIDER_HTTP_TIMEOUT_MS,
        });
        buffer = Buffer.from(img.data);
        break;
      }
    }
  }
  return buffer;
}

async function generateImageViaOpenRouter({
  apiKey,
  model,
  prompt,
  refs,
  resolvedSize,
  resolvedQuality,
  resolvedFormat,
  siteConfig,
}) {
  const siteUrl = String(process.env.OPENROUTER_SITE_URL || process.env.NEXTAUTH_URL || "").trim();
  const appName = String(process.env.OPENROUTER_APP_NAME || "Crossway SEO Tool").trim();
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (siteUrl) headers["HTTP-Referer"] = siteUrl;
  if (appName) headers["X-Title"] = appName;

  const body = {
    model,
    prompt: prompt.slice(0, 32000),
    n: 1,
    size: resolvedSize,
    aspect_ratio: sizeToAspectRatio(resolvedSize),
    quality: resolvedQuality,
    output_format: resolvedFormat,
  };
  if (refs.length) {
    body.input_references = refs.map((ref) => ({
      type: "image_url",
      image_url: {
        url: `data:${ref.mime};base64,${ref.buffer.toString("base64")}`,
      },
    }));
  }

  console.info(
    `[image] openrouter /images model=${model}, refs=${refs.length}, size=${resolvedSize}, promptChars=${prompt.length}`
  );

  const res = await axios.post("https://openrouter.ai/api/v1/images", body, {
    headers,
    timeout: PROVIDER_HTTP_TIMEOUT_MS,
    validateStatus: () => true,
  });

  if (res.status >= 400) {
    throw Object.assign(new Error("OpenRouter image request failed"), { response: res });
  }

  const mimeHint = res.data?.data?.[0]?.media_type || mimeFromOutputFormat(resolvedFormat);
  const buffer = await bufferFromImageApiPayload(res.data, mimeHint);
  if (!buffer) {
    const err = new Error("OpenRouter image API returned no image data.");
    err.status = 502;
    throw err;
  }

  const usageCost = Number(res.data?.usage?.cost);
  return {
    buffer,
    mime: mimeHint.includes("/") ? mimeHint : mimeFromOutputFormat(resolvedFormat),
    costUsd: Number.isFinite(usageCost) ? usageCost : estimateImageCostUsd({ model }),
    model,
    provider: "openrouter",
    usedReference: refs.length > 0,
    referenceCount: refs.length,
    size: resolvedSize,
    outputFormat: resolvedFormat,
    inputFidelity: null,
  };
}

async function generateImageViaOpenAi({
  apiKey,
  model,
  prompt,
  refs,
  resolvedSize,
  resolvedQuality,
  resolvedFormat,
}) {
  let data;

  if (refs.length) {
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt.slice(0, 32000));
    form.append("size", resolvedSize);
    form.append("quality", resolvedQuality);
    form.append("output_format", resolvedFormat);
    if (modelSupportsInputFidelity(model)) {
      form.append("input_fidelity", "high");
    }
    for (const ref of refs) {
      const bytes = new Uint8Array(ref.buffer);
      const file =
        typeof File !== "undefined"
          ? new File([bytes], ref.fileName, { type: ref.mime })
          : new Blob([bytes], { type: ref.mime });
      form.append("image", file, ref.fileName);
    }

    console.info(
      `[image] openai edits refs=${refs.length}, model=${model}, fidelity=${
        modelSupportsInputFidelity(model) ? "high" : "n/a"
      }, promptChars=${prompt.length}`
    );

    const editRes = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    const status = editRes.status;
    data = await editRes.json().catch(() => ({}));
    if (status >= 400) {
      const apiMsg = data?.error?.message || JSON.stringify(data).slice(0, 400);
      throw Object.assign(new Error(`OpenAI image edits (reference) failed: ${apiMsg}`), {
        response: { status, data },
      });
    }
  } else {
    console.info(`[image] openai generations model=${model}, promptChars=${prompt.length}`);
    const genRes = await axios.post(
      "https://api.openai.com/v1/images/generations",
      {
        model,
        prompt: prompt.slice(0, 32000),
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
    if (genRes.status >= 400) {
      throw Object.assign(new Error("OpenAI image request failed"), { response: genRes });
    }
    data = genRes.data;
  }

  const mimeFromFormat = mimeFromOutputFormat(resolvedFormat);
  const buffer = await bufferFromImageApiPayload(data, mimeFromFormat);
  if (!buffer) {
    const err = new Error("Image API returned no image data.");
    err.status = 502;
    throw err;
  }

  return {
    buffer,
    mime: mimeFromFormat,
    costUsd: estimateImageCostUsd({ model }),
    model,
    provider: "openai",
    usedReference: refs.length > 0,
    referenceCount: refs.length,
    size: resolvedSize,
    outputFormat: resolvedFormat,
    inputFidelity: refs.length && modelSupportsInputFidelity(model) ? "high" : null,
  };
}

function anthropicImageMaxTokens(model) {
  return /haiku/i.test(String(model || "")) ? 8192 : 16384;
}

async function rasterizeSvgToImage(svgMarkup, resolvedSize, resolvedFormat) {
  const [width, height] = String(resolvedSize)
    .split("x")
    .map((n) => Number(n) || 0);
  const w = width || 1024;
  const h = height || 1024;
  let markup = String(svgMarkup || "").trim();
  if (!/xmlns=/i.test(markup)) {
    markup = markup.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (!/\bviewBox=/i.test(markup)) {
    markup = markup.replace(/<svg\b/i, `<svg viewBox="0 0 ${w} ${h}"`);
  }
  let pipeline = sharp(Buffer.from(markup), { density: 144 }).resize(w, h, {
    fit: "cover",
    position: "centre",
  });
  if (resolvedFormat === "jpeg") pipeline = pipeline.jpeg({ quality: 88 });
  else if (resolvedFormat === "webp") pipeline = pipeline.webp({ quality: 88 });
  else pipeline = pipeline.png();
  return pipeline.toBuffer();
}

async function generateImageViaAnthropic({
  apiKey,
  model,
  prompt,
  refs,
  resolvedSize,
  resolvedFormat,
}) {
  const [width, height] = String(resolvedSize)
    .split("x")
    .map((n) => Number(n) || 0);
  const w = width || 1024;
  const h = height || 1024;
  const content = [];
  for (const ref of refs.slice(0, 4)) {
    const mediaType =
      ref.mime === "image/png" || ref.mime === "image/gif" || ref.mime === "image/webp"
        ? ref.mime
        : "image/jpeg";
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType,
        data: ref.buffer.toString("base64"),
      },
    });
  }
  content.push({
    type: "text",
    text: [
      "Draw a finished editorial marketing illustration as one complete SVG document.",
      "Output only the SVG markup. No markdown fences. No commentary.",
      `Use width="${w}" height="${h}" and viewBox="0 0 ${w} ${h}".`,
      "Style: bold flat editorial poster. One clear subject, filling most of the frame. Limited palette (4 to 6 colors). Soft gradients OK. No clip-art clutter, no tiny unreadable text, no watermarks, no logos unless the brief asks.",
      "Filled shapes only. No <image href>, no scripts, no external URLs.",
      refs.length
        ? "Reference images are attached. Match their subject, palette, and style in the drawing."
        : "",
      "",
      prompt.slice(0, 12000),
    ]
      .filter(Boolean)
      .join("\n"),
  });

  console.info(
    `[image] anthropic svg model=${model}, refs=${refs.length}, size=${resolvedSize}, promptChars=${prompt.length}`
  );

  const res = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model,
      max_tokens: anthropicImageMaxTokens(model),
      temperature: 0.4,
      messages: [{ role: "user", content }],
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
    throw Object.assign(new Error("Anthropic image request failed"), { response: res });
  }

  const blocks = Array.isArray(res.data?.content) ? res.data.content : [];
  const text = blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text || "")
    .join("\n");
  const svg = extractSvgMarkup(text);
  if (!svg) {
    const err = new Error("Anthropic returned no SVG illustration. Retry the Image agent.");
    err.status = 502;
    throw err;
  }

  let buffer;
  try {
    buffer = await rasterizeSvgToImage(svg, resolvedSize, resolvedFormat);
  } catch (err) {
    const wrap = new Error(`Could not rasterize Claude SVG: ${err.message}`);
    wrap.status = 502;
    throw wrap;
  }

  const inputTokens = Number(res.data?.usage?.input_tokens) || 0;
  const outputTokens = Number(res.data?.usage?.output_tokens) || 0;
  return {
    buffer,
    mime: mimeFromOutputFormat(resolvedFormat),
    costUsd: estimateChatCostUsd({ model, inputTokens, outputTokens }),
    model,
    provider: "anthropic",
    usedReference: refs.length > 0,
    referenceCount: refs.length,
    size: resolvedSize,
    outputFormat: resolvedFormat,
    inputFidelity: refs.length ? "vision" : null,
  };
}

export async function generateImage({
  provider = "openai",
  model = "gpt-image-2",
  prompt,
  siteConfig = {},
  referenceImage = null,
  referenceImages = null,
  size = "1024x1024",
  quality = "medium",
  outputFormat = "jpeg",
  requireReference = false,
} = {}) {
  const p = String(provider || "openai").toLowerCase();

  if (p !== "openai" && p !== "openrouter" && p !== "anthropic") {
    const err = new Error(
      `Unsupported image provider "${p}". Use OpenAI, Anthropic, or OpenRouter.`
    );
    err.status = 400;
    throw err;
  }

  const apiKey = resolveApiKey(p, siteConfig);
  if (!apiKey) {
    const err = new Error(
      p === "openrouter"
        ? "Missing OpenRouter API key for image generation. Paste it on the Agents tab and Save."
        : p === "anthropic"
          ? "Missing Anthropic API key for image generation. Paste it on the Agents tab and Save."
          : "Missing OpenAI API key for image generation. Paste it on the Agents tab and Save."
    );
    err.status = 400;
    throw err;
  }

  const cleanPrompt = String(prompt || "").trim().slice(0, 32000);
  if (!cleanPrompt) {
    const err = new Error("Image prompt is empty.");
    err.status = 400;
    throw err;
  }

  const resolvedSize = normalizeImageSize(size, "1024x1024");
  const refs = collectReferenceBuffers({ referenceImage, referenceImages });
  if (requireReference && !refs.length) {
    const err = new Error(
      "A reference image is required for this run but was not provided to the image API."
    );
    err.status = 400;
    throw err;
  }

  const preferredQuality = refs.length && quality === "medium" ? "high" : quality;
  const resolvedQuality = ["low", "medium", "high", "auto"].includes(String(preferredQuality))
    ? String(preferredQuality)
    : "medium";
  const resolvedFormat = resolveImageOutputFormat(outputFormat);

  try {
    if (p === "openrouter") {
      return await generateImageViaOpenRouter({
        apiKey,
        model: normalizeOpenRouterImageModel(model),
        prompt: cleanPrompt,
        refs,
        resolvedSize,
        resolvedQuality,
        resolvedFormat,
        siteConfig,
      });
    }

    if (p === "anthropic") {
      return await generateImageViaAnthropic({
        apiKey,
        model: normalizeAnthropicImageModel(model),
        prompt: cleanPrompt,
        refs,
        resolvedSize,
        resolvedFormat,
      });
    }

    return await generateImageViaOpenAi({
      apiKey,
      model: normalizeOpenAiImageModel(model),
      prompt: cleanPrompt,
      refs,
      resolvedSize,
      resolvedQuality,
      resolvedFormat,
    });
  } catch (err) {
    if (err.status === 400 || err.status === 502) throw err;
    throw formatProviderError(err, { provider: p, model: String(model || "").trim() });
  }
}

export { extractJsonObject, resolveApiKey };
