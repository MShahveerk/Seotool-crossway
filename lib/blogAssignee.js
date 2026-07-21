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
  if (skipped) return { notified: 0, skipped: true };
  const sent = [];
  const failed = [];
  try {
    const { sendBlogApprovalNotification } = await import("./email.js");
    const author = blog?.createdBy || creator || null;
    const notified = new Set();

    const deliver = async (email, recipient) => {
      if (!email || notified.has(email)) return;
      notified.add(email);
      try {
        const ok = await sendBlogApprovalNotification(email, blog, recipient, token, author);
        (ok ? sent : failed).push(email);
      } catch (err) {
        failed.push(email);
        console.error(`[blog] approval email to ${email} failed: ${err.message}`);
      }
    };

    // 1. Approvers/users mapped to this site
    for (const approver of approvers) {
      await deliver(approver.email, approver);
    }

    // 2. All active super admins
    const superAdmins = await prisma.user.findMany({
      where: { role: ROLES.SUPER_ADMIN, isActive: true },
      select: { email: true, name: true },
    });
    for (const admin of superAdmins) {
      await deliver(admin.email, admin);
    }

    // 3. Creator
    if (creator?.email) {
      await deliver(creator.email, creator);
    }

    // 4. SMMs mapped to this site — same audience as social post approvals.
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
      if (isCreator || isSiteMatch || isMetaMatch) {
        await deliver(smm.email, smm);
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
        // Column may not exist until the migration runs — emails were still sent.
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
