/**
 * Draft-prefix agent config in AppSetting (no Prisma column migration).
 */
import prisma from "../prisma.js";
import {
  DEFAULT_BINDER_PROMPT,
  DEFAULT_CHECKER_PROMPT,
  DEFAULT_DECIDER_PROMPT,
  DEFAULT_HEADINGS_PROMPT,
  DEFAULT_HUMANIZER_PROMPT,
  DEFAULT_HUMANIZER_SKILL,
} from "./prefixDefaults.js";

function settingKey(siteLink) {
  return `blog_studio_prefix:${String(siteLink || "").trim()}`;
}

function defaultsFromSite(row = {}) {
  return {
    deciderProvider: row.agent1Provider || "openai",
    deciderModel: row.agent1Model || "gpt-5.4-mini",
    deciderPrompt: DEFAULT_DECIDER_PROMPT,
    binderProvider: row.agent1Provider || "openai",
    binderModel: row.agent1Model || "gpt-5.4-mini",
    binderPrompt: DEFAULT_BINDER_PROMPT,
    checkerProvider: row.agent1Provider || "openai",
    checkerModel: row.agent1Model || "gpt-5.4-mini",
    checkerPrompt: DEFAULT_CHECKER_PROMPT,
    headingsProvider: row.agent2Provider || row.agent1Provider || "openai",
    headingsModel: row.agent2Model || row.agent1Model || "gpt-5.4-mini",
    headingsPrompt: DEFAULT_HEADINGS_PROMPT,
    headingsApprovalEnabled: false,
    humanizerEnabled: false,
    humanizerProvider: row.agent3Provider || row.agent1Provider || "openai",
    humanizerModel: row.agent3Model || row.agent1Model || "gpt-5.4-mini",
    humanizerPrompt: DEFAULT_HUMANIZER_PROMPT,
    humanizerSkill: DEFAULT_HUMANIZER_SKILL,
  };
}

const BOOL_FIELDS = new Set(["headingsApprovalEnabled", "humanizerEnabled"]);

const FIELDS = [
  "deciderProvider",
  "deciderModel",
  "deciderPrompt",
  "binderProvider",
  "binderModel",
  "binderPrompt",
  "checkerProvider",
  "checkerModel",
  "checkerPrompt",
  "headingsProvider",
  "headingsModel",
  "headingsPrompt",
  "headingsApprovalEnabled",
  "humanizerEnabled",
  "humanizerProvider",
  "humanizerModel",
  "humanizerPrompt",
  "humanizerSkill",
];

export async function readPrefixAgents(siteLink) {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: settingKey(siteLink) } });
    if (!row?.value) return {};
    const parsed = JSON.parse(row.value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function writePrefixAgents(siteLink, patch = {}) {
  const existing = await readPrefixAgents(siteLink);
  const next = { ...existing };
  for (const field of FIELDS) {
    if (patch[field] === undefined) continue;
    next[field] = BOOL_FIELDS.has(field) ? Boolean(patch[field]) : patch[field];
  }
  await prisma.appSetting.upsert({
    where: { key: settingKey(siteLink) },
    create: { key: settingKey(siteLink), value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  return next;
}

export function mergePrefixAgents(row, stored = {}) {
  const base = defaultsFromSite(row);
  const out = { ...row };
  for (const field of FIELDS) {
    if (BOOL_FIELDS.has(field)) {
      out[field] = stored[field] !== undefined ? Boolean(stored[field]) : Boolean(base[field]);
    } else {
      out[field] = stored[field] || base[field];
    }
  }
  return out;
}

export function prefixFieldsTouched(input = {}) {
  return FIELDS.some((f) => input[f] !== undefined);
}
