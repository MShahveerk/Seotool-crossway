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

/** Cache bucket for SE Ranking data on an arbitrary researched domain. */
export function serankingCacheSiteForTarget(input) {
  const domain = toSerankingDomain(input);
  return domain ? `__seranking_target__:${domain}` : null;
}

/** Host target for backlinks API (prefer actual hostname when URL is known). */
export function resolveBacklinkTarget(siteUrl, domain) {
  try {
    if (siteUrl?.startsWith("http")) {
      const host = new URL(siteUrl).hostname.replace(/^www\./, "");
      if (host) return { target: host, mode: "host" };
    }
  } catch {
    /* fall through */
  }
  return { target: domain, mode: "domain" };
}
