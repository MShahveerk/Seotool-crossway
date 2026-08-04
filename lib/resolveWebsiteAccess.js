/**
 * Shared auth + website URL resolution + RBAC for site-level tool API routes
 * (Site Audit, Domain Authority, …). Resolves Meta page IDs to linked websites
 * and enforces per-role site access + module section permissions.
 */
import { getServerSession } from "next-auth";
import { authOptions } from "../app/api/auth/[...nextauth]/route";
import { ROLES } from "./rbac";
import {
  assertAnySectionAccess,
  assertSectionAccess,
  allSeoSectionIds,
  canAccessSection,
  sectionForApiPath,
} from "./modulePermissions";
import { isValidUrl, normalizeSiteOrigin } from "./validation";
import prisma from "./prisma";
import { resolveSiteEquivalents, sessionCanAccessSiteAsync } from "./siteAccess";

function unauthorized(message = "Unauthorized. Please log in.") {
  const err = new Error(message);
  err.status = 401;
  return err;
}

/**
 * @param {Request} req
 * @param {{ section?: string|string[]|null }} [options]
 *   `section` — required module section(s). If omitted, uses API path map,
 *   otherwise falls back to “any SEO section”.
 * @returns {{ session, siteUrl: string }} normalized website origin
 * @throws error with .status when unauthorized / invalid
 */
export async function resolveWebsiteAccess(req, options = {}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw unauthorized();
  }

  const pathname = req?.nextUrl?.pathname || "";
  const mapped = sectionForApiPath(pathname);
  // `section: null` = any SEO grant (shared shells). Omitted = path map, else any SEO.
  let requested;
  if (options.section === null) {
    requested = allSeoSectionIds();
  } else if (options.section !== undefined) {
    requested = options.section;
  } else {
    requested = mapped || allSeoSectionIds();
  }

  const ids = Array.isArray(requested) ? requested : [requested];
  assertAnySectionAccess(session.user, ids);

  const userRole = session.user.role || ROLES.USER;
  const sessionSiteFallback =
    session.user.siteLink ||
    (Array.isArray(session.user.accessibleSites) && session.user.accessibleSites.length
      ? session.user.accessibleSites[0]
      : null);

  let siteUrl = req.nextUrl.searchParams.get("url") || sessionSiteFallback;
  const requestedSiteKey = siteUrl;

  // Meta page ID → linked website
  if (siteUrl && !isValidUrl(siteUrl)) {
    const mappedSite = await prisma.site.findFirst({
      where: { OR: [{ facebookPageId: siteUrl }, { instagramUserId: siteUrl }] },
      select: { siteUrl: true },
    });
    if (mappedSite?.siteUrl) {
      siteUrl = mappedSite.siteUrl;
    } else {
      const mappedUser = await prisma.user.findFirst({
        where: { OR: [{ facebookPageId: siteUrl }, { instagramUserId: siteUrl }] },
        select: { siteLink: true },
      });
      if (mappedUser?.siteLink) siteUrl = mappedUser.siteLink;
    }
  }

  if (!siteUrl || !isValidUrl(siteUrl)) {
    const err = new Error(
      "A website URL is required for this tool. Select a website (not a Meta-only page) from the client dropdown."
    );
    err.status = 400;
    throw err;
  }

  const normalizedUrl = normalizeSiteOrigin(siteUrl);
  if (!normalizedUrl) {
    const err = new Error("Invalid URL format.");
    err.status = 400;
    throw err;
  }

  if (userRole === ROLES.VIEWER || userRole === ROLES.SMM) {
    const equivalents = await resolveSiteEquivalents(prisma, requestedSiteKey || normalizedUrl);
    if (!equivalents.includes(normalizedUrl)) equivalents.push(normalizedUrl);
    if (requestedSiteKey) equivalents.push(String(requestedSiteKey).trim());
    if (!(await sessionCanAccessSiteAsync(prisma, session.user, equivalents))) {
      const err = new Error("Access denied. You can only view data for sites assigned to your account.");
      err.status = 403;
      throw err;
    }
  }

  if (userRole === ROLES.USER) {
    const own = normalizeSiteOrigin(session.user.siteLink || "");
    if (!own || own !== normalizedUrl) {
      const err = new Error("Access denied. You can only query your own website URL.");
      err.status = 403;
      throw err;
    }
  }

  return { session, siteUrl: normalizedUrl };
}

/**
 * Auth gate for tools that do not require a selected client website.
 * @param {{ section?: string|string[]|null, anySeo?: boolean }} [options]
 *   Pass `section` / `anySeo` to enforce module permissions. Omit both for auth-only.
 */
export async function requireSession(options = {}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw unauthorized();
  }

  if (options.anySeo) {
    assertAnySectionAccess(session.user, allSeoSectionIds());
  } else if (options.section) {
    const ids = Array.isArray(options.section) ? options.section : [options.section];
    assertAnySectionAccess(session.user, ids);
  }

  return { session };
}

/** Convenience: require a specific section on an authenticated session. */
export function requireUserSection(session, sectionId) {
  assertSectionAccess(session?.user, sectionId);
  return session;
}

export function userHasSection(session, sectionId) {
  return canAccessSection(session?.user, sectionId);
}
