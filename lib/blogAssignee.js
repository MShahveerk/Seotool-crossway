/**
 * Resolve assignees for a site (same matching rules as social approvals).
 */
import crypto from "crypto";
import prisma from "./prisma.js";
import { ROLES } from "./rbac.js";
import { normalizeSiteForMatch } from "./blogPayload.js";
import { canonicalizeSiteKey, resolveSiteEquivalents } from "./siteAccess.js";

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  siteLink: true,
  facebookPageId: true,
  instagramUserId: true,
  accessibleSites: { select: { siteLink: true } },
};

async function resolveAdminFallbackAssignee(operatorUser) {
  if (operatorUser?.id) {
    const operator = await prisma.user.findFirst({
      where: { id: operatorUser.id, isActive: true, deletedAt: null },
      select: USER_SELECT,
    });
    if (operator && (operator.role === ROLES.SUPER_ADMIN || operator.role === ROLES.SMM)) {
      return operator;
    }
  }

  return prisma.user.findFirst({
    where: { role: ROLES.SUPER_ADMIN, isActive: true, deletedAt: null },
    select: USER_SELECT,
    orderBy: { createdAt: "asc" },
  });
}

function pickApprovers(matchedUsers, assignee) {
  const allApprovers = matchedUsers.filter((u) => u.role === ROLES.APPROVER || u.role === ROLES.USER);
  if (!allApprovers.length && assignee && assignee.role !== ROLES.SUPER_ADMIN && assignee.role !== ROLES.SMM) {
    allApprovers.push(assignee);
  }
  return allApprovers;
}

function buildMatchKeySet(values = []) {
  const set = new Set();
  for (const value of values) {
    const raw = String(value || "").trim();
    if (!raw) continue;
    set.add(raw);
    set.add(raw.toLowerCase());
    const normalized = normalizeSiteForMatch(raw);
    if (normalized) {
      set.add(normalized);
      set.add(String(normalized).toLowerCase());
    }
    const canonical = canonicalizeSiteKey(raw);
    if (canonical) {
      set.add(canonical);
      set.add(canonical.toLowerCase());
    }
    try {
      const host = new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.toLowerCase();
      const bare = host.replace(/^www\./, "");
      set.add(host);
      set.add(bare);
      set.add(`www.${bare}`);
    } catch {
      /* ignore */
    }
  }
  return set;
}

function userMatchesSiteKeys(user, matchKeys) {
  const candidates = [
    user.siteLink,
    user.facebookPageId,
    user.instagramUserId,
    ...(user.accessibleSites || []).map((entry) => entry.siteLink),
  ];
  for (const candidate of candidates) {
    const raw = String(candidate || "").trim();
    if (!raw) continue;
    if (matchKeys.has(raw) || matchKeys.has(raw.toLowerCase())) return true;
    const normalized = normalizeSiteForMatch(raw);
    if (normalized && (matchKeys.has(normalized) || matchKeys.has(String(normalized).toLowerCase()))) return true;
    const canonical = canonicalizeSiteKey(raw);
    if (canonical && (matchKeys.has(canonical) || matchKeys.has(canonical.toLowerCase()))) return true;
    try {
      const host = new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.toLowerCase();
      const bare = host.replace(/^www\./, "");
      if (matchKeys.has(host) || matchKeys.has(bare) || matchKeys.has(`www.${bare}`)) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

/**
 * @param {string} selectedSite
 * @param {{ operatorUser?: { id?: string, role?: string } }} [opts]
 */
export async function findAssigneesForSite(selectedSite, opts = {}) {
  const selected = String(selectedSite || "").trim();
  const equivalents = await resolveSiteEquivalents(prisma, selected);
  const matchKeys = buildMatchKeySet([selected, ...equivalents]);

  const candidateUsers = await prisma.user.findMany({
    where: { role: { not: ROLES.SUPER_ADMIN }, isActive: true, deletedAt: null },
    select: USER_SELECT,
  });

  const matchedUsers = candidateUsers.filter((u) => userMatchesSiteKeys(u, matchKeys));
  const siteUrlLink = String(selected).startsWith("http") ? normalizeSiteForMatch(selected) || selected : selected;

  if (!matchedUsers.length) {
    const fallback = await resolveAdminFallbackAssignee(opts.operatorUser);
    if (!fallback) {
      const err = new Error("No mapped user found for the selected site.");
      err.status = 400;
      throw err;
    }
    return {
      assignee: fallback,
      allApprovers: pickApprovers([], fallback),
      matchedUsers: [],
      siteUrlLink,
      adminFallback: true,
    };
  }

  const assignee =
    matchedUsers.find((u) => u.role === ROLES.APPROVER || u.role === ROLES.USER) || matchedUsers[0];

  if (assignee.role === ROLES.SUPER_ADMIN) {
    const err = new Error("Cannot assign blogs to a Super Admin account.");
    err.status = 400;
    throw err;
  }

  return {
    assignee,
    allApprovers: pickApprovers(matchedUsers, assignee),
    matchedUsers,
    siteUrlLink,
    adminFallback: false,
  };
}

/** Users with a given role mapped to this website project. */
export async function findSiteUsersByRole(siteLink, role = ROLES.USER) {
  const pack = await findAssigneesForSite(siteLink).catch(() => null);
  const want = String(role || ROLES.USER);
  const pool = [...(pack?.matchedUsers || []), ...(pack?.allApprovers || []), pack?.assignee].filter(Boolean);
  const byEmail = new Map();
  for (const u of pool) {
    if (!u?.email || String(u.role) !== want) continue;
    byEmail.set(String(u.email).toLowerCase(), u);
  }
  return [...byEmail.values()];
}

export async function notifyBlogApprovers({ blog, approvers, creator, token, skipped, operatorUser = null }) {
  if (skipped) return { notified: 0, skipped: true };
  const sent = [];
  const failed = [];
  try {
    const { sendBlogApprovalNotification } = await import("./email.js");
    const { collectApprovalEmailRecipients } = await import("./approvalRecipients.js");
    const author = blog?.createdBy || creator || null;

    // Same recipient list as social post approvals — never invent a blog-only audience.
    const { recipients } = await collectApprovalEmailRecipients({
      siteLink: blog.siteLink,
      selectedSite: blog.siteLink,
      creator: author,
      creatorUserId: blog.createdById || creator?.id || null,
      operatorUser,
    });

    // If findAssignees already produced approvers, ensure they are included even if
    // site-equivalent expansion missed them for any reason.
    const byEmail = new Map(recipients.map((r) => [String(r.email).toLowerCase(), r]));
    for (const approver of approvers || []) {
      if (approver?.email && !byEmail.has(String(approver.email).toLowerCase())) {
        byEmail.set(String(approver.email).toLowerCase(), approver);
      }
    }

    for (const recipient of byEmail.values()) {
      try {
        const ok = await sendBlogApprovalNotification(recipient.email, blog, recipient, token, author);
        (ok ? sent : failed).push(recipient.email);
      } catch (err) {
        failed.push(recipient.email);
        console.error(`[blog] approval email to ${recipient.email} failed: ${err.message}`);
      }
    }

    console.log(
      `[blog] approval notifications for "${blog.title}" (${blog.siteLink}): sent=${sent.length} [${sent.join(", ")}]${failed.length ? ` failed=${failed.length} [${failed.join(", ")}]` : ""}`
    );

    if (sent.length) {
      try {
        await prisma.blogPost.update({
          where: { id: blog.id },
          data: { approvalNotifiedAt: new Date() },
        });
      } catch (err) {
        console.error(`[blog] could not record approvalNotifiedAt: ${err.message}`);
      }
    }
  } catch (err) {
    console.error("[blog] approval notification failed:", err.message);
  }
  return { notified: sent.length, failed: failed.length };
}

export function createBlogQuickActionToken(blogId) {
  const secret = process.env.NEXTAUTH_SECRET || "default-secret";
  return crypto.createHmac("sha256", secret).update(`blog:${String(blogId)}`).digest("hex");
}

export function verifyBlogQuickActionToken(blogId, token) {
  const expected = createBlogQuickActionToken(blogId);
  return String(token || "") === expected;
}
