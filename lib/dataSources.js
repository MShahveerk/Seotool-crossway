/**
 * Global data-source credentials (Admin → Data sources).
 * SerpAPI, Google Programmable Search, and Brave keys are stored in AppSetting
 * with env fallback. SE Ranking remains env-only this phase.
 */
import prisma from "./prisma.js";
import { isSerankingConfigured } from "./seranking/config.js";

export const SECRET_MASK = "••••••••";
const CONFIG_KEY = "data_sources";

export const DECIDER_FALLBACKS = ["harvest", "gsc"];

export const DEFAULT_DATA_SOURCES = {
  serpApiKey: null,
  googleCseKey: null,
  googleCseCx: null,
  braveSearchKey: null,
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

function envGoogleCseKey() {
  return process.env.GOOGLE_CSE_API_KEY?.trim() || process.env.GOOGLE_CUSTOM_SEARCH_KEY?.trim() || "";
}

function envGoogleCseCx() {
  return process.env.GOOGLE_CSE_CX?.trim() || process.env.GOOGLE_CSE_ID?.trim() || "";
}

function envBraveSearchKey() {
  return process.env.BRAVE_SEARCH_API_KEY?.trim() || process.env.BRAVE_API_KEY?.trim() || "";
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

function applyPlain(input, existing, field) {
  if (input[field] === undefined) return existing[field] ?? null;
  const v = String(input[field] || "").trim();
  return v || null;
}

export async function saveDataSourcesConfig(input = {}) {
  const existing = await getDataSourcesConfig();
  const next = {
    serpApiKey: applySecret(input, existing, "serpApiKey"),
    googleCseKey: applySecret(input, existing, "googleCseKey"),
    googleCseCx: applyPlain(input, existing, "googleCseCx"),
    braveSearchKey: applySecret(input, existing, "braveSearchKey"),
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

let credCache = { value: null, at: 0 };
const KEY_CACHE_MS = 30_000;

/** AppSetting keys, then env. Cached briefly so paginated SERP calls do not hit the DB each page. */
export async function resolveSearchCredentials() {
  const now = Date.now();
  if (credCache.value && now - credCache.at < KEY_CACHE_MS) return credCache.value;
  const stored = await getDataSourcesConfig();
  const value = {
    serpApiKey: String(stored.serpApiKey || "").trim() || envSerpApiKey(),
    googleCseKey: String(stored.googleCseKey || "").trim() || envGoogleCseKey(),
    googleCseCx: String(stored.googleCseCx || "").trim() || envGoogleCseCx(),
    braveSearchKey: String(stored.braveSearchKey || "").trim() || envBraveSearchKey(),
  };
  credCache = { value, at: now };
  return value;
}

export async function resolveSerpApiKey() {
  return (await resolveSearchCredentials()).serpApiKey;
}

export async function resolveGoogleCseCredentials() {
  const { googleCseKey, googleCseCx } = await resolveSearchCredentials();
  if (!googleCseKey || !googleCseCx) return null;
  return { apiKey: googleCseKey, cx: googleCseCx };
}

export async function resolveBraveSearchKey() {
  return (await resolveSearchCredentials()).braveSearchKey;
}

export function invalidateSerpApiKeyCache() {
  credCache = { value: null, at: 0 };
}

export async function isSerpApiReady() {
  return Boolean(await resolveSerpApiKey());
}

/** Organic web results: SerpAPI, Google CSE, Brave, or the built-in DuckDuckGo fallback. */
export async function isOrganicSearchReady() {
  return true;
}

export async function shouldCheckGoogleDuplicates() {
  const cfg = await getDataSourcesConfig();
  if (cfg.checkGoogleDuplicates === false) return false;
  return isOrganicSearchReady();
}

export function isSearchConsoleReady() {
  return Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim());
}

export async function getDeciderFallback() {
  const cfg = await getDataSourcesConfig();
  return sanitizeDeciderFallback(cfg.deciderFallback);
}

function keySourceOf(saved, env) {
  if (saved) return "saved";
  if (env) return "env";
  return "missing";
}

export function sanitizeDataSourcesForClient(row) {
  const stored = row || DEFAULT_DATA_SOURCES;
  const envKey = Boolean(envSerpApiKey());
  const savedKey = Boolean(stored.serpApiKey);
  const envCseKey = Boolean(envGoogleCseKey());
  const savedCseKey = Boolean(stored.googleCseKey);
  const envCseCx = Boolean(envGoogleCseCx());
  const savedCseCx = Boolean(stored.googleCseCx);
  const envBrave = Boolean(envBraveSearchKey());
  const savedBrave = Boolean(stored.braveSearchKey);
  const cseReady = (savedCseKey || envCseKey) && (savedCseCx || envCseCx);
  const braveReady = savedBrave || envBrave;
  const serpapiReady = savedKey || envKey;
  const gsc = isSearchConsoleReady();
  return {
    serpApiKey: savedKey ? SECRET_MASK : "",
    googleCseKey: savedCseKey ? SECRET_MASK : "",
    googleCseCx: String(stored.googleCseCx || "").trim() || (envCseCx ? envGoogleCseCx() : ""),
    braveSearchKey: savedBrave ? SECRET_MASK : "",
    checkGoogleDuplicates: stored.checkGoogleDuplicates !== false,
    deciderFallback: sanitizeDeciderFallback(stored.deciderFallback),
    keyStatus: {
      serpapi: serpapiReady,
      googleCse: cseReady,
      brave: braveReady,
      duckduckgo: true,
      seranking: isSerankingConfigured(),
      gsc,
    },
    keySource: {
      serpapi: keySourceOf(savedKey, envKey),
      googleCse: keySourceOf(savedCseKey && savedCseCx, envCseKey && envCseCx),
      brave: keySourceOf(savedBrave, envBrave),
    },
    ready: {
      trends: serpapiReady,
      serp: true,
      googleCse: cseReady,
      brave: braveReady,
      seranking: isSerankingConfigured(),
      gsc,
    },
  };
}
