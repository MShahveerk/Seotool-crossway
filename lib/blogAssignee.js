/**
 * Resolve assignees for a site (same matching rules as social approvals).
 */
import crypto from "crypto";
import prisma from "./prisma.js";
import { ROLES } from "./rbac.js";
import { normalizeSiteForMatch } from "./blogPayload.js";

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
  if (!allApprovers.length && assignee && assignee.role !== ROLES.SUPER_ADMIN) {
    allApprovers.push(assignee);
  }
  return allApprovers;
}

/**
 * @param {string} selectedSite
 * @param {{ operatorUser?: { id?: string, role?: string } }} [opts]
 */
export async function findAssigneesForSite(selectedSite, opts = {}) {
  const normalizedSelectedSite = normalizeSiteForMatch(selectedSite);
  const candidateUsers = await prisma.user.findMany({
    where: { role: { not: ROLES.SUPER_ADMIN }, isActive: true, deletedAt: null },
    select: USER_SELECT,
  });

  const matchedUsers = candidateUsers.filter((u) => {
    const matchPrimarySite = u.siteLink && normalizeSiteForMatch(u.siteLink) === normalizedSelectedSite;
    const matchPrimaryFb = u.facebookPageId && String(u.facebookPageId).trim() === String(selectedSite).trim();
    const matchPrimaryIg = u.instagramUserId && String(u.instagramUserId).trim() === String(selectedSite).trim();
    const matchAccessible = (u.accessibleSites || []).some((entry) => {
      if (!entry.siteLink) return false;
      const entryVal = String(entry.siteLink).trim();
      const selectedVal = String(selectedSite).trim();
      return entryVal === selectedVal || normalizeSiteForMatch(entry.siteLink) === normalizedSelectedSite;
    });
    return matchPrimarySite || matchPrimaryFb || matchPrimaryIg || matchAccessible;
  });

  const siteUrlLink = String(selectedSite).startsWith("http") ? normalizeSiteForMatch(selectedSite) : selectedSite;

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
    siteUrlLink,
    adminFallback: false,
  };
}

export async function notifyBlogApprovers({ blog, approvers, creator, token, skipped }) {
  if (skipped) return;
  try {
    const { sendBlogApprovalNotification } = await import("./email.js");
    const author = blog?.createdBy || creator || null;
    const notified = new Set();
    for (const approver of approvers) {
      if (approver.email && !notified.has(approver.email)) {
        await sendBlogApprovalNotification(approver.email, blog, approver, token, author);
        notified.add(approver.email);
      }
    }
    const superAdmins = await prisma.user.findMany({
      where: { role: ROLES.SUPER_ADMIN, isActive: true },
      select: { email: true, name: true },
    });
    for (const admin of superAdmins) {
      if (admin.email && !notified.has(admin.email)) {
        await sendBlogApprovalNotification(admin.email, blog, admin, token, author);
        notified.add(admin.email);
      }
    }
    if (creator?.email && !notified.has(creator.email)) {
      await sendBlogApprovalNotification(creator.email, blog, creator, token, author);
      notified.add(creator.email);
    }

    // Copy relevant SMMs — same audience as social post approvals.
    const normSelected = normalizeSiteForMatch(blog.siteLink || "");
    const rawSelected = String(blog.siteLink || "").toLowerCase().trim();
    const smms = await prisma.user.findMany({
      where: { role: ROLES.SMM, isActive: true },
      select: {
        id: true,
        email: true,
        name: true,
        siteLink: true,
        facebookPageId: true,
        instagramUserId: true,
        accessibleSites: { select: { siteLink: true } },
      },
    });
    for (const smm of smms) {
      const isCreator = smm.id === blog.createdById;
      const primary = smm.siteLink ? normalizeSiteForMatch(smm.siteLink) : "";
      const isSiteMatch =
        (primary && primary === normSelected) ||
        (smm.accessibleSites || []).some(
          (entry) => entry.siteLink && normalizeSiteForMatch(entry.siteLink) === normSelected
        );
      const isMetaMatch =
        (smm.facebookPageId && String(smm.facebookPageId).toLowerCase().trim() === rawSelected) ||
        (smm.instagramUserId && String(smm.instagramUserId).toLowerCase().trim() === rawSelected);
      if ((isCreator || isSiteMatch || isMetaMatch) && smm.email && !notified.has(smm.email)) {
        await sendBlogApprovalNotification(smm.email, blog, smm, token, author);
        notified.add(smm.email);
      }
    }
  } catch (err) {
    console.error("[blog] approval notification failed:", err.message);
  }
}

export function createBlogQuickActionToken(blogId) {
  const secret = process.env.NEXTAUTH_SECRET || "default-secret";
  return crypto.createHmac("sha256", secret).update(`blog:${String(blogId)}`).digest("hex");
}

export function verifyBlogQuickActionToken(blogId, token) {
  const expected = createBlogQuickActionToken(blogId);
  return String(token || "") === expected;
}
