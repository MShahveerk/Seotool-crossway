/**
 * Unified AI chat completions — OpenRouter, OpenAI, or Anthropic.
 * Provider chosen via AI_KEYWORD_PROVIDER (openrouter | openai | anthropic | auto).
 */
import axios from "axios";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export const AI_PROVIDERS = {
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    envKey: "OPENROUTER_API_KEY",
    modelEnv: "OPENROUTER_MODEL_KEYWORD",
    defaultModel: "anthropic/claude-sonnet-5",
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
      model: String(process.env[AI_PROVIDERS[id].modelEnv] || AI_PROVIDERS[id].defaultModel).trim(),
    })),
    configured: available.length > 0,
  };
}

function stripJsonFences(text) {
  return String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();
}

async function callOpenRouter({ apiKey, model, messages, temperature, siteUrl, appName }) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (siteUrl) {
    headers["HTTP-Referer"] = siteUrl;
    headers["X-Title"] = appName;
  }

  const res = await axios.post(
    OPENROUTER_URL,
    { model, temperature, messages, response_format: { type: "json_object" } },
    { headers, timeout: 120000 }
  );
  return res.data?.choices?.[0]?.message?.content || "";
}

async function callOpenAI({ apiKey, model, messages, temperature }) {
  const res = await axios.post(
    OPENAI_URL,
    { model, temperature, messages, response_format: { type: "json_object" } },
    {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      timeout: 120000,
    }
  );
  return res.data?.choices?.[0]?.message?.content || "";
}

async function callAnthropic({ apiKey, model, messages, temperature }) {
  const system = messages.find((m) => m.role === "system")?.content || "";
  const userMessages = messages.filter((m) => m.role !== "system");

  const res = await axios.post(
    ANTHROPIC_URL,
    {
      model,
      max_tokens: 8192,
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
      timeout: 120000,
    }
  );
  const block = res.data?.content?.find((b) => b.type === "text");
  return block?.text || "";
}

/**
 * Run a JSON-mode chat completion with the configured keyword-research provider.
 */
export async function chatCompletionJson(messages, { temperature = 0.4, provider: preferred } = {}) {
  const providerId = resolveProviderId(preferred);
  const meta = AI_PROVIDERS[providerId];
  const apiKey = String(process.env[meta.envKey] || "").trim();
  const model = String(process.env[meta.modelEnv] || meta.defaultModel).trim();
  const siteUrl = String(process.env.OPENROUTER_SITE_URL || process.env.NEXTAUTH_URL || "").trim();
  const appName = String(process.env.OPENROUTER_APP_NAME || "Crossway SEO Tool").trim();

  let raw;
  try {
    if (providerId === "openrouter") {
      raw = await callOpenRouter({ apiKey, model, messages, temperature, siteUrl, appName });
    } else if (providerId === "openai") {
      raw = await callOpenAI({ apiKey, model, messages, temperature });
    } else {
      raw = await callAnthropic({ apiKey, model, messages, temperature });
    }
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

  const cleaned = stripJsonFences(raw);
  if (!cleaned) {
    const err = new Error(`${meta.label} returned an empty response.`);
    err.status = 502;
    throw err;
  }

  try {
    return { data: JSON.parse(cleaned), provider: providerId, model };
  } catch {
    const err = new Error(`${meta.label} returned invalid JSON. Try again or switch model.`);
    err.status = 502;
    throw err;
  }
}
