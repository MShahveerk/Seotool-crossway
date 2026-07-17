/**
 * Site / Meta page access helpers.
 * Client accounts may be stored as website URLs or numeric Meta page IDs.
 */

import { normalizeSiteOrigin } from "./validation";

export function isMetaPageId(value) {
  return /^\d+$/.test(String(value || "").trim());
}

/** Canonical key for comparisons: Meta IDs as-is, URLs as origin. */
export function canonicalizeSiteKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (isMetaPageId(raw)) return raw;
  return normalizeSiteOrigin(raw) || raw.replace(/\/+$/, "").toLowerCase();
}

/**
 * Expand a selected client account into all related siteLink / FB / IG identifiers.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} siteKey
 * @returns {Promise<string[]>}
 */
export async function resolveSiteEquivalents(prisma, siteKey) {
  const key = String(siteKey || "").trim();
  if (!key) return [];

  const equivalents = new Set([key]);
  const canonical = canonicalizeSiteKey(key);
  if (canonical) equivalents.add(canonical);

  const or = [
    { facebookPageId: key },
    { instagramUserId: key },
    { siteUrl: key },
  ];
  if (canonical && canonical !== key) {
    or.push({ siteUrl: canonical });
  }

  const siteRecord = await prisma.site.findFirst({ where: { OR: or } });
  if (siteRecord) {
    if (siteRecord.siteUrl) {
      equivalents.add(siteRecord.siteUrl);
      const n = normalizeSiteOrigin(siteRecord.siteUrl);
      if (n) equivalents.add(n);
    }
    if (siteRecord.facebookPageId) equivalents.add(String(siteRecord.facebookPageId).trim());
    if (siteRecord.instagramUserId) equivalents.add(String(siteRecord.instagramUserId).trim());
  }

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { siteLink: key },
        ...(canonical && canonical !== key ? [{ siteLink: canonical }] : []),
        { facebookPageId: key },
        { instagramUserId: key },
        { accessibleSites: { some: { siteLink: key } } },
      ],
    },
    select: {
      siteLink: true,
      facebookPageId: true,
      instagramUserId: true,
      accessibleSites: { select: { siteLink: true } },
    },
  });

  for (const u of users) {
    if (u.siteLink) {
      equivalents.add(u.siteLink);
      const n = normalizeSiteOrigin(u.siteLink);
      if (n) equivalents.add(n);
    }
    if (u.facebookPageId) equivalents.add(String(u.facebookPageId).trim());
    if (u.instagramUserId) equivalents.add(String(u.instagramUserId).trim());
    for (const entry of u.accessibleSites || []) {
      if (entry.siteLink) {
        equivalents.add(entry.siteLink);
        const n = normalizeSiteOrigin(entry.siteLink);
        if (n) equivalents.add(n);
      }
    }
  }

  return Array.from(equivalents).filter(Boolean);
}

/**
 * Build a Prisma OR filter that matches approvals for a client account (and equivalents).
 */
export function buildApprovalSiteOrFilter(equivalents) {
  const keys = (equivalents || []).map((s) => String(s).trim()).filter(Boolean);
  if (!keys.length) return null;

  const or = [
    { facebookPageId: { in: keys } },
    { instagramUserId: { in: keys } },
    { siteLink: { in: keys } },
  ];

  for (const key of keys) {
    if (!isMetaPageId(key) && key.includes(".")) {
      try {
        const host = new URL(key.startsWith("http") ? key : `https://${key}`).hostname
          .replace(/^www\./i, "")
          .toLowerCase();
        if (host) {
          or.push({ siteLink: { contains: host } });
        }
      } catch {
        // ignore
      }
    }
  }

  return { OR: or };
}

/**
 * Collect all site keys a user is allowed to access (raw + canonical).
 */
export function getSessionAllowedSiteKeys(sessionUser) {
  const allowed = new Set();
  if (!sessionUser) return allowed;

  const add = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return;
    allowed.add(raw);
    allowed.add(raw.toLowerCase());
    const canonical = canonicalizeSiteKey(raw);
    if (canonical) {
      allowed.add(canonical);
      allowed.add(canonical.toLowerCase());
    }
  };

  // SMM: strictly limited to admin-assigned client accounts only
  if (sessionUser.role === "smm") {
    for (const s of sessionUser.accessibleSites || []) add(s);
    return allowed;
  }

  for (const s of sessionUser.accessibleSites || []) add(s);
  add(sessionUser.siteLink);
  add(sessionUser.facebookPageId);
  add(sessionUser.instagramUserId);

  return allowed;
}

/**
 * Whether the session may access any of the given site keys / equivalents.
 * Super admins always pass.
 */
export function sessionCanAccessSite(sessionUser, siteKeys) {
  if (!sessionUser) return false;
  if (sessionUser.role === "super_admin") return true;

  const allowed = getSessionAllowedSiteKeys(sessionUser);
  if (!allowed.size) return false;

  for (const key of siteKeys || []) {
    const raw = String(key || "").trim();
    if (!raw) continue;
    if (allowed.has(raw) || allowed.has(raw.toLowerCase())) return true;
    const canonical = canonicalizeSiteKey(raw);
    if (canonical && (allowed.has(canonical) || allowed.has(canonical.toLowerCase()))) return true;
  }
  return false;
}

/**
 * Async access check that also expands each of the user's assigned sites
 * (so a Meta page ID assignment can match a website URL selection and vice versa).
 */
export async function sessionCanAccessSiteAsync(prisma, sessionUser, siteKeys) {
  if (sessionCanAccessSite(sessionUser, siteKeys)) return true;
  if (!sessionUser || sessionUser.role === "super_admin") return true;
  if (!prisma) return false;

  const targetSet = new Set();
  for (const key of siteKeys || []) {
    const raw = String(key || "").trim();
    if (!raw) continue;
    targetSet.add(raw);
    targetSet.add(raw.toLowerCase());
    const canonical = canonicalizeSiteKey(raw);
    if (canonical) {
      targetSet.add(canonical);
      targetSet.add(canonical.toLowerCase());
    }
  }
  if (!targetSet.size) return false;

  const seeds = [
    ...(sessionUser.accessibleSites || []),
    sessionUser.siteLink,
    sessionUser.facebookPageId,
    sessionUser.instagramUserId,
  ]
    .map((s) => String(s || "").trim())
    .filter(Boolean);

  for (const seed of seeds) {
    const eqs = await resolveSiteEquivalents(prisma, seed);
    for (const e of eqs) {
      const raw = String(e || "").trim();
      if (!raw) continue;
      if (targetSet.has(raw) || targetSet.has(raw.toLowerCase())) return true;
    }
  }
  return false;
}

/** Prefer a human-readable client label over raw Meta IDs / URLs. */
export function pickClientDisplayName({ userName, siteLink, facebookPageId, metaName } = {}) {
  if (metaName && !isMetaPageId(metaName)) return String(metaName).trim();
  if (userName && !isMetaPageId(userName) && !String(userName).startsWith("http")) {
    return String(userName).trim();
  }
  if (siteLink) {
    try {
      return new URL(siteLink.startsWith("http") ? siteLink : `https://${siteLink}`).hostname.replace(
        /^www\./,
        ""
      );
    } catch {
      return String(siteLink).replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    }
  }
  if (userName && !isMetaPageId(userName)) return String(userName).trim();
  if (facebookPageId) return `Facebook Page`;
  return "Client Account";
}
