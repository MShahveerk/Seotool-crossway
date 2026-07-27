/**
 * Unified AI chat completions — OpenRouter, OpenAI, or Anthropic.
 */
import axios from "axios";
import { parseAiJsonResponse } from "./aiJsonParse.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export const AI_PROVIDERS = {
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    envKey: "OPENROUTER_API_KEY",
    modelEnv: "OPENROUTER_MODEL_KEYWORD",
    defaultModel: "openrouter/free",
  },
  openai: {
    id: "openai",
    label: "OpenAI (ChatGPT)",
    envKey: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL_KEYWORD",
    defaultModel: "gpt-4o-mini",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic (Claude)",
    envKey: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_MODEL_KEYWORD",
    defaultModel: "claude-sonnet-4-20250514",
  },
};

function hasKey(providerId) {
  const meta = AI_PROVIDERS[providerId];
  if (!meta) return false;
  return Boolean(String(process.env[meta.envKey] || "").trim());
}

function resolveProviderId(preferred) {
  const pref = String(preferred || process.env.AI_KEYWORD_PROVIDER || "auto")
    .trim()
    .toLowerCase();

  if (pref !== "auto" && AI_PROVIDERS[pref]) {
    if (!hasKey(pref)) {
      const err = new Error(`${AI_PROVIDERS[pref].label} is selected but ${AI_PROVIDERS[pref].envKey} is not set.`);
      err.status = 503;
      throw err;
    }
    return pref;
  }

  for (const id of ["openrouter", "anthropic", "openai"]) {
    if (hasKey(id)) return id;
  }

  const err = new Error(
    "No AI provider configured. Set OPENROUTER_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY in .env."
  );
  err.status = 503;
  throw err;
}

/** Keyword research model — dedicated env, then shared OpenRouter vars, then free router. */
export function resolveOpenRouterKeywordModel() {
  const candidates = [
    process.env.OPENROUTER_MODEL_KEYWORD,
    process.env.OPENROUTER_MODEL_PROMPT,
    process.env.OPENROUTER_MODEL_BLOG,
    process.env.OPENROUTER_MODEL_CAPTION,
    AI_PROVIDERS.openrouter.defaultModel,
  ];
  for (const value of candidates) {
    const model = String(value || "").trim();
    if (model) return model;
  }
  return "openrouter/free";
}

function supportsJsonResponseFormat(model) {
  const m = String(model || "").toLowerCase();
  if (m === "openrouter/free") return false;
  if (m.endsWith(":free")) return false;
  return true;
}

async function invokeProvider(providerId, { apiKey, model, messages, temperature, siteUrl, appName, maxTokens, timeoutMs }) {
  const tokens = maxTokens ?? (Number(process.env.AI_KEYWORD_MAX_TOKENS) || 4096);
  const timeout = timeoutMs ?? 120000;

  if (providerId === "openrouter") {
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
    if (siteUrl) {
      headers["HTTP-Referer"] = siteUrl;
      headers["X-Title"] = appName;
    }
    const body = { model, temperature, messages, max_tokens: tokens };
    if (supportsJsonResponseFormat(model)) {
      body.response_format = { type: "json_object" };
    }
    const res = await axios.post(OPENROUTER_URL, body, { headers, timeout });
    return res.data?.choices?.[0]?.message?.content || "";
  }

  if (providerId === "openai") {
    const res = await axios.post(
      OPENAI_URL,
      { model, temperature, messages, max_tokens: tokens, response_format: { type: "json_object" } },
      { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, timeout }
    );
    return res.data?.choices?.[0]?.message?.content || "";
  }

  const system = messages.find((m) => m.role === "system")?.content || "";
  const userMessages = messages.filter((m) => m.role !== "system");
  const res = await axios.post(
    ANTHROPIC_URL,
    {
      model,
      max_tokens: tokens,
      temperature,
      system,
      messages: userMessages.map((m) => ({ role: m.role, content: m.content })),
    },
    {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      timeout,
    }
  );
  const block = res.data?.content?.find((b) => b.type === "text");
  return block?.text || "";
}

const JSON_RETRY_HINT =
  "CRITICAL: Reply with ONE raw JSON object only. No markdown fences, no commentary before or after JSON.";

/**
 * Run a chat completion and parse JSON robustly (retries once on parse failure).
 */
export async function chatCompletionJson(messages, { temperature = 0.35, provider: preferred, maxTokens, timeoutMs } = {}) {
  const providerId = resolveProviderId(preferred);
  const meta = AI_PROVIDERS[providerId];
  const apiKey = String(process.env[meta.envKey] || "").trim();
  const model =
    providerId === "openrouter"
      ? resolveOpenRouterKeywordModel()
      : String(process.env[meta.modelEnv] || meta.defaultModel).trim();
  const siteUrl = String(process.env.OPENROUTER_SITE_URL || process.env.NEXTAUTH_URL || "").trim();
  const appName = String(process.env.OPENROUTER_APP_NAME || "Crossway SEO Tool").trim();

  const attempts = [
    { temperature, messages },
    {
      temperature: 0.15,
      messages: [
        ...messages,
        {
          role: "user",
          content: JSON_RETRY_HINT,
        },
      ],
    },
  ];

  let lastParseError = null;
  let lastRaw = "";

  for (let i = 0; i < attempts.length; i++) {
    let raw;
    try {
      raw = await invokeProvider(providerId, {
        apiKey,
        model,
        messages: attempts[i].messages,
        temperature: attempts[i].temperature,
        siteUrl,
        appName,
        maxTokens,
        timeoutMs,
      });
    } catch (error) {
      const message =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.response?.data?.error?.type ||
        error.message;
      const err = new Error(message || `${meta.label} request failed.`);
      err.status = error?.response?.status || 502;
      throw err;
    }

    lastRaw = raw;
    try {
      const data = parseAiJsonResponse(raw);
      return { data, provider: providerId, model, attempt: i + 1 };
    } catch (error) {
      lastParseError = error;
    }
  }

  console.warn(
    `[aiProvider] JSON parse failed after ${attempts.length} attempts (${model}). Preview:`,
    String(lastRaw).slice(0, 400)
  );

  const err = new Error(
    lastParseError?.message ||
      `${meta.label} returned invalid JSON after retry. Try OPENROUTER_MODEL_KEYWORD=google/gemma-4-31b-it:free or a paid model.`
  );
  err.status = 502;
  throw err;
}

export function getAiKeywordProviderStatus() {
  const preferred = String(process.env.AI_KEYWORD_PROVIDER || "auto").trim().toLowerCase();
  const available = Object.keys(AI_PROVIDERS).filter(hasKey);
  let active = null;
  try {
    active = resolveProviderId(preferred);
  } catch {
    active = null;
  }

  return {
    preferred,
    active,
    available: available.map((id) => ({
      id,
      label: AI_PROVIDERS[id].label,
      model:
        id === "openrouter"
          ? resolveOpenRouterKeywordModel()
          : String(process.env[AI_PROVIDERS[id].modelEnv] || AI_PROVIDERS[id].defaultModel).trim(),
    })),
    configured: available.length > 0,
  };
}
