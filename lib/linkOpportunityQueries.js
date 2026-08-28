/**
 * Free-intent Google queries for Link Opportunities.
 * Kept dependency-light so unit tests can import it without Prisma.
 */

import { placeFromKeyword } from "./serpLocations.js";

export const MAX_FREE_DISCOVERY_QUERIES = 12;
export const DISCOVERY_FETCH_CONCURRENCY = 5;

export const EARNED_ROUTE_RE =
  /write\s*for\s*us|guest\s*post|become\s+a\s+contributor|contributor\s+guidelines|submit\s+(a|your)\s+(article|guest|post)/i;
export const FREE_LISTING_ROUTE_RE =
  /add\s+your\s+business|add\s+(a\s+)?listing|free\s+listing|claim\s+(your\s+)?(free\s+)?listing|chamber\s+of\s+commerce/i;

const GUEST_PATH_RE =
  /(write[-_]for[-_]us|guest[-_]post|guest[-_]blog|contribut(e|or)|become[-_]an?[-_]author|submit[-_](a[-_])?(post|article|story|guest|tip))/i;
const RESOURCE_PATH_RE = /\/(resources?|useful[-_]links?|helpful[-_]links?|recommended|partners?|links)(\/|$)/i;
const ROUNDUP_PATH_RE = /\/(best[-_]|top[-_]\d|\d+[-_]best|\d+[-_]top|alternatives?|vs[-_]|comparison)/i;

/** Extra SERPs aimed at unpaid submit / contribute / listing routes. */
export function buildFreeDiscoveryQueries(keyword, { location = "" } = {}) {
  const q = String(keyword || "").trim();
  if (!q) return [];
  const place = placeFromKeyword(q, location);
  const city = place?.city || "";
  const niche = city
    ? q.replace(new RegExp(city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), "").replace(/\s+/g, " ").trim()
    : q;
  const queries = [];
  queries.push(`${q} "write for us"`);
  queries.push(`${q} "guest post"`);
  queries.push(`${q} "become a contributor"`);
  queries.push(`${q} "submit your article"`);
  if (city) {
    queries.push(`${city} "write for us"`);
    queries.push(`${city} guest post`);
    queries.push(`${city} chamber of commerce`);
    queries.push(`${city} "add your business"`);
    queries.push(`${city} business directory`);
    if (niche) {
      queries.push(`${niche} "write for us"`);
      queries.push(`${niche} guest post guidelines`);
    }
  }
  queries.push(`${q} "contributor guidelines"`);
  queries.push(`${q} "add your business"`);
  queries.push(`${q} "free listing"`);
  queries.push(`${q} directory`);
  queries.push(`${q} resources`);
  queries.push(`${q} "suggest a resource"`);
  if (city) queries.push(`${city} business journal`);
  return [...new Set(queries.filter(Boolean))].slice(0, MAX_FREE_DISCOVERY_QUERIES);
}

/** Type from the SERP row itself, before host blocklists. */
export function discoveryPageKind(result, query = "") {
  const url = result?.link || "";
  const title = result?.title || "";
  const snippet = result?.snippet || "";
  let path = "";
  try {
    path = url ? new URL(url).pathname || "" : "";
  } catch {
    path = url;
  }
  const hay = `${path} ${url} ${title} ${snippet}`;
  if (GUEST_PATH_RE.test(path) || GUEST_PATH_RE.test(url) || EARNED_ROUTE_RE.test(hay)) return "guest-post";
  if (ROUNDUP_PATH_RE.test(path)) return "roundup";
  if (RESOURCE_PATH_RE.test(path)) return "resource";
  if (FREE_LISTING_ROUTE_RE.test(hay)) return "directory";
  if (EARNED_ROUTE_RE.test(String(query || ""))) return "guest-post";
  if (FREE_LISTING_ROUTE_RE.test(String(query || ""))) return "directory";
  return null;
}
