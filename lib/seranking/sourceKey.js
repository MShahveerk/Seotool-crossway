import crypto from "crypto";

export const SOURCE_KEY_MAX = 64;
export const DATA_TYPE_MAX = 64;
export const SITE_URL_MAX = 512;

/**
 * Prisma `SerankingSnapshot.source_key` is VARCHAR(64). Callers used to pass
 * `qualify-v6:${domain}:${keyword}:${type}` and similar, which overflows,
 * floods Postgres with failed upserts, and takes the rest of the app down
 * with it (JWT lookups, open connections).
 *
 * Hash the overflow so get/save stay aligned without changing keys that
 * already fit.
 */
export function clampSourceKey(sourceKey = "") {
  const key = String(sourceKey || "");
  if (key.length <= SOURCE_KEY_MAX) return key;
  const hash = crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
  const prefixLen = SOURCE_KEY_MAX - hash.length - 1;
  return `${key.slice(0, Math.max(0, prefixLen))}:${hash}`.slice(0, SOURCE_KEY_MAX);
}

export function clampDataType(dataType = "") {
  const value = String(dataType || "");
  return value.length <= DATA_TYPE_MAX ? value : value.slice(0, DATA_TYPE_MAX);
}

export function clampSiteUrl(siteUrl = "") {
  const value = String(siteUrl || "");
  if (value.length <= SITE_URL_MAX) return value;
  const hash = crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
  const prefixLen = SITE_URL_MAX - hash.length - 1;
  return `${value.slice(0, Math.max(0, prefixLen))}:${hash}`.slice(0, SITE_URL_MAX);
}
