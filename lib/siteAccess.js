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
 * Expand every site identifier a user is mapped to (primary + accessibleSites + Meta IDs).
 */
export async function resolveUserSiteEquivalents(prisma, user) {
  if (!user) return [];
  const seeds = [
    user.siteLink,
    user.facebookPageId,
    user.instagramUserId,
    ...((user.accessibleSites || []).map((s) => (typeof s === "string" ? s : s?.siteLink))),
  ]
    .map((s) => String(s || "").trim())
    .filter(Boolean);

  const all = new Set();
  for (const seed of seeds) {
    all.add(seed);
    try {
      const eqs = await resolveSiteEquivalents(prisma, seed);
      for (const e of eqs) {
        const raw = String(e || "").trim();
        if (raw) all.add(raw);
      }
    } catch {
      /* keep seed */
    }
  }
  return Array.from(all);
}

/**
 * Approvals visible to a site approver/user: assigned to them OR matching their sites.
 * Matches the email audience (all site-mapped approvers), not only primary assigneeId.
 */
export async function buildSiteApproverApprovalWhere(prisma, user) {
  if (!user?.id) return { assigneeId: "impossible", status: { not: "draft" } };

  const equivalents = await resolveUserSiteEquivalents(prisma, user);
  const siteFilter = buildApprovalSiteOrFilter(equivalents);
  const visibility = siteFilter
    ? { OR: [{ assigneeId: user.id }, siteFilter] }
    : { assigneeId: user.id };

  return {
    AND: [{ status: { not: "draft" } }, visibility],
  };
}

/** Whether an approver/user may act on an approval (assignee or same-site mapped). */
export async function userCanAccessApproval(prisma, sessionUser, approval) {
  if (!sessionUser?.id || !approval) return false;
  if (sessionUser.role === "super_admin" || sessionUser.role === "smm") return true;
  if (approval.assigneeId === sessionUser.id) return true;
  return sessionCanAccessSiteAsync(prisma, sessionUser, [
    approval.siteLink,
    approval.facebookPageId,
    approval.instagramUserId,
  ]);
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

function isPlaceholderClientLabel(label) {
  const s = String(label || "").trim();
  if (!s) return true;
  if (isMetaPageId(s)) return true;
  if (/facebook\s*page/i.test(s)) return true;
  if (/meta\s*page/i.test(s)) return true;
  if (/^social account$/i.test(s)) return true;
  if (/^client account$/i.test(s)) return true;
  return false;
}

/**
 * Prefer a human-readable client label over raw Meta IDs / URLs.
 * Website hostname beats Meta page names when both exist.
 */
export function pickClientDisplayName({ userName, siteLink, facebookPageId, metaName, preferMetaName = false } = {}) {
  const pageLabel = () => {
    if (metaName && !isPlaceholderClientLabel(metaName) && !String(metaName).startsWith("http")) {
      return String(metaName).trim();
    }
    if (userName && !isPlaceholderClientLabel(userName) && !String(userName).startsWith("http")) {
      return String(userName).trim();
    }
    return "";
  };

  if (preferMetaName) {
    const named = pageLabel();
    if (named) return named;
    // Do not fall through to the linked website hostname. That makes a Meta
    // page look like a duplicate of the site instead of its own project.
    return "";
  }

  if (siteLink && !isMetaPageId(siteLink)) {
    try {
      const host = new URL(siteLink.startsWith("http") ? siteLink : `https://${siteLink}`).hostname.replace(
        /^www\./,
        ""
      );
      if (host && !isPlaceholderClientLabel(host)) return host;
    } catch {
      const host = String(siteLink)
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0];
      if (host && !isPlaceholderClientLabel(host)) return host;
    }
  }
  if (userName && !isPlaceholderClientLabel(userName) && !String(userName).startsWith("http")) {
    return String(userName).trim();
  }
  if (metaName && !isPlaceholderClientLabel(metaName)) return String(metaName).trim();
  if (facebookPageId) return "Your account";
  return "Your account";
}
