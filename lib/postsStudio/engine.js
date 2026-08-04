/**
 * Post Automation Studio engine config + exclusivity with external ingest mode.
 */
import prisma from "../prisma.js";
import {
  DEFAULT_AGENT1_PROMPT,
  DEFAULT_AGENT2_PROMPT,
  DEFAULT_INTERPRETER_PROMPT,
  DEFAULT_IMAGE_PROMPT_SYSTEM,
} from "./defaults.js";
import { hasProviderKey } from "../blogStudio/providers.js";
import {
  normalizeReferencePaths,
  resolveReferenceFieldsForSave,
} from "../studioReferenceImage.js";
import {
  brandKitForClient,
  mergeBrandKitForSave,
  DEFAULT_BRAND_KIT,
} from "../studioBrandKit.js";

export const SECRET_MASK = "••••••••";
export const ENGINE_EXTERNAL = "external";
export const ENGINE_INTERNAL = "internal";

const CONFIG_KEY = "posts_automation_config";

async function readSetting(key) {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } });
    if (!row?.value) return null;
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

async function writeSetting(key, value) {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(value) },
    update: { value: JSON.stringify(value) },
  });
}

export async function getEngineMode() {
  const stored = await readSetting(CONFIG_KEY);
  const mode = String(stored?.engineMode || ENGINE_EXTERNAL).toLowerCase();
  return mode === ENGINE_INTERNAL ? ENGINE_INTERNAL : ENGINE_EXTERNAL;
}

export async function getGlobalPostsAutomationConfig() {
  const stored = (await readSetting(CONFIG_KEY)) || {};
  return {
    engineMode: String(stored.engineMode || ENGINE_EXTERNAL).toLowerCase() === ENGINE_INTERNAL
      ? ENGINE_INTERNAL
      : ENGINE_EXTERNAL,
    notes: stored.notes || "",
  };
}

export async function setEngineMode(mode) {
  const next = String(mode || "").toLowerCase() === ENGINE_INTERNAL ? ENGINE_INTERNAL : ENGINE_EXTERNAL;
  const existing = (await readSetting(CONFIG_KEY)) || {};
  const updated = { ...existing, engineMode: next };
  await writeSetting(CONFIG_KEY, updated);
  if (next === ENGINE_EXTERNAL) {
    await prisma.postAutomationSiteConfig.updateMany({
      where: { autoEnabled: true },
      data: { autoEnabled: false },
    });
  }
  return next;
}

export async function saveGlobalPostsAutomationConfig(input = {}) {
  const existing = (await readSetting(CONFIG_KEY)) || {};
  let engineMode = existing.engineMode || ENGINE_EXTERNAL;
  if (input.engineMode !== undefined) {
    engineMode = await setEngineMode(input.engineMode);
  }
  const updated = {
    ...existing,
    engineMode,
    notes: input.notes !== undefined ? String(input.notes || "") : existing.notes || "",
  };
  await writeSetting(CONFIG_KEY, updated);
  return getGlobalPostsAutomationConfig();
}

function normalizePlatform(value, fallback = "both") {
  const p = String(value || "").toLowerCase().trim();
  if (p === "facebook" || p === "instagram" || p === "both") return p;
  return fallback;
}

function defaultSiteRow(siteLink) {
  return {
    siteLink,
    autoEnabled: false,
    autoIntervalMinutes: 720,
    lastAutoAt: null,
    autoSource: "seed",
    seedPrompt: "",
    hooksOrKeywords: "",
    tone: "",
    hashtagPolicy: "",
    defaultPlatform: "both",
    ctaText: "",
    ctaUrl: "",
    brandNotes: "",
    referenceImagePath: null,
    referenceImagePaths: [],
    imagePrompt: "",
    generateBackupImages: false,
    brandKitJson: { ...DEFAULT_BRAND_KIT },
    agent1Prompt: DEFAULT_AGENT1_PROMPT,
    agent2Prompt: DEFAULT_AGENT2_PROMPT,
    interpreterPrompt: DEFAULT_INTERPRETER_PROMPT,
    imagePromptSystem: DEFAULT_IMAGE_PROMPT_SYSTEM,
    agent1Provider: "openai",
    agent1Model: "gpt-5.4-mini",
    agent2Provider: "openai",
    agent2Model: "gpt-5.4-mini",
    interpreterProvider: "openai",
    interpreterModel: "gpt-5.4-mini",
    imageProvider: "openai",
    imageModel: "gpt-image-2",
    openaiApiKey: null,
    anthropicApiKey: null,
    openrouterApiKey: null,
    pricingOverrides: null,
  };
}

export async function getSiteStudioConfig(siteLink) {
  const link = String(siteLink || "").trim();
  if (!link) {
    const err = new Error("siteLink is required.");
    err.status = 400;
    throw err;
  }
  const row = await prisma.postAutomationSiteConfig.findUnique({ where: { siteLink: link } });
  if (!row) return defaultSiteRow(link);
  return row;
}

export function sanitizeSiteConfigForClient(row) {
  if (!row) return null;
  const { openaiApiKey, anthropicApiKey, openrouterApiKey, ...rest } = row;
  const referenceImagePaths = normalizeReferencePaths(row);
  return {
    ...rest,
    referenceImagePaths,
    referenceImagePath: referenceImagePaths[0] || null,
    brandKitJson: brandKitForClient(row.brandKitJson),
    openaiApiKey: openaiApiKey ? SECRET_MASK : "",
    anthropicApiKey: anthropicApiKey ? SECRET_MASK : "",
    openrouterApiKey: openrouterApiKey ? SECRET_MASK : "",
    keyStatus: {
      openai: Boolean(openaiApiKey) || Boolean(process.env.OPENAI_API_KEY),
      anthropic: Boolean(anthropicApiKey) || Boolean(process.env.ANTHROPIC_API_KEY),
      openrouter: Boolean(openrouterApiKey) || Boolean(process.env.OPENROUTER_API_KEY),
    },
    agentReady: {
      interpreter: hasProviderKey(row.interpreterProvider, row),
      agent1: hasProviderKey(row.agent1Provider, row),
      agent2: hasProviderKey(row.agent2Provider, row),
      image: hasProviderKey(row.imageProvider || "openai", row),
    },
  };
}

function applySecret(input, existing, field) {
  if (input[field] === undefined) return existing[field] ?? null;
  const v = String(input[field] || "").trim();
  if (!v || v === SECRET_MASK) return existing[field] ?? null;
  return v;
}

export async function saveSiteStudioConfig(siteLink, input = {}) {
  const link = String(siteLink || "").trim();
  if (!link) {
    const err = new Error("siteLink is required.");
    err.status = 400;
    throw err;
  }
  const existing =
    (await prisma.postAutomationSiteConfig.findUnique({ where: { siteLink: link } })) ||
    defaultSiteRow(link);

  const data = {
    siteLink: link,
    autoEnabled: input.autoEnabled !== undefined ? Boolean(input.autoEnabled) : existing.autoEnabled,
    autoIntervalMinutes:
      input.autoIntervalMinutes !== undefined
        ? Math.max(5, Math.round(Number(input.autoIntervalMinutes) || 720))
        : existing.autoIntervalMinutes,
    autoSource:
      input.autoSource !== undefined
        ? String(input.autoSource || "").toLowerCase() === "excel"
          ? "excel"
          : "seed"
        : existing.autoSource || "seed",
    seedPrompt: input.seedPrompt !== undefined ? String(input.seedPrompt || "").slice(0, 12000) : existing.seedPrompt,
    hooksOrKeywords:
      input.hooksOrKeywords !== undefined
        ? String(input.hooksOrKeywords || "").slice(0, 8000)
        : existing.hooksOrKeywords,
    tone: input.tone !== undefined ? String(input.tone || "").slice(0, 4000) : existing.tone,
    hashtagPolicy:
      input.hashtagPolicy !== undefined
        ? String(input.hashtagPolicy || "").slice(0, 4000)
        : existing.hashtagPolicy,
    defaultPlatform:
      input.defaultPlatform !== undefined
        ? normalizePlatform(input.defaultPlatform, existing.defaultPlatform || "both")
        : existing.defaultPlatform || "both",
    ctaText: input.ctaText !== undefined ? String(input.ctaText || "").slice(0, 512) : existing.ctaText,
    ctaUrl: input.ctaUrl !== undefined ? String(input.ctaUrl || "").slice(0, 2048) : existing.ctaUrl,
    brandNotes: input.brandNotes !== undefined ? String(input.brandNotes || "").slice(0, 8000) : existing.brandNotes,
    ...resolveReferenceFieldsForSave(input, existing),
    imagePrompt: input.imagePrompt !== undefined ? String(input.imagePrompt || "").slice(0, 4000) : existing.imagePrompt,
    generateBackupImages:
      input.generateBackupImages !== undefined
        ? Boolean(input.generateBackupImages)
        : Boolean(existing.generateBackupImages),
    brandKitJson:
      input.brandKitJson !== undefined
        ? mergeBrandKitForSave(input.brandKitJson, existing.brandKitJson)
        : existing.brandKitJson ?? { ...DEFAULT_BRAND_KIT },
    agent1Prompt: input.agent1Prompt !== undefined ? String(input.agent1Prompt || "") : existing.agent1Prompt,
    agent2Prompt: input.agent2Prompt !== undefined ? String(input.agent2Prompt || "") : existing.agent2Prompt,
    interpreterPrompt:
      input.interpreterPrompt !== undefined ? String(input.interpreterPrompt || "") : existing.interpreterPrompt,
    imagePromptSystem:
      input.imagePromptSystem !== undefined ? String(input.imagePromptSystem || "") : existing.imagePromptSystem,
    agent1Provider: input.agent1Provider || existing.agent1Provider || "openai",
    agent1Model: input.agent1Model || existing.agent1Model || "gpt-5.4-mini",
    agent2Provider: input.agent2Provider || existing.agent2Provider || "openai",
    agent2Model: input.agent2Model || existing.agent2Model || "gpt-5.4-mini",
    interpreterProvider: input.interpreterProvider || existing.interpreterProvider || "openai",
    interpreterModel: input.interpreterModel || existing.interpreterModel || "gpt-5.4-mini",
    imageProvider: input.imageProvider || existing.imageProvider || "openai",
    imageModel: input.imageModel || existing.imageModel || "gpt-image-2",
    openaiApiKey: applySecret(input, existing, "openaiApiKey"),
    anthropicApiKey: applySecret(input, existing, "anthropicApiKey"),
    openrouterApiKey: applySecret(input, existing, "openrouterApiKey"),
    pricingOverrides:
      input.pricingOverrides !== undefined ? input.pricingOverrides : existing.pricingOverrides,
  };

  return prisma.postAutomationSiteConfig.upsert({
    where: { siteLink: link },
    create: data,
    update: data,
  });
}

export async function listDueAutoSites(now = new Date()) {
  const rows = await prisma.postAutomationSiteConfig.findMany({
    where: { autoEnabled: true },
  });
  return rows.filter((row) => {
    const intervalMs = Math.max(5, Number(row.autoIntervalMinutes) || 720) * 60000;
    const last = row.lastAutoAt ? new Date(row.lastAutoAt).getTime() : 0;
    return !last || now.getTime() - last >= intervalMs;
  });
}
