/**
 * Where a linking site is from. SE Ranking backlinks are worldwide even when
 * the SERP location is local, so we label each prospect from a vendor country
 * code when present, otherwise from the host's country TLD.
 *
 * The vendor cannot filter referring domains by country. Link origin therefore
 * keeps only matching hosts (TLD or vendor country), and for countries with a
 * ccTLD it asks the individual-link endpoint for that TLD instead of the
 * worldwide authority list.
 */
import { countryDisplayName, iso2FromCountryInput, sameCountryCode } from "./geo/isoCountries.js";

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

function hostHasTldNeedle(host, needle) {
  const n = String(needle || "")
    .replace(/^\./, "")
    .toLowerCase();
  if (!host || !n) return false;
  return host === n || host.endsWith(`.${n}`);
}

function tldNeedlesForCode(code) {
  const aliased = CC_ALIASES[code] || code;
  const needles = new Set();
  if (aliased === "gb") needles.add(".uk");
  else if (aliased.length === 2) needles.add(`.${aliased}`);
  for (const [compound, cc] of Object.entries(COMPOUND_CC)) {
    if (cc === aliased) needles.add(`.${compound}`);
  }
  return [...needles];
}

/** Country the user asked to keep linking sites from. Null when worldwide. */
export function parseOriginCountry(input) {
  const code = iso2FromCountryInput(input);
  if (!code) return null;
  const display = displayFromCode(code);
  if (!display || display === GLOBAL_ORIGIN) return null;
  return {
    code,
    display,
    tldNeedles: tldNeedlesForCode(code),
  };
}

/**
 * SE Ranking `url_from_filter` needle for a country TLD hunt.
 * Blank for the United States: almost every US site is .com, so a .us filter
 * would return almost nothing while still spending the link credits.
 */
export function originApiUrlFilter(wanted) {
  if (!wanted?.tldNeedles?.length) return "";
  if (wanted.code === "us") return "";
  return [...wanted.tldNeedles].sort((a, b) => a.length - b.length)[0];
}

export function originCountryCodeFromHost(value, vendorCountry = "") {
  const vendorCode = iso2FromCountryInput(vendorCountry);
  if (vendorCode) return vendorCode;
  const host = hostFromValue(value);
  if (!host) return "";
  const cc = ccTldFromHost(host);
  return iso2FromCountryInput(cc) || CC_ALIASES[cc] || cc;
}

export function originMatchesCountry(value, vendorCountry, wanted) {
  if (!wanted) return true;
  const got = originCountryCodeFromHost(value, vendorCountry);
  if (got && sameCountryCode(got, wanted.code)) return true;
  const host = hostFromValue(value);
  return wanted.tldNeedles.some((needle) => hostHasTldNeedle(host, needle));
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
