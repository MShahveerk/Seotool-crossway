export const INTERVAL_OPTIONS = [
  { value: 30, label: "Every 30 minutes" },
  { value: 60, label: "Every hour" },
  { value: 180, label: "Every 3 hours" },
  { value: 360, label: "Every 6 hours" },
  { value: 720, label: "Every 12 hours (recommended)" },
  { value: 1440, label: "Every day" },
  { value: 2880, label: "Every 2 days" },
  { value: 4320, label: "Every 3 days" },
  { value: 10080, label: "Every week" },
];

export const AUTO_SOURCE_OPTIONS = [
  {
    value: "seed",
    label: "Seed prompt",
    hint: "Uses general prompt + rotating hooks/keywords each run.",
  },
  {
    value: "excel",
    label: "Excel queue",
    hint: "Processes one spreadsheet row per interval (max 50 rows).",
  },
];

export const PLATFORM_OPTIONS = [
  { value: "both", label: "Facebook + Instagram" },
  { value: "facebook", label: "Facebook only" },
  { value: "instagram", label: "Instagram only" },
];

export const PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openrouter", label: "OpenRouter" },
];

/** Image agent: OpenAI, Anthropic (Claude SVG rasterized), or OpenRouter. */
export const IMAGE_PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openrouter", label: "OpenRouter" },
];

/** Viable chat models per provider (API ids verified for Studio pipeline). */
export const CHAT_MODELS = {
  openai: [
    { value: "gpt-5.4-mini", label: "GPT-5.4 Mini — fast (recommended)" },
    { value: "gpt-5.4", label: "GPT-5.4 — strongest" },
    { value: "gpt-5.2", label: "GPT-5.2" },
    { value: "gpt-4.1", label: "GPT-4.1" },
    { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  ],
  anthropic: [
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (recommended)" },
    { value: "claude-opus-4-6", label: "Claude Opus 4.6 — strongest" },
    { value: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    { value: "claude-opus-4-5", label: "Claude Opus 4.5" },
    { value: "claude-haiku-4-5", label: "Claude Haiku 4.5 — fastest" },
  ],
  openrouter: [
    { value: "openai/gpt-5.4-mini", label: "OpenAI GPT-5.4 Mini" },
    { value: "openai/gpt-5.4", label: "OpenAI GPT-5.4" },
    { value: "anthropic/claude-sonnet-4-6", label: "Anthropic Claude Sonnet 4.6" },
    { value: "anthropic/claude-opus-4-6", label: "Anthropic Claude Opus 4.6" },
    { value: "google/gemini-2.5-pro", label: "Google Gemini 2.5 Pro" },
    { value: "google/gemini-2.5-flash", label: "Google Gemini 2.5 Flash" },
  ],
};

export const IMAGE_MODELS = {
  openai: [
    { value: "gpt-image-2", label: "GPT Image 2 — best quality (recommended)" },
    { value: "gpt-image-1.5", label: "GPT Image 1.5 — strong / cheaper" },
    { value: "gpt-image-1", label: "GPT Image 1 — legacy stable" },
    { value: "gpt-image-1-mini", label: "GPT Image 1 Mini — budget / volume" },
    { value: "chatgpt-image-latest", label: "ChatGPT Image Latest (moving)" },
  ],
  anthropic: [
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 illustration (recommended)" },
    { value: "claude-opus-4-6", label: "Claude Opus 4.6 illustration — strongest" },
    { value: "claude-sonnet-4-5", label: "Claude Sonnet 4.5 illustration" },
    { value: "claude-haiku-4-5", label: "Claude Haiku 4.5 illustration — fastest" },
  ],
  openrouter: [
    { value: "openai/gpt-image-2", label: "OpenAI GPT Image 2 (recommended)" },
    { value: "openai/gpt-image-1", label: "OpenAI GPT Image 1" },
    { value: "openai/gpt-image-1-mini", label: "OpenAI GPT Image 1 Mini" },
    { value: "google/gemini-3.1-flash-image", label: "Google Gemini 3.1 Flash Image" },
    { value: "google/gemini-3-pro-image", label: "Google Gemini 3 Pro Image" },
    { value: "google/gemini-2.5-flash-image", label: "Google Gemini 2.5 Flash Image" },
    { value: "black-forest-labs/flux.2-pro", label: "FLUX.2 Pro" },
    { value: "black-forest-labs/flux.2-flex", label: "FLUX.2 Flex" },
    { value: "black-forest-labs/flux.2-max", label: "FLUX.2 Max" },
    { value: "bytedance-seed/seedream-4.5", label: "Seedream 4.5" },
    { value: "x-ai/grok-imagine-image-quality", label: "xAI Grok Imagine" },
    { value: "recraft/recraft-v4", label: "Recraft V4" },
  ],
};

export function modelsForProvider(provider, { kind = "chat", current = "" } = {}) {
  const p = String(provider || "openai").toLowerCase();
  const base =
    kind === "image"
      ? IMAGE_MODELS[p] || IMAGE_MODELS.openai
      : CHAT_MODELS[p] || CHAT_MODELS.openai;
  const cur = String(current || "").trim();
  if (cur && !base.some((m) => m.value === cur)) {
    return [{ value: cur, label: `${cur} (currently saved)` }, ...base];
  }
  return base;
}

export function defaultModelForProvider(provider, kind = "chat") {
  const list = modelsForProvider(provider, { kind });
  return list[0]?.value || "";
}

export const AGENT_ROLES = [
  {
    id: "agent1",
    title: "Strategist",
    subtitle: "Hook · angle · hashtags",
    providerKey: "agent1Provider",
    modelKey: "agent1Model",
    readyKey: "agent1",
  },
  {
    id: "agent2",
    title: "Copywriter",
    subtitle: "Title + caption",
    providerKey: "agent2Provider",
    modelKey: "agent2Model",
    readyKey: "agent2",
  },
  {
    id: "image",
    title: "Image",
    subtitle: "Feed creative (required)",
    providerKey: "imageProvider",
    modelKey: "imageModel",
    readyKey: "image",
  },
];

export const inputClass =
  "w-full rounded-xl border border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-3 py-2 text-sm text-[var(--cw-ink)] transition-smooth placeholder:text-[var(--cw-ink-faint)] focus:border-[var(--cw-neon)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cw-neon)_28%,transparent)]";

export const labelClass =
  "text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--cw-ink-faint)]";

export function formatMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `$${Number(n).toFixed(4)}`;
}

export function formatWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function statusTone(status) {
  switch (String(status || "")) {
    case "succeeded":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "failed":
      return "bg-red-50 text-red-700 border-red-200";
    case "running":
    case "queued":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "cancelled":
      return "bg-gray-100 text-gray-600 border-gray-200";
    default:
      return "bg-gray-50 text-gray-600 border-gray-200";
  }
}
