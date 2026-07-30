import { getServerSession } from "next-auth";
import { authOptions } from "../../app/api/auth/[...nextauth]/route";
import {
  hasPermission,
  canAccessResource,
  isSuperAdmin,
  getAccessibleSiteLinks,
  canWrite as rbacCanWrite,
  ROLES,
  PERMISSIONS,
} from "../rbac";
import {
  canAccessSection,
  hasAnyAdminContentPermission,
  resolveModulePermissions,
} from "../modulePermissions";

/**
 * Get the current user session with role information
 * @returns {Promise<Object|null>} Session object or null
 */
export async function getSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  
  const { getUserByEmail } = await import("../auth");
  const user = await getUserByEmail(session.user.email);
  
  if (!user || (user.isActive === false)) {
    return null;
  }

  const resolvedPermissions = resolveModulePermissions(user);
  
  return {
    ...session,
    user: {
      ...session.user,
      role: user.role || ROLES.USER,
      modulePermissions: user.modulePermissions ?? null,
      resolvedPermissions,
      siteLink: user.siteLink || null,
      facebookPageId: user.facebookPageId || null,
      instagramUserId: user.instagramUserId || null,
      accessibleSites: user.accessibleSites || (user.siteLink ? [user.siteLink] : []),
    },
  };
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function requireSectionAccess(sectionId) {
  const session = await requireAuth();
  if (!canAccessSection(session.user, sectionId)) {
    throw new Error("Forbidden: Insufficient permissions");
  }
  return session;
}

export async function requirePermission(permission, sectionId = null) {
  const session = await requireAuth();
  const userRole = session.user.role || ROLES.USER;

  if (isSuperAdmin(userRole)) {
    return session;
  }

  if (sectionId && canAccessSection(session.user, sectionId)) {
    return session;
  }

  if (permission === PERMISSIONS.VIEW_ALL_DATA) {
    if (sectionId) {
      throw new Error("Forbidden: Insufficient permissions");
    }
    if (hasAnyAdminContentPermission(session.user)) {
      return session;
    }
    throw new Error("Forbidden: Insufficient permissions");
  }

  if (hasPermission(userRole, permission)) {
    return session;
  }
  
  throw new Error("Forbidden: Insufficient permissions");
}

export async function requireSuperAdmin() {
  const session = await requireAuth();
  const userRole = session.user.role || ROLES.USER;
  
  if (!isSuperAdmin(userRole)) {
    throw new Error("Forbidden: Super admin access required");
  }
  
  return session;
}

export function canAccess(session, resourceUserId, permission) {
  if (!session?.user) return false;
  return canAccessResource(session.user, resourceUserId, permission);
}

export function getAccessibleSites(session) {
  if (!session?.user) return [];
  return getAccessibleSiteLinks(session.user);
}

export function canWrite(session) {
  if (!session?.user) return false;
  return rbacCanWrite(session.user.role);
}
