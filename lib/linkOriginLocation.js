/**
 * Where a linking site is from. SE Ranking backlinks are worldwide even when
 * the SERP location is local, so we label each prospect from a vendor country
 * code when present, otherwise from the host's country TLD.
 */
import { countryDisplayName } from "./geo/isoCountries.js";

const GENERIC_TLDS = new Set([
  "com",
  "net",
  "org",
  "io",
  "co",
  "app",
  "dev",
  "xyz",
  "info",
  "biz",
  "online",
  "site",
  "shop",
  "store",
  "blog",
  "me",
  "tv",
  "cc",
  "ws",
  "tech",
  "ai",
  "cloud",
  "digital",
  "world",
  "today",
  "news",
  "media",
  "agency",
  "studio",
  "live",
  "space",
  "website",
  "club",
  "pro",
  "name",
  "mobi",
  "asia",
  "gov",
  "edu",
  "mil",
  "int",
  "aero",
  "jobs",
  "page",
  "zip",
  "mov",
  "ngo",
  "ong",
]);

const COMPOUND_CC = {
  "co.uk": "gb",
  "org.uk": "gb",
  "ac.uk": "gb",
  "gov.uk": "gb",
  "ltd.uk": "gb",
  "plc.uk": "gb",
  "com.au": "au",
  "net.au": "au",
  "org.au": "au",
  "edu.au": "au",
  "gov.au": "au",
  "co.nz": "nz",
  "org.nz": "nz",
  "net.nz": "nz",
  "com.br": "br",
  "com.pk": "pk",
  "org.pk": "pk",
  "co.in": "in",
  "net.in": "in",
  "org.in": "in",
  "com.mx": "mx",
  "co.za": "za",
  "com.sg": "sg",
  "co.jp": "jp",
  "or.jp": "jp",
  "ne.jp": "jp",
  "com.tr": "tr",
  "com.ar": "ar",
  "co.kr": "kr",
  "com.tw": "tw",
  "com.hk": "hk",
  "com.my": "my",
  "com.ph": "ph",
  "co.id": "id",
  "com.vn": "vn",
  "com.ng": "ng",
  "co.ke": "ke",
  "com.sa": "sa",
  "com.ae": "ae",
  "co.il": "il",
};

const CC_ALIASES = {
  uk: "gb",
  gb: "gb",
  usa: "us",
  ukr: "ua",
};

export const GLOBAL_ORIGIN = "Global";

function hostFromValue(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  if (!raw) return "";
  try {
    if (raw.includes("://") || raw.startsWith("//")) {
      return new URL(raw.startsWith("//") ? `https:${raw}` : raw).hostname.replace(/^www\./, "");
    }
  } catch {
    /* fall through */
  }
  return raw.split("/")[0].split(":")[0];
}

function ccTldFromHost(host) {
  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) return "";
  const last = parts[parts.length - 1];
  const prev = parts[parts.length - 2];
  const compound = COMPOUND_CC[`${prev}.${last}`];
  if (compound) return compound;
  if (GENERIC_TLDS.has(last) || last.length > 2) return "";
  return last;
}

function displayFromCode(code) {
  const raw = String(code || "")
    .trim()
    .toLowerCase();
  if (!raw) return "";
  const aliased = CC_ALIASES[raw] || raw;
  if (aliased === "global") return GLOBAL_ORIGIN;
  const name = countryDisplayName(aliased);
  if (!name || name === "Unknown" || name === aliased.toUpperCase()) {
    return aliased.length === 2 ? aliased.toUpperCase() : name;
  }
  return name;
}

/** Human location label for a linking host or URL. */
export function originLocationFromHost(value, vendorCountry = "") {
  const fromVendor = displayFromCode(vendorCountry);
  if (fromVendor && fromVendor !== vendorCountry.toUpperCase()) return fromVendor;
  if (fromVendor && String(vendorCountry).trim().length >= 2) return fromVendor;

  const host = hostFromValue(value);
  if (!host) return GLOBAL_ORIGIN;
  const cc = ccTldFromHost(host);
  if (!cc) return GLOBAL_ORIGIN;
  return displayFromCode(cc) || GLOBAL_ORIGIN;
}
