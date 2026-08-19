/**
 * Blog Automation Studio engine config + exclusivity with external n8n mode.
 */
import prisma from "../prisma.js";
import {
  DEFAULT_AGENT1_PROMPT,
  DEFAULT_AGENT2_PROMPT,
  DEFAULT_AGENT3_PROMPT,
  DEFAULT_INTERPRETER_PROMPT,
  DEFAULT_IMAGE_PROMPT_SYSTEM,
  DEFAULT_WORD_COUNT_RANGE,
} from "./defaults.js";
import { mergeResearchAgents, readResearchAgents, writeResearchAgents } from "./researchConfig.js";
import { mergePrefixAgents, prefixFieldsTouched, readPrefixAgents, writePrefixAgents } from "./prefixConfig.js";
import { hasProviderKey } from "./providers.js";
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

const CONFIG_KEY = "blog_automation_config";

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

export async function setEngineMode(mode) {
  const next = String(mode || "").toLowerCase() === ENGINE_INTERNAL ? ENGINE_INTERNAL : ENGINE_EXTERNAL;
  const existing = (await readSetting(CONFIG_KEY)) || {};
  const updated = { ...existing, engineMode: next };
  // Mutual exclusivity: turning on internal pauses external schedule
  if (next === ENGINE_INTERNAL) {
    updated.scheduleEnabled = false;
  }
  await writeSetting(CONFIG_KEY, updated);
  // Turning on external pauses all per-site internal auto schedules
  if (next === ENGINE_EXTERNAL) {
    await prisma.blogAutomationSiteConfig.updateMany({
      where: { autoEnabled: true },
      data: { autoEnabled: false },
    });
  }
  return next;
}

export function assertEngine(modeRequired) {
  return async function guard() {
    const mode = await getEngineMode();
    if (mode !== modeRequired) {
      const err = new Error(
        modeRequired === ENGINE_INTERNAL
          ? "Internal Studio is disabled. Switch Engine to Internal Studio first."
          : "External n8n automation is disabled. Switch Engine to External first."
      );
      err.status = 409;
      throw err;
    }
    return mode;
  };
}

function defaultSiteRow(siteLink) {
  return {
    siteLink,
    autoEnabled: false,
    autoIntervalMinutes: 1440,
    lastAutoAt: null,
    autoSource: "seed",
    seedPrompt: "",
    mustFollowKeywords: "",
    internalLinksJson: [],
    externalLinksJson: [],
    secondaryKeywords: "",
    targetAudience: "",
    location: "",
    ctaText: "",
    ctaUrl: "",
    wordCountRange: DEFAULT_WORD_COUNT_RANGE,
    contentType: "Blog post",
    brandNotes: "",
    serpNotes: "",
    referenceImagePath: null,
    referenceImagePaths: [],
    imagePrompt: "",
    generateBackupImages: false,
    brandKitJson: { ...DEFAULT_BRAND_KIT },
    agent1Prompt: DEFAULT_AGENT1_PROMPT,
    agent2Prompt: DEFAULT_AGENT2_PROMPT,
    agent3Prompt: DEFAULT_AGENT3_PROMPT,
    interpreterPrompt: DEFAULT_INTERPRETER_PROMPT,
    imagePromptSystem: DEFAULT_IMAGE_PROMPT_SYSTEM,
    agent1Provider: "openai",
    agent1Model: "gpt-5.4-mini",
    agent2Provider: "openai",
    agent2Model: "gpt-5.4-mini",
    agent3Provider: "anthropic",
    agent3Model: "claude-sonnet-4-6",
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
  const row = await prisma.blogAutomationSiteConfig.findUnique({ where: { siteLink: link } });
  const base = row || defaultSiteRow(link);
  const stored = await readResearchAgents(link);
  const prefix = await readPrefixAgents(link);
  return mergePrefixAgents(mergeResearchAgents(base, stored), prefix);
}

export function sanitizeSiteConfigForClient(row) {
  if (!row) return null;
  const {
    openaiApiKey,
    anthropicApiKey,
    openrouterApiKey,
    ...rest
  } = row;
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
      agent3: hasProviderKey(row.agent3Provider, row),
      image: hasProviderKey(row.imageProvider || "openai", row),
      researcher: hasProviderKey(row.researcherProvider || row.agent1Provider, row),
      scout: hasProviderKey(row.scoutProvider || row.agent1Provider, row),
      decider: hasProviderKey(row.deciderProvider || row.agent1Provider, row),
      binder: hasProviderKey(row.binderProvider || row.agent1Provider, row),
      checker: hasProviderKey(row.checkerProvider || row.agent1Provider, row),
      headings: hasProviderKey(row.headingsProvider || row.agent2Provider || row.agent1Provider, row),
    },
  };
}

function applySecret(input, existing, field) {
  if (input[field] === undefined) return existing[field] ?? null;
  const v = String(input[field] || "").trim();
  if (!v || v === SECRET_MASK) return existing[field] ?? null;
  return v;
}

function asJsonArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export async function saveSiteStudioConfig(siteLink, input = {}) {
  const link = String(siteLink || "").trim();
  if (!link) {
    const err = new Error("siteLink is required.");
    err.status = 400;
    throw err;
  }
  const existing = (await prisma.blogAutomationSiteConfig.findUnique({ where: { siteLink: link } })) ||
    defaultSiteRow(link);

  const data = {
    siteLink: link,
    autoEnabled: input.autoEnabled !== undefined ? Boolean(input.autoEnabled) : existing.autoEnabled,
    autoIntervalMinutes:
      input.autoIntervalMinutes !== undefined
        ? Math.max(5, Math.round(Number(input.autoIntervalMinutes) || 1440))
        : existing.autoIntervalMinutes,
    autoSource:
      input.autoSource !== undefined
        ? String(input.autoSource || "").toLowerCase() === "excel"
          ? "excel"
          : "seed"
        : existing.autoSource || "seed",
    seedPrompt: input.seedPrompt !== undefined ? String(input.seedPrompt || "").slice(0, 12000) : existing.seedPrompt,
    mustFollowKeywords:
      input.mustFollowKeywords !== undefined
        ? String(input.mustFollowKeywords || "").slice(0, 8000)
        : existing.mustFollowKeywords,
    internalLinksJson:
      input.internalLinksJson !== undefined
        ? asJsonArray(input.internalLinksJson)
        : existing.internalLinksJson || [],
    externalLinksJson:
      input.externalLinksJson !== undefined
        ? asJsonArray(input.externalLinksJson)
        : existing.externalLinksJson || [],
    secondaryKeywords:
      input.secondaryKeywords !== undefined
        ? String(input.secondaryKeywords || "").slice(0, 4000)
        : existing.secondaryKeywords,
    targetAudience:
      input.targetAudience !== undefined
        ? String(input.targetAudience || "").slice(0, 4000)
        : existing.targetAudience,
    location: input.location !== undefined ? String(input.location || "").slice(0, 512) : existing.location,
    ctaText: input.ctaText !== undefined ? String(input.ctaText || "").slice(0, 512) : existing.ctaText,
    ctaUrl: input.ctaUrl !== undefined ? String(input.ctaUrl || "").slice(0, 2048) : existing.ctaUrl,
    wordCountRange:
      input.wordCountRange !== undefined
        ? String(input.wordCountRange || DEFAULT_WORD_COUNT_RANGE).slice(0, 64)
        : existing.wordCountRange,
    contentType:
      input.contentType !== undefined ? String(input.contentType || "").slice(0, 128) : existing.contentType,
    brandNotes: input.brandNotes !== undefined ? String(input.brandNotes || "").slice(0, 8000) : existing.brandNotes,
    serpNotes: input.serpNotes !== undefined ? String(input.serpNotes || "").slice(0, 12000) : existing.serpNotes,
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
    agent3Prompt: input.agent3Prompt !== undefined ? String(input.agent3Prompt || "") : existing.agent3Prompt,
    interpreterPrompt:
      input.interpreterPrompt !== undefined ? String(input.interpreterPrompt || "") : existing.interpreterPrompt,
    imagePromptSystem:
      input.imagePromptSystem !== undefined ? String(input.imagePromptSystem || "") : existing.imagePromptSystem,
    agent1Provider: input.agent1Provider || existing.agent1Provider || "openai",
    agent1Model: input.agent1Model || existing.agent1Model || "gpt-5.4-mini",
    agent2Provider: input.agent2Provider || existing.agent2Provider || "openai",
    agent2Model: input.agent2Model || existing.agent2Model || "gpt-5.4-mini",
    agent3Provider: input.agent3Provider || existing.agent3Provider || "anthropic",
    agent3Model: input.agent3Model || existing.agent3Model || "claude-sonnet-4-6",
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

  const saved = await prisma.blogAutomationSiteConfig.upsert({
    where: { siteLink: link },
    create: data,
    update: data,
  });

  if (
    input.researcherProvider !== undefined ||
    input.researcherModel !== undefined ||
    input.researcherPrompt !== undefined ||
    input.scoutProvider !== undefined ||
    input.scoutModel !== undefined ||
    input.scoutPrompt !== undefined
  ) {
    await writeResearchAgents(link, {
      researcherProvider: input.researcherProvider,
      researcherModel: input.researcherModel,
      researcherPrompt: input.researcherPrompt,
      scoutProvider: input.scoutProvider,
      scoutModel: input.scoutModel,
      scoutPrompt: input.scoutPrompt,
    });
  }

  if (prefixFieldsTouched(input)) {
    await writePrefixAgents(link, input);
  }

  const stored = await readResearchAgents(link);
  const prefix = await readPrefixAgents(link);
  return mergePrefixAgents(mergeResearchAgents(saved, stored), prefix);
}

export async function listDueAutoSites(now = new Date()) {
  const rows = await prisma.blogAutomationSiteConfig.findMany({
    where: { autoEnabled: true },
  });
  return rows.filter((row) => {
    const intervalMs = Math.max(5, Number(row.autoIntervalMinutes) || 1440) * 60000;
    const last = row.lastAutoAt ? new Date(row.lastAutoAt).getTime() : 0;
    return !last || now.getTime() - last >= intervalMs;
  });
}
