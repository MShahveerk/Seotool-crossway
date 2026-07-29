/**
 * Rough USD cost estimates from token usage + model id.
 * Labels are estimates, not invoices.
 */

const DEFAULT_PRICES = {
  // [inputPer1M, outputPer1M]
  "gpt-5.4-mini": [0.25, 2.0],
  "gpt-5.4": [2.5, 15],
  "gpt-4.1-mini": [0.4, 1.6],
  "gpt-4.1": [2.0, 8.0],
  "gpt-4o-mini": [0.15, 0.6],
  "gpt-4o": [2.5, 10],
  "claude-sonnet-4-6": [3.0, 15],
  "claude-sonnet-4-5": [3.0, 15],
  "claude-opus-4-6": [15, 75],
  "claude-haiku-4-5": [1.0, 5.0],
  "google/gemini-3.1-flash-lite": [0.1, 0.4],
  "anthropic/claude-sonnet-4-6": [3.0, 15],
  "openai/gpt-5.4-mini": [0.25, 2.0],
  "gpt-image-1": [0, 0], // handled separately as flat estimate
};

const IMAGE_FLAT_USD = {
  "gpt-image-1": 0.04,
  "dall-e-3": 0.04,
};

function matchPrice(model, overrides = {}) {
  const key = String(model || "").trim();
  if (overrides[key] && Array.isArray(overrides[key])) return overrides[key];
  if (DEFAULT_PRICES[key]) return DEFAULT_PRICES[key];
  const lower = key.toLowerCase();
  for (const [name, price] of Object.entries({ ...DEFAULT_PRICES, ...overrides })) {
    if (lower.includes(String(name).toLowerCase())) return price;
  }
  return [1.0, 5.0];
}

export function estimateChatCostUsd({ model, inputTokens = 0, outputTokens = 0, pricingOverrides = null } = {}) {
  const [inPerM, outPerM] = matchPrice(model, pricingOverrides || {});
  const cost = (Number(inputTokens) / 1e6) * inPerM + (Number(outputTokens) / 1e6) * outPerM;
  return Math.round(cost * 1e6) / 1e6;
}

export function estimateImageCostUsd({ model } = {}) {
  const key = String(model || "").trim();
  if (IMAGE_FLAT_USD[key] != null) return IMAGE_FLAT_USD[key];
  for (const [name, price] of Object.entries(IMAGE_FLAT_USD)) {
    if (key.toLowerCase().includes(name.toLowerCase())) return price;
  }
  return 0.04;
}

export function sumStageCosts(stages = []) {
  return Math.round(
    stages.reduce((acc, s) => acc + (Number(s?.costUsd) || 0), 0) * 1e6
  ) / 1e6;
}
