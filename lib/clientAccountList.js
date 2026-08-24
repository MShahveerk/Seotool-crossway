/**
 * Merge and display helpers for client account picker (websites + Meta pages).
 */
import { canonicalizeSiteKey, isMetaPageId, pickClientDisplayName } from "./siteAccess";

function isWebsiteKey(value) {
  const c = canonicalizeSiteKey(value);
  return Boolean(c && (c.startsWith("http") || c.startsWith("sc-domain:")));
}

function pickBetterDisplayName(a, b) {
  const nameA = String(a.displayName || a.userName || "").trim();
  const nameB = String(b.displayName || b.userName || "").trim();
  const aLooksLikeUrl =
    nameA.startsWith("http") || /^[\w.-]+\.[a-z]{2,}/i.test(nameA) || isMetaPageId(nameA);
  const bLooksLikeUrl =
    nameB.startsWith("http") || /^[\w.-]+\.[a-z]{2,}/i.test(nameB) || isMetaPageId(nameB);
  if (nameA && nameB) {
    if (!aLooksLikeUrl && bLooksLikeUrl) return nameA;
    if (aLooksLikeUrl && !bLooksLikeUrl) return nameB;
    return nameB.length > nameA.length ? nameB : nameA;
  }
  return nameA || nameB;
}

function mergeTwoAccounts(a, b) {
  const siteLink = a.siteLink || b.siteLink || "";
  const facebookPageId = String(a.facebookPageId || b.facebookPageId || "").trim();
  const instagramUserId = String(a.instagramUserId || b.instagramUserId || "").trim();
  const displayName = pickBetterDisplayName(a, b);
  const sourcedFromWebsite = a.type === "website" || b.type === "website";

  return {
    userId: a.userId || b.userId || null,
    userEmail: a.userEmail || b.userEmail || "",
    siteLink,
    facebookPageId,
    instagramUserId,
    isSuperAdminSite: Boolean(a.isSuperAdminSite || b.isSuperAdminSite),
    type: sourcedFromWebsite
      ? "website"
      : facebookPageId
        ? "meta_page"
        : a.type || b.type || "website",
    userName: displayName,
    displayName,
  };
}

function isMetaPageEntry(entry) {
  return entry?.type === "meta_page";
}

function accountsMatch(a, b) {
  const siteA = a.siteLink ? canonicalizeSiteKey(a.siteLink) : "";
  const siteB = b.siteLink ? canonicalizeSiteKey(b.siteLink) : "";
  const fbA = String(a.facebookPageId || "").trim();
  const fbB = String(b.facebookPageId || "").trim();

  // A website project and a Meta page stay separate, even when Graph copies
  // the site URL onto the page. Otherwise Facebook pages vanish into the site card.
  if (isMetaPageEntry(a) !== isMetaPageEntry(b)) return false;

  // Distinct Facebook pages stay distinct.
  if (fbA && fbB) return fbA === fbB;
  if (siteA && siteB && siteA === siteB && isWebsiteKey(siteA)) return true;
  return false;
}

/** Collapse duplicate website rows or duplicate Meta pages. Website + page stay separate. */
export function mergeClientAccountEntries(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const merged = [];

  for (const entry of list) {
    const idx = merged.findIndex((m) => accountsMatch(m, entry));
    if (idx === -1) {
      merged.push({ ...entry });
    } else {
      merged[idx] = mergeTwoAccounts(merged[idx], entry);
    }
  }

  return merged.map((entry) => {
    const displayName =
      entry.displayName ||
      pickClientDisplayName({
        userName: entry.userName,
        siteLink: entry.siteLink,
        facebookPageId: entry.facebookPageId,
        preferMetaName: entry.type === "meta_page",
      });
    return { ...entry, userName: displayName, displayName };
  });
}

/** Value stored in selectedSite — prefer canonical website URL when available. */
export function getClientAccountSelectValue(entry) {
  if (!entry) return "";
  if (entry.type === "meta_page" && entry.facebookPageId) {
    return String(entry.facebookPageId).trim();
  }
  const siteCanon = entry.siteLink ? canonicalizeSiteKey(entry.siteLink) : "";
  if (siteCanon && isWebsiteKey(siteCanon)) return siteCanon;
  if (entry.facebookPageId) return String(entry.facebookPageId).trim();
  return String(entry.siteLink || entry.facebookPageId || "").trim();
}

export function entryMatchesSelectValue(entry, selected) {
  if (!entry || selected == null || selected === "") return false;
  const sel = String(selected).trim();
  if (getClientAccountSelectValue(entry) === sel) return true;
  if (entry.facebookPageId && String(entry.facebookPageId).trim() === sel) return true;
  if (entry.siteLink && canonicalizeSiteKey(entry.siteLink) === canonicalizeSiteKey(sel)) return true;
  return false;
}

export function getClientAccountFaviconUrl(siteLink) {
  const raw = String(siteLink || "").trim();
  if (!raw || isMetaPageId(raw)) return "";
  try {
    const url = raw.startsWith("http") || raw.startsWith("sc-domain:") ? raw : `https://${raw}`;
    if (url.startsWith("sc-domain:")) {
      const domain = url.replace(/^sc-domain:/, "").trim();
      return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : "";
    }
    const hostname = new URL(url).hostname;
    return hostname ? `https://www.google.com/s2/favicons?domain=${hostname}&sz=64` : "";
  } catch {
    return "";
  }
}
