import { normalizeSiteOrigin } from "../validation.js";

/** Registrable domain for SE Ranking API (example.com). */
export function toSerankingDomain(input) {
  const raw = String(input || "").trim().toLowerCase();
  if (!raw) return null;
  try {
    const host = raw.startsWith("http") ? new URL(raw).hostname : new URL(`https://${raw}`).hostname;
    const domain = host.replace(/^www\./, "");
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : null;
  } catch {
    return null;
  }
}

export function toSerankingSiteUrl(input) {
  return normalizeSiteOrigin(input) || null;
}
