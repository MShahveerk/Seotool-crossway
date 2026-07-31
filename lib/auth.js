import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "./db";
import { ROLES, isMultiSiteRole } from "./rbac.js";

function normalizeEmail(email) {
  return String(email || "").toLowerCase().trim();
}

function normalizeAccessibleSites(user) { 
  const linkedSites = (user.accessibleSites || []).map((entry) => entry.siteLink);
  if (linkedSites.length > 0) {
    return linkedSites;
  }
  return user.siteLink ? [user.siteLink] : [];
}

function mapUser(user, { includePassword = true } = {}) {
  if (!user) return null;

  const mapped = {
    id: user.id,
    email: user.email,
    name: user.name || null,
    role: user.role || "user",
    modulePermissions: user.modulePermissions ?? null,
    weeklyDigestEnabled: user.weeklyDigestEnabled === true,
    receiveWebsiteReport: user.receiveWebsiteReport === true,
    receiveSmmReport: user.receiveSmmReport === true,
    receiveCombinedReport: user.receiveCombinedReport === true,
    siteLink: user.siteLink || null,
    gtmContainerId: user.gtmContainerId || null,
    facebookPageId: user.facebookPageId || null,
    instagramUserId: user.instagramUserId || null,
    accessibleSites: normalizeAccessibleSites(user),
    isActive: user.isActive !== false,
    emailVerified: user.emailVerified === true,
    status: user.status || (user.emailVerified ? "active" : "pending"),
    emailVerifiedAt: user.emailVerifiedAt || null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt || null,
    createdBy: user.createdBy || null,
    deletedAt: user.deletedAt || null,
  };

  if (includePassword) {
    mapped.password = user.password;
  }

  return mapped;
}

function mapDatabaseError(error) {
  if (!error) {
    return new Error("Unknown database error");
  }

  if (error.code === "P2002") {
    return new Error("Email already exists");
  }

  if (error.code === "P1000") {
    return new Error("Database authentication failed");
  }

  if (
    error.code === "P1001" ||
    error.code === "P1002" ||
    error.code === "P1017" ||
    error.message?.includes("Can't reach database server") ||
    error.message?.toLowerCase().includes("timeout")
  ) {
    return new Error("Database connection error: Unable to connect to the database");
  }

  if (error.message?.includes("DATABASE_URL")) {
    return new Error("Database configuration error: DATABASE_URL is not properly configured");
  }

  return error;
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password, hashedPassword) {
  return bcrypt.compare(password, hashedPassword);
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function getUserByEmail(email) {
  try {
    const user = await prisma.user.findFirst({
      where: { email: normalizeEmail(email) },
      include: { accessibleSites: true },
    });
    return mapUser(user);
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function getUserById(userId) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { accessibleSites: true },
    });
    return mapUser(user);
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function getAllUsers(includeInactive = false) {
  try {
    const users = await prisma.user.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { createdAt: "desc" },
      include: { accessibleSites: true },
    });

    return users.map((user) => mapUser(user, { includePassword: false }));
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function isFirstUserRegistration() {
  try {
    const count = await prisma.user.count();
    return count === 0;
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function updateUser(userId, updates) {
  try {
    const updateData = { ...updates };
    delete updateData.password;
    delete updateData.accessibleSites;
    delete updateData.id;

    if (Object.keys(updateData).length === 0) {
      return false;
    }

    const result = await prisma.user.updateMany({
      where: { id: userId },
      data: updateData,
    });

    return result.count > 0;
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function deleteUser(userId) {
  try {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!existing) {
      return false;
    }

    const normalizedEmail = normalizeEmail(existing.email);

    await prisma.$transaction(async (tx) => {
      // Remove all user-linked records so the account is fully purged from the system.
      await tx.userAccessibleSite.deleteMany({ where: { userId } });
      await tx.verificationLog.deleteMany({
        where: {
          OR: [{ userId }, { email: normalizedEmail }],
        },
      });
      await tx.passwordResetToken.deleteMany({ where: { email: normalizedEmail } });
      await tx.emailVerificationToken.deleteMany({ where: { email: normalizedEmail } });
      // Explicit deletes so user removal works even if DB FKs predate CASCADE (e.g. manual / older schema).
      await tx.socialMediaDailyStat.deleteMany({ where: { userId } });
      await tx.approval.deleteMany({
        where: {
          OR: [{ assigneeId: userId }, { createdById: userId }],
        },
      });
      await tx.user.delete({ where: { id: userId } });
    });

    return true;
  } catch (error) {
    if (error.code === "P2025") {
      return false;
    }
    throw mapDatabaseError(error);
  }
}

export async function assignSiteLink(userId, siteLink) {
  const trimmed = siteLink ? String(siteLink).trim() : null;
  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (!user) {
        throw new Error("__USER_NOT_FOUND__");
      }

      await tx.user.update({
        where: { id: userId },
        data: { siteLink: trimmed },
      });

      if (!trimmed) {
        if (!isMultiSiteRole(user.role)) {
          await tx.userAccessibleSite.deleteMany({ where: { userId } });
        }
        return;
      }

      if (isMultiSiteRole(user.role)) {
        await tx.userAccessibleSite.upsert({
          where: {
            userId_siteLink: { userId, siteLink: trimmed },
          },
          update: {},
          create: { userId, siteLink: trimmed },
        });
      } else {
        await tx.userAccessibleSite.deleteMany({ where: { userId } });
        await tx.userAccessibleSite.create({
          data: { userId, siteLink: trimmed },
        });
      }
    });

    return true;
  } catch (error) {
    if (error.message === "__USER_NOT_FOUND__") {
      return false;
    }
    if (error.code === "P2025") {
      return false;
    }
    throw mapDatabaseError(error);
  }
}

/** Add one site assignment without removing existing multi-site access. */
export async function addAccessibleSite(userId, siteLink) {
  const normalized = String(siteLink || "").trim();
  if (!normalized) return false;

  try {
    await prisma.userAccessibleSite.upsert({
      where: {
        userId_siteLink: { userId, siteLink: normalized },
      },
      update: {},
      create: { userId, siteLink: normalized },
    });
    return true;
  } catch (error) {
    if (error.code === "P2025") {
      return false;
    }
    throw mapDatabaseError(error);
  }
}

/**
 * After GSC/site integration — single-site users replace assignments;
 * multi-site roles (SMM/viewer/approver) only add the new site.
 */
export async function syncSiteAssignmentForIntegration(userId, siteLink, role) {
  const normalized = String(siteLink || "").trim();
  if (!normalized) return false;

  let userRole = role;
  if (!userRole) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) return false;
    userRole = user.role;
  }

  if (isMultiSiteRole(userRole)) {
    return addAccessibleSite(userId, normalized);
  }

  await assignSiteLink(userId, normalized);
  return assignAccessibleSites(userId, [normalized]);
}

export async function assignAccessibleSites(userId, siteLinks) {
  try {
    const normalized = Array.from(
      new Set(
        (Array.isArray(siteLinks) ? siteLinks : [siteLinks])
          .filter(Boolean)
          .map((value) => String(value).trim())
      )
    );

    await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!existingUser) {
        throw new Error("__USER_NOT_FOUND__");
      }

      await tx.userAccessibleSite.deleteMany({
        where: { userId },
      });

      if (normalized.length > 0) {
        await tx.userAccessibleSite.createMany({
          data: normalized.map((siteLink) => ({ userId, siteLink })),
          skipDuplicates: true,
        });
      }
    });

    return true;
  } catch (error) {
    if (error.message === "__USER_NOT_FOUND__") {
      return false;
    }
    if (error.code === "P2025") {
      return false;
    }
    throw mapDatabaseError(error);
  }
}

export async function createUser(email, password, name, role = "user", siteLink = null, createdBy = null, options = {}) {
  const {
    skipVerification = false,
    gtmContainerId = null,
    facebookPageId = null,
    instagramUserId = null,
    isActive: explicitIsActive = undefined,
    modulePermissions = null,
    weeklyDigestEnabled = undefined,
    receiveWebsiteReport = undefined,
    receiveSmmReport = undefined,
    receiveCombinedReport = undefined,
  } = options;
  const normalizedEmail = normalizeEmail(email);

  const isActive =
    explicitIsActive !== undefined
      ? Boolean(explicitIsActive)
      : skipVerification
        ? true
        : false;

  try {
    const { getDefaultReportPreferencesForRole } = await import("./reports/reportPreferences.js");
    const reportDefaults = getDefaultReportPreferencesForRole(role || "user");

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password,
        name: name || null,
        role: role || "user",
        siteLink: siteLink || null,
        gtmContainerId: gtmContainerId ? String(gtmContainerId).trim() : null,
        facebookPageId: facebookPageId ? String(facebookPageId).trim() : null,
        instagramUserId: instagramUserId ? String(instagramUserId).trim() : null,
        createdBy: createdBy || null,
        isActive,
        emailVerified: skipVerification ? true : false,
        emailVerifiedAt: skipVerification ? new Date() : null,
        status: skipVerification ? "active" : "pending",
        modulePermissions: modulePermissions || undefined,
        weeklyDigestEnabled:
          weeklyDigestEnabled !== undefined
            ? Boolean(weeklyDigestEnabled)
            : reportDefaults.weeklyDigestEnabled,
        receiveWebsiteReport:
          receiveWebsiteReport !== undefined
            ? Boolean(receiveWebsiteReport)
            : reportDefaults.receiveWebsiteReport,
        receiveSmmReport:
          receiveSmmReport !== undefined ? Boolean(receiveSmmReport) : reportDefaults.receiveSmmReport,
        receiveCombinedReport:
          receiveCombinedReport !== undefined
            ? Boolean(receiveCombinedReport)
            : reportDefaults.receiveCombinedReport,
        accessibleSites: siteLink
          ? {
              create: [{ siteLink }],
            }
          : undefined,
      },
      include: { accessibleSites: true },
    });

    const mapped = mapUser(user);
    return {
      id: mapped.id,
      email: mapped.email,
      name: mapped.name,
      role: mapped.role,
      siteLink: mapped.siteLink,
      gtmContainerId: mapped.gtmContainerId,
      facebookPageId: mapped.facebookPageId,
      instagramUserId: mapped.instagramUserId,
      emailVerified: mapped.emailVerified,
      status: mapped.status,
    };
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function createPasswordResetToken(email, token, expiresAt) {
  try {
    await prisma.passwordResetToken.create({
      data: {
        email: normalizeEmail(email),
        token,
        expiresAt: new Date(expiresAt),
        used: false,
      },
    });
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function getPasswordResetToken(token) {
  try {
    return await prisma.passwordResetToken.findFirst({
      where: {
        token,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function markTokenAsUsed(token) {
  try {
    await prisma.passwordResetToken.updateMany({
      where: {
        token,
        used: false,
      },
      data: {
        used: true,
        usedAt: new Date(),
      },
    });
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function updateUserPassword(email, newPassword) {
  try {
    await prisma.user.updateMany({
      where: { email: normalizeEmail(email) },
      data: { password: newPassword },
    });
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function createEmailVerificationToken(email, hashedToken, expiresAt) {
  const normalizedEmail = normalizeEmail(email);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.updateMany({
        where: { email: normalizedEmail, used: false },
        data: { used: true, invalidatedAt: new Date() },
      });

      await tx.emailVerificationToken.create({
        data: {
          email: normalizedEmail,
          token: hashedToken,
          expiresAt: new Date(expiresAt),
          used: false,
        },
      });
    });
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function getEmailVerificationToken(hashedToken) {
  try {
    return await prisma.emailVerificationToken.findFirst({
      where: {
        token: hashedToken,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function getEmailVerificationTokenRecord(hashedToken) {
  try {
    return await prisma.emailVerificationToken.findUnique({
      where: { token: hashedToken },
    });
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function markVerificationTokenAsUsed(hashedToken) {
  try {
    await prisma.emailVerificationToken.updateMany({
      where: {
        token: hashedToken,
        used: false,
      },
      data: {
        used: true,
        usedAt: new Date(),
      },
    });
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function verifyUserEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  try {
    const result = await prisma.user.updateMany({
      where: { email: normalizedEmail },
      data: {
        emailVerified: true,
        status: "active",
        isActive: true,
        emailVerifiedAt: new Date(),
      },
    });

    if (result.count === 0) {
      return null;
    }

    return getUserByEmail(normalizedEmail);
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function logVerificationAttempt(logEntry) {
  try {
    await prisma.verificationLog.create({
      data: {
        token: logEntry.token || null,
        email: normalizeEmail(logEntry.email || "unknown"),
        userId: logEntry.userId || null,
        success: Boolean(logEntry.success),
        reason: logEntry.reason || null,
        ip: logEntry.ip || null,
      },
    });
  } catch (error) {
    console.error("Failed to log verification attempt:", error.message);
  }
}

export async function getSuperAdmins() {
  try {
    return await prisma.user.findMany({
      where: {
        role: "super_admin",
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function cleanupExpiredPendingUsers(days = 7) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await prisma.user.deleteMany({
      where: {
        status: "pending",
        emailVerified: false,
        createdAt: { lt: cutoffDate },
      },
    });

    return result.count;
  } catch (error) {
    throw mapDatabaseError(error);
  }
}
