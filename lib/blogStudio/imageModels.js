export function defaultImageModelForProvider(provider) {
  const p = String(provider || "openai").toLowerCase();
  if (p === "openrouter") return "openai/gpt-image-2";
  if (p === "anthropic") return "claude-sonnet-4-6";
  return "gpt-image-2";
}

/** Mini/haiku models are weak on reference fidelity. Keep Anthropic on Claude, not GPT Image. */
export function imageModelForReferences(provider, model) {
  const p = String(provider || "openai").toLowerCase();
  const current = String(model || "").trim() || defaultImageModelForProvider(p);
  if (!/mini|haiku/i.test(current)) return current;
  if (p === "anthropic") return "claude-sonnet-4-6";
  return defaultImageModelForProvider(p);
}

export function normalizeAnthropicImageModel(model) {
  const m = String(model || "claude-sonnet-4-6").trim();
  const stripped = m.toLowerCase().startsWith("anthropic/") ? m.slice("anthropic/".length) : m;
  if (/claude/i.test(stripped)) return stripped || "claude-sonnet-4-6";
  return "claude-sonnet-4-6";
}

export function extractSvgMarkup(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const fenced = raw.match(/```(?:svg)?\s*([\s\S]*?)```/i);
  const blob = (fenced ? fenced[1] : raw).trim();
  const start = blob.search(/<svg\b/i);
  if (start < 0) return "";
  const close = blob.toLowerCase().lastIndexOf("</svg>");
  if (close < 0) return "";
  return blob.slice(start, close + "</svg>".length).trim();
}
