/**
 * Collapse a user's site keys into one report pack per client account
 * (website + linked Meta page = one email, not two).
 */
import prisma from "../prisma.js";
import {
  canonicalizeSiteKey,
  isMetaPageId,
  resolveSiteEquivalents,
  pickClientDisplayName,
} from "../siteAccess.js";
import { normalizeSiteOrigin } from "../validation.js";
import { resolveSiteReportContext } from "../siteReportContext.js";

function uniqueKeys(keys) {
  return [...new Set((keys || []).map((k) => String(k || "").trim()).filter(Boolean))];
}

export function rawSiteKeysForUser(user) {
  const keys = [];
  if (user?.siteLink) keys.push(user.siteLink);
  if (user?.facebookPageId) keys.push(user.facebookPageId);
  if (user?.instagramUserId) keys.push(user.instagramUserId);
  for (const s of user?.accessibleSites || []) {
    keys.push(typeof s === "string" ? s : s?.siteLink);
  }
  return uniqueKeys(keys);
}

function hostnameFromUrl(url) {
  if (!url) return null;
  try {
    return new URL(String(url).startsWith("http") ? url : `https://${url}`).hostname.replace(
      /^www\./,
      ""
    );
  } catch {
    const raw = String(url)
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];
    return raw || null;
  }
}

/** Labels that must never appear on client-facing reports / emails. */
function isBadDisplayLabel(label) {
  const s = String(label || "").trim();
  if (!s) return true;
  if (isMetaPageId(s)) return true;
  if (/^https?:\/\//i.test(s)) return true;
  if (/facebook\s*page/i.test(s)) return true;
  if (/meta\s*page/i.test(s)) return true;
  if (/^social account$/i.test(s)) return true;
  if (/^client account$/i.test(s)) return true;
  return false;
}

async function lookupMetaDisplayName(equivalents) {
  if (!equivalents?.length) return null;
  const row = await prisma.socialMediaDailyStat.findFirst({
    where: {
      siteLink: { in: equivalents },
      platform: { in: ["facebook", "instagram"] },
    },
    orderBy: { statDate: "desc" },
    select: { accountName: true, accountHandle: true },
  });
  const name = String(row?.accountName || "").trim();
  const handle = String(row?.accountHandle || "").trim().replace(/^@/, "");
  if (name && !isBadDisplayLabel(name)) return name;
  if (handle && !isBadDisplayLabel(handle)) return handle;
  return null;
}

/**
 * Human label for emails / PDF covers.
 * Prefer the website hostname for any pack that has a site URL — never "Facebook Page".
 */
export async function resolveReportDisplayName(siteKey, context = null) {
  const ctx = context || (await resolveSiteReportContext(prisma, siteKey));
  const eqs = await resolveSiteEquivalents(prisma, siteKey);
  const websiteUrl = ctx.websiteUrl || null;
  const host = hostnameFromUrl(websiteUrl);

  // Combined / website packs: brand as the website, not the Meta page.
  if (host && !isBadDisplayLabel(host)) return host;

  const metaName = await lookupMetaDisplayName(eqs);
  if (metaName && !isBadDisplayLabel(metaName)) return metaName;

  const label = pickClientDisplayName({
    userName: ctx.displayName,
    siteLink: websiteUrl || (!isMetaPageId(siteKey) ? siteKey : null),
    facebookPageId: eqs.find((e) => isMetaPageId(e)) || null,
    metaName: null, // never let Meta name override a website we already checked
  });

  if (label && !isBadDisplayLabel(label)) return label;

  const fromKey = !isMetaPageId(siteKey) ? hostnameFromUrl(siteKey) : null;
  if (fromKey && !isBadDisplayLabel(fromKey)) return fromKey;

  return "Your account";
}

/**
 * @returns {Promise<Array<{ siteKey: string, displayName: string, websiteUrl: string|null, includeWebsite: boolean, equivalents: string[] }>>}
 */
export async function resolveReportPacksForKeys(siteKeys) {
  const packs = [];
  const claimed = new Set();

  for (const raw of uniqueKeys(siteKeys)) {
    const canon = canonicalizeSiteKey(raw);
    if (claimed.has(raw) || (canon && claimed.has(canon))) continue;

    const eqs = await resolveSiteEquivalents(prisma, raw);
    const context = await resolveSiteReportContext(prisma, raw);

    const websiteUrl =
      context.websiteUrl ||
      eqs.map((e) => normalizeSiteOrigin(e)).find((e) => e && e.startsWith("http")) ||
      null;

    // Prefer website URL as the build key so combined decks include GSC/SEO
    const packKey = websiteUrl || eqs.find((e) => !isMetaPageId(e)) || raw;
    const displayName = await resolveReportDisplayName(packKey, {
      ...context,
      websiteUrl,
      displayName: context.displayName,
    });

    for (const e of eqs) {
      claimed.add(e);
      const c = canonicalizeSiteKey(e);
      if (c) claimed.add(c);
    }

    packs.push({
      siteKey: packKey,
      displayName,
      websiteUrl,
      includeWebsite: Boolean(websiteUrl),
      equivalents: eqs,
    });
  }

  return packs;
}

export async function resolveReportPacksForUser(user) {
  return resolveReportPacksForKeys(rawSiteKeysForUser(user));
}

export async function resolveAllClientReportPacks() {
  const [sites, users] = await Promise.all([
    prisma.site.findMany({
      select: { siteUrl: true, facebookPageId: true, instagramUserId: true },
    }),
    prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      select: {
        siteLink: true,
        facebookPageId: true,
        instagramUserId: true,
        accessibleSites: { select: { siteLink: true } },
      },
    }),
  ]);

  const keys = [];
  for (const s of sites) {
    if (s.siteUrl) keys.push(s.siteUrl);
    if (s.facebookPageId) keys.push(s.facebookPageId);
  }
  for (const u of users) {
    keys.push(...rawSiteKeysForUser(u));
  }
  return resolveReportPacksForKeys(keys);
}
