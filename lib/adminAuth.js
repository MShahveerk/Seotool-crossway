import { getServerSession } from "next-auth";
import { authOptions } from "../app/api/auth/[...nextauth]/route";
import { sectionForApiPath, hasGlobalSiteAccess, canAccessSection } from "./modulePermissions";
import { requireSectionAccess, requireAuth } from "./middleware/auth";

function resolvePathname(req) {
  if (req?.nextUrl?.pathname) return req.nextUrl.pathname;
  if (typeof req?.url === "string" && req.url) {
    try {
      return new URL(req.url).pathname;
    } catch {
      return "";
    }
  }
  return "";
}

/**
 * Granular section gate (studios, boards, approvals, etc.) — not super-admin-only.
 */
export async function requireSectionRoute(sectionId) {
  if (!sectionId) {
    throw new Error("Forbidden: section permission required");
  }
  return requireSectionAccess(sectionId);
}

/**
 * Content APIs under /api/admin/* — gated by granular module permissions, not super admin.
 */
export async function requireContentRoute(req, explicitSectionId = null) {
  const pathname = resolvePathname(req);
  const sectionId = explicitSectionId || sectionForApiPath(pathname);
  if (sectionId) {
    return requireSectionAccess(sectionId);
  }
  throw new Error("Forbidden: Insufficient permissions");
}

/** @deprecated Use requireContentRoute — kept for existing route imports. */
export const requireAdminRoute = requireContentRoute;

/** Allow if the user can access any of the given section IDs. */
export async function requireAnySectionRoute(sectionIds = []) {
  const session = await requireAuth();
  const ids = (Array.isArray(sectionIds) ? sectionIds : [sectionIds]).filter(Boolean);
  for (const sectionId of ids) {
    if (canAccessSection(session.user, sectionId)) {
      return session;
    }
  }
  throw new Error("Forbidden: Insufficient permissions");
}

/** Autoschedule APIs: blog vs post granular sections. */
export function autoscheduleSectionForKind(kind) {
  const k = String(kind || "").trim().toLowerCase();
  return k === "blog" ? "blog-autoschedule" : "post-autoschedule";
}

export async function requireAutoscheduleRoute(req) {
  const url = new URL(req.url);
  const sectionId = autoscheduleSectionForKind(url.searchParams.get("kind"));
  return requireContentRoute(req, sectionId);
}

/** Site picker / Meta accounts / multi-client integrations list. */
export async function requireGlobalSiteAccess() {
  // Prefer DB-backed session; fall back to JWT session if user lookup flakes.
  let session;
  try {
    session = await requireAuth();
  } catch (err) {
    if (String(err?.message || "") !== "Unauthorized") throw err;
    session = await getServerSession(authOptions);
    if (!session?.user?.id) throw new Error("Unauthorized");
  }
  if (hasGlobalSiteAccess(session.user)) {
    return session;
  }
  throw new Error("Forbidden: Insufficient permissions");
}
