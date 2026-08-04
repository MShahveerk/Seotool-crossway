/**
 * SEO Autopilot per-site config (keys, prompts, schedule, SMTP).
 */
import prisma from "../prisma.js";
import { hasProviderKey } from "../blogStudio/providers.js";
import {
  AGENT_DEFS,
  AGENT_DEFAULT_PROMPTS,
  DEFAULT_ENABLED_AGENTS,
} from "./defaults.js";

export const SECRET_MASK = "••••••••";

function defaultSiteRow(siteLink) {
  const row = {
    siteLink,
    autoEnabled: false,
    autoIntervalMinutes: 10080,
    lastAutoAt: null,
    brandName: "",
    category: "",
    buyingQuestions: "",
    competitors: "",
    proofPoint: "",
    brandNotes: "",
    enabledAgents: DEFAULT_ENABLED_AGENTS,
    openaiApiKey: null,
    anthropicApiKey: null,
    openrouterApiKey: null,
    smtpHost: "",
    smtpPort: 587,
    smtpUser: "",
    smtpPass: null,
    smtpFrom: "",
    latestScorecardJson: null,
  };
  for (const agent of AGENT_DEFS) {
    row[agent.providerKey] = agent.defaultProvider;
    row[agent.modelKey] = agent.defaultModel;
    row[agent.promptKey] = AGENT_DEFAULT_PROMPTS[agent.id];
  }
  return row;
}

export async function getAutopilotConfig(siteLink) {
  const link = String(siteLink || "").trim();
  if (!link) {
    const err = new Error("siteLink is required.");
    err.status = 400;
    throw err;
  }
  const row = await prisma.seoAutopilotSiteConfig.findUnique({ where: { siteLink: link } });
  if (!row) return defaultSiteRow(link);
  return row;
}

export function sanitizeAutopilotConfigForClient(row) {
  if (!row) return null;
  const {
    openaiApiKey,
    anthropicApiKey,
    openrouterApiKey,
    smtpPass,
    ...rest
  } = row;
  const agentReady = {};
  for (const agent of AGENT_DEFS) {
    agentReady[agent.id] = hasProviderKey(row[agent.providerKey], row);
  }
  return {
    ...rest,
    openaiApiKey: openaiApiKey ? SECRET_MASK : "",
    anthropicApiKey: anthropicApiKey ? SECRET_MASK : "",
    openrouterApiKey: openrouterApiKey ? SECRET_MASK : "",
    smtpPass: smtpPass ? SECRET_MASK : "",
    keyStatus: {
      openai: Boolean(openaiApiKey) || Boolean(process.env.OPENAI_API_KEY),
      anthropic: Boolean(anthropicApiKey) || Boolean(process.env.ANTHROPIC_API_KEY),
      openrouter: Boolean(openrouterApiKey) || Boolean(process.env.OPENROUTER_API_KEY),
      smtp: Boolean(smtpPass || process.env.SMTP_PASS),
    },
    agentReady,
    defaultPrompts: AGENT_DEFAULT_PROMPTS,
    agents: AGENT_DEFS,
  };
}

function applySecret(input, existing, field) {
  if (input[field] === undefined) return existing[field] ?? null;
  const v = String(input[field] || "").trim();
  if (!v || v === SECRET_MASK) return existing[field] ?? null;
  return v;
}

export async function saveAutopilotConfig(siteLink, input = {}) {
  const link = String(siteLink || "").trim();
  if (!link) {
    const err = new Error("siteLink is required.");
    err.status = 400;
    throw err;
  }
  const existing =
    (await prisma.seoAutopilotSiteConfig.findUnique({ where: { siteLink: link } })) ||
    defaultSiteRow(link);

  const data = {
    siteLink: link,
    autoEnabled: input.autoEnabled !== undefined ? Boolean(input.autoEnabled) : existing.autoEnabled,
    autoIntervalMinutes:
      input.autoIntervalMinutes !== undefined
        ? Math.max(30, Math.round(Number(input.autoIntervalMinutes) || 10080))
        : existing.autoIntervalMinutes,
    brandName:
      input.brandName !== undefined ? String(input.brandName || "").slice(0, 256) : existing.brandName,
    category:
      input.category !== undefined ? String(input.category || "").slice(0, 512) : existing.category,
    buyingQuestions:
      input.buyingQuestions !== undefined
        ? String(input.buyingQuestions || "").slice(0, 8000)
        : existing.buyingQuestions,
    competitors:
      input.competitors !== undefined
        ? String(input.competitors || "").slice(0, 4000)
        : existing.competitors,
    proofPoint:
      input.proofPoint !== undefined
        ? String(input.proofPoint || "").slice(0, 4000)
        : existing.proofPoint,
    brandNotes:
      input.brandNotes !== undefined
        ? String(input.brandNotes || "").slice(0, 8000)
        : existing.brandNotes,
    enabledAgents:
      input.enabledAgents !== undefined
        ? String(input.enabledAgents || DEFAULT_ENABLED_AGENTS).slice(0, 500)
        : existing.enabledAgents || DEFAULT_ENABLED_AGENTS,
    openaiApiKey: applySecret(input, existing, "openaiApiKey"),
    anthropicApiKey: applySecret(input, existing, "anthropicApiKey"),
    openrouterApiKey: applySecret(input, existing, "openrouterApiKey"),
    smtpHost:
      input.smtpHost !== undefined ? String(input.smtpHost || "").slice(0, 256) : existing.smtpHost,
    smtpPort:
      input.smtpPort !== undefined
        ? Math.max(1, Math.round(Number(input.smtpPort) || 587))
        : existing.smtpPort ?? 587,
    smtpUser:
      input.smtpUser !== undefined ? String(input.smtpUser || "").slice(0, 256) : existing.smtpUser,
    smtpPass: applySecret(input, existing, "smtpPass"),
    smtpFrom:
      input.smtpFrom !== undefined ? String(input.smtpFrom || "").slice(0, 256) : existing.smtpFrom,
  };

  for (const agent of AGENT_DEFS) {
    data[agent.providerKey] =
      input[agent.providerKey] || existing[agent.providerKey] || agent.defaultProvider;
    data[agent.modelKey] =
      input[agent.modelKey] || existing[agent.modelKey] || agent.defaultModel;
    data[agent.promptKey] =
      input[agent.promptKey] !== undefined
        ? String(input[agent.promptKey] || "")
        : existing[agent.promptKey];
  }

  return prisma.seoAutopilotSiteConfig.upsert({
    where: { siteLink: link },
    create: data,
    update: data,
  });
}

export async function listDueAutopilotSites(now = new Date()) {
  const rows = await prisma.seoAutopilotSiteConfig.findMany({
    where: { autoEnabled: true },
  });
  return rows.filter((row) => {
    const intervalMs = Math.max(30, Number(row.autoIntervalMinutes) || 10080) * 60000;
    const last = row.lastAutoAt ? new Date(row.lastAutoAt).getTime() : 0;
    return !last || now.getTime() - last >= intervalMs;
  });
}

export function parseEnabledAgents(value) {
  const raw = String(value || DEFAULT_ENABLED_AGENTS);
  const allowed = new Set(AGENT_DEFS.map((a) => a.id));
  const list = raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((id) => allowed.has(id));
  return list.length ? list : AGENT_DEFS.map((a) => a.id);
}
