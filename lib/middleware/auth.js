import { getServerSession } from "next-auth";
import { authOptions } from "../../app/api/auth/[...nextauth]/route";
import { hasPermission, canAccessResource, isSuperAdmin, isViewer, getAccessibleSiteLinks, canWrite as rbacCanWrite, ROLES } from "../rbac";

/**
 * Get the current user session with role information
 * @returns {Promise<Object|null>} Session object or null
 */
export async function getSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  
  // Fetch full user data including role
  const { getUserByEmail } = await import("../auth");
  const user = await getUserByEmail(session.user.email);
  
  if (!user || (user.isActive === false)) {
    return null;
  }
  
  return {
    ...session,
    user: {
      ...session.user,
      role: user.role || ROLES.USER,
      siteLink: user.siteLink || null,
      facebookPageId: user.facebookPageId || null,
      instagramUserId: user.instagramUserId || null,
      accessibleSites: user.accessibleSites || (user.siteLink ? [user.siteLink] : []),
    },
  };
}

/**
 * Require authentication middleware
 * @returns {Promise<Object>} Session object
 * @throws {Error} If not authenticated
 */
export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}

/**
 * Require specific permission middleware
 * @param {string} permission - Required permission
 * @returns {Promise<Object>} Session object
 * @throws {Error} If not authorized
 */
export async function requirePermission(permission) {
  const session = await requireAuth();
  const userRole = session.user.role || ROLES.USER;
  
  if (!hasPermission(userRole, permission)) {
    throw new Error("Forbidden: Insufficient permissions");
  }
  
  return session;
}

/**
 * Require super admin role
 * @returns {Promise<Object>} Session object
 * @throws {Error} If not super admin
 */
export async function requireSuperAdmin() {
  const session = await requireAuth();
  const userRole = session.user.role || ROLES.USER;
  
  if (!isSuperAdmin(userRole)) {
    throw new Error("Forbidden: Super admin access required");
  }
  
  return session;
}

/**
 * Check if user can access a resource
 * @param {Object} session - User session
 * @param {string} resourceUserId - Resource owner's user ID
 * @param {string} permission - Required permission
 * @returns {boolean} True if can access
 */
export function canAccess(session, resourceUserId, permission) {
  if (!session?.user) return false;
  return canAccessResource(session.user, resourceUserId, permission);
}

/**
 * Get user's accessible site links
 * @param {Object} session - User session
 * @returns {Array<string>} Array of site links
 */
export function getAccessibleSites(session) {
  if (!session?.user) return [];
  return getAccessibleSiteLinks(session.user);
}

/**
 * Check if user can write (not read-only)
 * @param {Object} session - User session
 * @returns {boolean} True if can write
 */
export function canWrite(session) {
  if (!session?.user) return false;
  return rbacCanWrite(session.user.role);
}

