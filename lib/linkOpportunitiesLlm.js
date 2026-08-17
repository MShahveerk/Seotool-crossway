/**
 * Link Opportunities LLM probe settings.
 *
 * Same pattern as Blog Studio / SEO Autopilot: per-provider keys stored in
 * AppSetting, masked on the way out, env vars as fallback. Module-level (not
 * per client) because prospect discovery is keyword-based.
 */

import prisma from "./prisma.js";
import { hasProviderKey } from "./blogStudio/providers.js";

export const SECRET_MASK = "••••••••";
const CONFIG_KEY = "link_opportunities_llm";
const PROVIDERS = new Set(["openai", "anthropic", "openrouter"]);

export const DEFAULT_LLM_CONFIG = {
  enabled: true,
  provider: "openrouter",
  model: "openai/gpt-5.4-mini",
  openaiApiKey: null,
  anthropicApiKey: null,
  openrouterApiKey: null,
};

async function readSetting() {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: CONFIG_KEY } });
    if (!row?.value) return null;
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

async function writeSetting(value) {
  await prisma.appSetting.upsert({
    where: { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: JSON.stringify(value) },
    update: { value: JSON.stringify(value) },
  });
}

export async function getLinkOpportunitiesLlmConfig() {
  const stored = (await readSetting()) || {};
  return { ...DEFAULT_LLM_CONFIG, ...stored };
}

export function sanitizeLinkOpportunitiesLlmForClient(row) {
  if (!row) return null;
  const { openaiApiKey, anthropicApiKey, openrouterApiKey, ...rest } = row;
  const provider = String(rest.provider || DEFAULT_LLM_CONFIG.provider).toLowerCase();
  return {
    ...rest,
    provider,
    model: String(rest.model || DEFAULT_LLM_CONFIG.model),
    enabled: rest.enabled !== false,
    openaiApiKey: openaiApiKey ? SECRET_MASK : "",
    anthropicApiKey: anthropicApiKey ? SECRET_MASK : "",
    openrouterApiKey: openrouterApiKey ? SECRET_MASK : "",
    keyStatus: {
      openai: Boolean(openaiApiKey) || Boolean(process.env.OPENAI_API_KEY),
      anthropic: Boolean(anthropicApiKey) || Boolean(process.env.ANTHROPIC_API_KEY),
      openrouter: Boolean(openrouterApiKey) || Boolean(process.env.OPENROUTER_API_KEY),
    },
    ready: hasProviderKey(provider, row),
  };
}

function applySecret(input, existing, field) {
  if (input[field] === undefined) return existing[field] ?? null;
  const v = String(input[field] || "").trim();
  if (!v || v === SECRET_MASK) return existing[field] ?? null;
  return v;
}

export async function saveLinkOpportunitiesLlmConfig(input = {}) {
  const existing = await getLinkOpportunitiesLlmConfig();
  const providerRaw = String(input.provider ?? existing.provider ?? "openrouter").toLowerCase();
  const provider = PROVIDERS.has(providerRaw) ? providerRaw : "openrouter";
  const next = {
    enabled: input.enabled !== undefined ? Boolean(input.enabled) : existing.enabled !== false,
    provider,
    model: String(input.model ?? existing.model ?? DEFAULT_LLM_CONFIG.model).trim().slice(0, 120),
    openaiApiKey: applySecret(input, existing, "openaiApiKey"),
    anthropicApiKey: applySecret(input, existing, "anthropicApiKey"),
    openrouterApiKey: applySecret(input, existing, "openrouterApiKey"),
  };
  if (!next.model) next.model = DEFAULT_LLM_CONFIG.model;
  await writeSetting(next);
  return next;
}
