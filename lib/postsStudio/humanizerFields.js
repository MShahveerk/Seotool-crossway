/**
 * Post Studio Humanizer field merge (no Prisma). Config persistence lives in humanizerConfig.js.
 */
import {
  DEFAULT_POST_HUMANIZER_PROMPT,
  DEFAULT_POST_HUMANIZER_SKILL,
} from "./defaults.js";

export function defaultsFromSite(row = {}) {
  return {
    humanizerEnabled: false,
    humanizerProvider: row.agent2Provider || row.agent1Provider || "openai",
    humanizerModel: row.agent2Model || row.agent1Model || "gpt-5.4-mini",
    humanizerPrompt: DEFAULT_POST_HUMANIZER_PROMPT,
    humanizerSkill: DEFAULT_POST_HUMANIZER_SKILL,
  };
}

const BOOL_FIELDS = new Set(["humanizerEnabled"]);

export const HUMANIZER_FIELDS = [
  "humanizerEnabled",
  "humanizerProvider",
  "humanizerModel",
  "humanizerPrompt",
  "humanizerSkill",
];

export function mergeHumanizerConfig(row, stored = {}) {
  const base = defaultsFromSite(row);
  const out = { ...row };
  for (const field of HUMANIZER_FIELDS) {
    if (BOOL_FIELDS.has(field)) {
      out[field] = stored[field] !== undefined ? Boolean(stored[field]) : Boolean(base[field]);
    } else {
      out[field] = stored[field] || base[field];
    }
  }
  return out;
}

export function humanizerFieldsTouched(input = {}) {
  return HUMANIZER_FIELDS.some((f) => input[f] !== undefined);
}

export function applyHumanizerPatch(existing = {}, patch = {}) {
  const next = { ...existing };
  for (const field of HUMANIZER_FIELDS) {
    if (patch[field] === undefined) continue;
    if (BOOL_FIELDS.has(field)) next[field] = Boolean(patch[field]);
    else next[field] = patch[field];
  }
  return next;
}
