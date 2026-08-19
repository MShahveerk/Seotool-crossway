/**
 * Researcher / Scout agent config lives in AppSetting so we do not need a
 * Prisma column migration. Merged onto the site studio row for the UI.
 */
import prisma from "../prisma.js";
import {
  DEFAULT_RESEARCHER_PROMPT,
  DEFAULT_SCOUT_PROMPT,
} from "./researchDefaults.js";

function settingKey(siteLink) {
  return `blog_studio_research:${String(siteLink || "").trim()}`;
}

function defaultsFromSite(row = {}) {
  return {
    researcherProvider: row.agent1Provider || "openai",
    researcherModel: row.agent1Model || "gpt-5.4-mini",
    researcherPrompt: DEFAULT_RESEARCHER_PROMPT,
    scoutProvider: row.agent1Provider || "openai",
    scoutModel: row.agent1Model || "gpt-5.4-mini",
    scoutPrompt: DEFAULT_SCOUT_PROMPT,
  };
}

export async function readResearchAgents(siteLink) {
  const key = settingKey(siteLink);
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } });
    if (!row?.value) return {};
    const parsed = JSON.parse(row.value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function writeResearchAgents(siteLink, patch = {}) {
  const existing = await readResearchAgents(siteLink);
  const next = { ...existing };
  for (const field of [
    "researcherProvider",
    "researcherModel",
    "researcherPrompt",
    "scoutProvider",
    "scoutModel",
    "scoutPrompt",
  ]) {
    if (patch[field] !== undefined) next[field] = patch[field];
  }
  await prisma.appSetting.upsert({
    where: { key: settingKey(siteLink) },
    create: { key: settingKey(siteLink), value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  return next;
}

export function mergeResearchAgents(row, stored = {}) {
  const base = defaultsFromSite(row);
  return {
    ...row,
    researcherProvider: stored.researcherProvider || base.researcherProvider,
    researcherModel: stored.researcherModel || base.researcherModel,
    researcherPrompt: stored.researcherPrompt || base.researcherPrompt,
    scoutProvider: stored.scoutProvider || base.scoutProvider,
    scoutModel: stored.scoutModel || base.scoutModel,
    scoutPrompt: stored.scoutPrompt || base.scoutPrompt,
  };
}

export function researchAgentReady(row) {
  return {
    researcher: Boolean(row?.agentReady?.researcher),
    scout: Boolean(row?.agentReady?.scout),
  };
}
