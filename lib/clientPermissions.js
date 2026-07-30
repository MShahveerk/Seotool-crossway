import { canAccessSection, hasGlobalSiteAccess, resolveModulePermissions } from "./modulePermissions";

export function sessionCanAccessSection(session, sectionId) {
  if (!session?.user) return false;
  return canAccessSection(session.user, sectionId);
}

export function sessionHasGlobalSiteAccess(session) {
  if (!session?.user) return false;
  return hasGlobalSiteAccess(session.user);
}

export function getSessionResolvedPermissions(session) {
  if (!session?.user) return null;
  if (session.user.resolvedPermissions) return session.user.resolvedPermissions;
  return resolveModulePermissions(session.user);
}
