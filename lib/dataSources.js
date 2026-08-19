/**
 * Global data-source credentials (Admin → Data sources).
 * SerpAPI key is stored in AppSetting with env fallback — same mask pattern
 * as Link Opportunities LLM keys. SE Ranking remains env-only this phase.
 */
import prisma from "./prisma.js";
import { isSerankingConfigured } from "./seranking/config.js";

export const SECRET_MASK = "••••••••";
const CONFIG_KEY = "data_sources";

export const DECIDER_FALLBACKS = ["harvest", "gsc"];

export const DEFAULT_DATA_SOURCES = {
  serpApiKey: null,
  checkGoogleDuplicates: true,
  /** When SerpAPI is missing: harvest-only library, or GSC ∩ harvest (silent harvest if GSC is down). */
  deciderFallback: "harvest",
};

function sanitizeDeciderFallback(value) {
  const v = String(value || "").trim().toLowerCase();
  return DECIDER_FALLBACKS.includes(v) ? v : "harvest";
}

async function readSetting() {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: CONFIG_KEY } });
    if (!row?.value) return null;
    const parsed = JSON.parse(row.value);
    return parsed && typeof parsed === "object" ? parsed : null;
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

function envSerpApiKey() {
  return process.env.SERPAPI_API_KEY?.trim() || process.env.SERPAPI_KEY?.trim() || "";
}

export async function getDataSourcesConfig() {
  const stored = (await readSetting()) || {};
  return {
    ...DEFAULT_DATA_SOURCES,
    ...stored,
    checkGoogleDuplicates: stored.checkGoogleDuplicates !== false,
    deciderFallback: sanitizeDeciderFallback(stored.deciderFallback),
  };
}

function applySecret(input, existing, field) {
  if (input[field] === undefined) return existing[field] ?? null;
  const v = String(input[field] || "").trim();
  if (!v || v === SECRET_MASK) return existing[field] ?? null;
  return v;
}

export async function saveDataSourcesConfig(input = {}) {
  const existing = await getDataSourcesConfig();
  const next = {
    serpApiKey: applySecret(input, existing, "serpApiKey"),
    checkGoogleDuplicates:
      input.checkGoogleDuplicates !== undefined
        ? Boolean(input.checkGoogleDuplicates)
        : existing.checkGoogleDuplicates !== false,
    deciderFallback:
      input.deciderFallback !== undefined
        ? sanitizeDeciderFallback(input.deciderFallback)
        : sanitizeDeciderFallback(existing.deciderFallback),
  };
  await writeSetting(next);
  return next;
}

let keyCache = { value: "", at: 0 };
const KEY_CACHE_MS = 30_000;

/** AppSetting key, then env. Cached briefly so paginated SERP calls do not hit the DB each page. */
export async function resolveSerpApiKey() {
  const now = Date.now();
  if (keyCache.at && now - keyCache.at < KEY_CACHE_MS && keyCache.value) return keyCache.value;
  const stored = await getDataSourcesConfig();
  const key = String(stored.serpApiKey || "").trim() || envSerpApiKey();
  keyCache = { value: key, at: now };
  return key;
}

export function invalidateSerpApiKeyCache() {
  keyCache = { value: "", at: 0 };
}

export async function isSerpApiReady() {
  return Boolean(await resolveSerpApiKey());
}

export async function shouldCheckGoogleDuplicates() {
  const cfg = await getDataSourcesConfig();
  if (cfg.checkGoogleDuplicates === false) return false;
  return isSerpApiReady();
}

export function isSearchConsoleReady() {
  return Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim());
}

export async function getDeciderFallback() {
  const cfg = await getDataSourcesConfig();
  return sanitizeDeciderFallback(cfg.deciderFallback);
}

export function sanitizeDataSourcesForClient(row) {
  const stored = row || DEFAULT_DATA_SOURCES;
  const envKey = Boolean(envSerpApiKey());
  const savedKey = Boolean(stored.serpApiKey);
  const gsc = isSearchConsoleReady();
  return {
    serpApiKey: savedKey ? SECRET_MASK : "",
    checkGoogleDuplicates: stored.checkGoogleDuplicates !== false,
    deciderFallback: sanitizeDeciderFallback(stored.deciderFallback),
    keyStatus: {
      serpapi: savedKey || envKey,
      seranking: isSerankingConfigured(),
      gsc,
    },
    keySource: {
      serpapi: savedKey ? "saved" : envKey ? "env" : "missing",
    },
    ready: {
      trends: savedKey || envKey,
      serp: savedKey || envKey,
      seranking: isSerankingConfigured(),
      gsc,
    },
  };
}
