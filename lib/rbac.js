/**
 * Role-Based Access Control (RBAC) System
 * 
 * Roles:
 * - super_admin: Full control over the platform
 * - user: Regular user with their own site data
 * - viewer: Read-only access to assigned data
 */

export const ROLES = {
  SUPER_ADMIN: "super_admin",
  USER: "user",
  VIEWER: "viewer",
  /** Social media manager: SMM Statistics shows charts only; approval cards are hidden there. */
  SMM: "smm",
  APPROVER: "approver",
};

export const PERMISSIONS = {
  // User management
  MANAGE_USERS: "manage_users",
  CREATE_USERS: "create_users",
  VIEW_ALL_USERS: "view_all_users",
  EDIT_USERS: "edit_users",
  DELETE_USERS: "delete_users",
  
  // Data access
  VIEW_OWN_DATA: "view_own_data",
  VIEW_ALL_DATA: "view_all_data",
  EDIT_OWN_DATA: "edit_own_data",
  EDIT_ALL_DATA: "edit_all_data",
  DELETE_OWN_DATA: "delete_own_data",
  DELETE_ALL_DATA: "delete_all_data",
  
  // Site management
  MANAGE_SITE_LINKS: "manage_site_links",
  ASSIGN_SITE_LINKS: "assign_site_links",
  
  // Feature access
  ACCESS_PAGESPEED: "access_pagespeed",
  ACCESS_SEARCH_CONSOLE: "access_search_console",
  ACCESS_ADMIN_PANEL: "access_admin_panel",
};

// Role to permissions mapping
const ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: [
    // Full access to everything
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.CREATE_USERS,
    PERMISSIONS.VIEW_ALL_USERS,
    PERMISSIONS.EDIT_USERS,
    PERMISSIONS.DELETE_USERS,
    PERMISSIONS.VIEW_OWN_DATA,
    PERMISSIONS.VIEW_ALL_DATA,
    PERMISSIONS.EDIT_OWN_DATA,
    PERMISSIONS.EDIT_ALL_DATA,
    PERMISSIONS.DELETE_OWN_DATA,
    PERMISSIONS.DELETE_ALL_DATA,
    PERMISSIONS.MANAGE_SITE_LINKS,
    PERMISSIONS.ASSIGN_SITE_LINKS,
    PERMISSIONS.ACCESS_PAGESPEED,
    PERMISSIONS.ACCESS_SEARCH_CONSOLE,
    PERMISSIONS.ACCESS_ADMIN_PANEL,
  ],
  [ROLES.USER]: [
    // Regular user with their own data
    PERMISSIONS.VIEW_OWN_DATA,
    PERMISSIONS.EDIT_OWN_DATA,
    PERMISSIONS.DELETE_OWN_DATA,
    PERMISSIONS.ACCESS_PAGESPEED,
    PERMISSIONS.ACCESS_SEARCH_CONSOLE,
  ],
  [ROLES.VIEWER]: [
    // Read-only access
    PERMISSIONS.VIEW_OWN_DATA,
    PERMISSIONS.ACCESS_PAGESPEED,
    PERMISSIONS.ACCESS_SEARCH_CONSOLE,
  ],
  [ROLES.SMM]: [
    PERMISSIONS.VIEW_OWN_DATA,
    PERMISSIONS.VIEW_ALL_DATA,
    PERMISSIONS.ACCESS_PAGESPEED,
    PERMISSIONS.ACCESS_SEARCH_CONSOLE,
  ],
  [ROLES.APPROVER]: [
    PERMISSIONS.VIEW_OWN_DATA,
  ],
};

/**
 * Get permissions for a role
 * @param {string} role - The user role
 * @returns {Array<string>} Array of permission strings
 */
export function getPermissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Check if a user has a specific permission
 * @param {string} role - The user role
 * @param {string} permission - The permission to check
 * @returns {boolean} True if user has permission
 */
export function hasPermission(role, permission) {
  if (!role) return false;
  const permissions = getPermissionsForRole(role);
  return permissions.includes(permission);
}

/**
 * Check if a user can access a resource
 * @param {Object} user - User object with id and role
 * @param {string} resourceUserId - The user ID who owns the resource
 * @param {string} permission - The permission to check
 * @returns {boolean} True if user can access the resource
 */
export function canAccessResource(user, resourceUserId, permission) {
  if (!user || !user.role) return false;
  
  // Super admin can access everything
  if (user.role === ROLES.SUPER_ADMIN) {
    return hasPermission(user.role, permission);
  }
  
  // Users can access their own resources
  if (user.id === resourceUserId) {
    return hasPermission(user.role, permission);
  }
  
  // Viewers can view assigned data (handled separately via site links)
  if (user.role === ROLES.VIEWER || user.role === ROLES.SMM || user.role === ROLES.APPROVER) {
    return hasPermission(user.role, permission);
  }
  
  return false;
}

/**
 * Check if user can perform write operations
 * @param {string} role - The user role
 * @returns {boolean} True if user can write
 */
export function canWrite(role) {
  if (!role) return false;
  return role === ROLES.SUPER_ADMIN || role === ROLES.USER;
}

/**
 * Social / SMM-focused roles that use the classic Post/Reels chart in SMM Statistics
 * (approval cards are hidden for them on that page).
 */
export function isSmmRole(role) {
  const r = String(role || "").toLowerCase();
  return r === ROLES.SMM || r === "social_media_manager";
}

/**
 * Check if user is super admin
 * @param {string} role - The user role
 * @returns {boolean} True if super admin
 */
export function isSuperAdmin(role) {
  return role === ROLES.SUPER_ADMIN;
}

/**
 * Check if user is viewer (read-only)
 * @param {string} role - The user role
 * @returns {boolean} True if viewer
 */
export function isViewer(role) {
  return role === ROLES.VIEWER;
}

/** Roles that access multiple clients via UserAccessibleSite rows. */
export function isMultiSiteRole(role) {
  return role === ROLES.VIEWER || role === ROLES.SMM || role === ROLES.APPROVER;
}

/**
 * Get user's accessible site links
 * For regular users, returns their own site link
 * For super admins, returns all site links
 * For viewers, returns assigned site links
 * @param {Object} user - User object
 * @returns {Array<string>} Array of site links
 */
export function getAccessibleSiteLinks(user) {
  if (!user) return [];
  
  // Super admin can access all sites
  if (user.role === ROLES.SUPER_ADMIN) {
    return user.accessibleSites || [];
  }
  
  // Regular users can only access their own site
  if (user.role === ROLES.USER) {
    return user.siteLink ? [user.siteLink] : [];
  }
  
  // Viewers can access assigned sites
  if (user.role === ROLES.VIEWER || user.role === ROLES.SMM || user.role === ROLES.APPROVER) {
    return user.accessibleSites || [];
  }
  
  return [];
}

