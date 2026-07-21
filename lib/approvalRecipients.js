/**
 * Shared approval-email recipient resolution.
 * Social posts and blogs MUST use the same audience for a given site.
 */
import prisma from "./prisma.js";
import { ROLES } from "./rbac.js";
import { findAssigneesForSite } from "./blogAssignee.js";
import { canonicalizeSiteKey, resolveSiteEquivalents } from "./siteAccess.js";

function siteKeySet(values = []) {
  const set = new Set();
  for (const value of values) {
    const raw = String(value || "").trim();
    if (!raw) continue;
    set.add(raw);
    set.add(raw.toLowerCase());
    const canonical = canonicalizeSiteKey(raw);
    if (canonical) {
      set.add(canonical);
      set.add(canonical.toLowerCase());
    }
    // Match www / non-www host variants.
    try {
      const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
      const host = url.hostname.toLowerCase();
      const bare = host.replace(/^www\./, "");
      set.add(`${url.protocol}//${host}`);
      set.add(`${url.protocol}//www.${bare}`);
      set.add(`${url.protocol}//${bare}`);
      set.add(host);
      set.add(bare);
      set.add(`www.${bare}`);
    } catch {
      /* ignore non-URLs */
    }
  }
  return set;
}

function userTouchesSite(user, siteKeys) {
  const keys = siteKeySet(siteKeys);
  const candidates = [
    user.siteLink,
    user.facebookPageId,
    user.instagramUserId,
    ...(user.accessibleSites || []).map((entry) => entry.siteLink),
  ];
  for (const candidate of candidates) {
    const raw = String(candidate || "").trim();
    if (!raw) continue;
    if (keys.has(raw) || keys.has(raw.toLowerCase())) return true;
    const canonical = canonicalizeSiteKey(raw);
    if (canonical && (keys.has(canonical) || keys.has(canonical.toLowerCase()))) return true;
    try {
      const host = new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname
        .toLowerCase()
        .replace(/^www\./, "");
      if (host && (keys.has(host) || keys.has(`www.${host}`))) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

/**
 * Resolve every inbox that should receive an approval email for a site —
 * identical list for social posts and blogs.
 *
 * @returns {Promise<{ recipients: Array<{email:string,name?:string,role?:string,id?:string}>, siteKeys: string[], assignee: object|null, allApprovers: object[] }>}
 */
export async function collectApprovalEmailRecipients({
  siteLink,
  selectedSite = null,
  creator = null,
  creatorUserId = null,
  operatorUser = null,
} = {}) {
  const selected = String(selectedSite || siteLink || "").trim();
  const equivalents = await resolveSiteEquivalents(prisma, selected);
  const siteKeys = [...new Set([selected, siteLink, ...equivalents].filter(Boolean))];

  const { assignee, allApprovers } = await findAssigneesForSite(selected, { operatorUser });
  const byEmail = new Map();

  const add = (person, roleHint = null) => {
    const email = String(person?.email || "").trim().toLowerCase();
    if (!email || byEmail.has(email)) return;
    byEmail.set(email, {
      id: person.id || null,
      email: person.email,
      name: person.name || null,
      role: person.role || roleHint || null,
    });
  };

  // 1. Site-mapped approvers / users (primary recipients)
  for (const approver of allApprovers) add(approver);

  // 2. Extra safety: any active approver/user whose sites touch this account
  const mappedApprovers = await prisma.user.findMany({
    where: {
      role: { in: [ROLES.APPROVER, ROLES.USER] },
      isActive: true,
      deletedAt: null,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      siteLink: true,
      facebookPageId: true,
      instagramUserId: true,
      accessibleSites: { select: { siteLink: true } },
    },
  });
  for (const user of mappedApprovers) {
    if (userTouchesSite(user, siteKeys)) add(user);
  }

  // 3. All active super admins (same as social)
  const superAdmins = await prisma.user.findMany({
    where: { role: ROLES.SUPER_ADMIN, isActive: true, deletedAt: null },
    select: { id: true, email: true, name: true, role: true },
  });
  for (const admin of superAdmins) add(admin, ROLES.SUPER_ADMIN);

  // 4. Creator
  if (creator?.email) {
    add(creator);
  } else if (creatorUserId) {
    const creatorRow = await prisma.user.findUnique({
      where: { id: creatorUserId },
      select: { id: true, email: true, name: true, role: true },
    });
    if (creatorRow) add(creatorRow);
  }

  // 5. Site-mapped SMMs (creator or mapped) — same as social
  const smms = await prisma.user.findMany({
    where: { role: ROLES.SMM, isActive: true, deletedAt: null },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      siteLink: true,
      facebookPageId: true,
      instagramUserId: true,
      accessibleSites: { select: { siteLink: true } },
    },
  });
  for (const smm of smms) {
    const isCreator = creatorUserId && smm.id === creatorUserId;
    if (isCreator || userTouchesSite(smm, siteKeys)) add(smm, ROLES.SMM);
  }

  const recipients = [...byEmail.values()];
  console.log(
    `[approval-recipients] site=${selected} keys=${siteKeys.length} recipients=${recipients.length} [${recipients.map((r) => `${r.email}(${r.role || "?"})`).join(", ")}]`
  );

  return { recipients, siteKeys, assignee, allApprovers };
}
