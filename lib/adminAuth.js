import { PERMISSIONS } from "./rbac";
import { sectionForApiPath, hasGlobalSiteAccess } from "./modulePermissions";
import { requirePermission, requireSectionAccess, requireAuth } from "./middleware/auth";

/**
 * Enforce granular section access for /api/admin/* content routes.
 * Falls back to legacy VIEW_ALL_DATA check when path is unmapped.
 */
export async function requireAdminRoute(req) {
  const pathname = req?.nextUrl?.pathname || "";
  const sectionId = sectionForApiPath(pathname);
  if (sectionId) {
    return requireSectionAccess(sectionId);
  }
  return requirePermission(PERMISSIONS.VIEW_ALL_DATA);
}

/** Site picker / multi-client integrations list (super admin or admin content roles). */
export async function requireGlobalSiteAccess() {
  const session = await requireAuth();
  if (hasGlobalSiteAccess(session.user)) {
    return session;
  }
  throw new Error("Forbidden: Insufficient permissions");
}
