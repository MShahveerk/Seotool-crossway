import { SerankingApiError } from "./client.js";
import { serankingCacheSiteForTarget, toSerankingDomain } from "./domain.js";

/** Resolve an arbitrary domain/URL for SE Ranking explorer + target-scoped cache. */
export function resolveSerankingTarget(input, fallbackSiteUrl = "") {
  const raw = String(input || fallbackSiteUrl || "").trim();
  const domain = toSerankingDomain(raw);
  if (!domain) {
    throw new SerankingApiError("Enter a valid domain or URL (e.g. example.com).", { status: 400 });
  }
  const cacheSite = serankingCacheSiteForTarget(domain);
  const siteUrlForApi = raw.startsWith("http") ? raw : `https://${domain}`;
  return { domain, cacheSite, siteUrlForApi, raw: raw || domain };
}
