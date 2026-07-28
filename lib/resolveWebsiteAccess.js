/**
 * Shared auth + website URL resolution + RBAC for site-level tool API routes
 * (Site Audit, Domain Authority, …). Resolves Meta page IDs to linked websites
 * and enforces per-role site access.
 */
import { getServerSession } from "next-auth";
import { authOptions } from "../app/api/auth/[...nextauth]/route";
import { ROLES } from "./rbac";
import { isValidUrl, normalizeSiteOrigin } from "./validation";
import prisma from "./prisma";
import { resolveSiteEquivalents, sessionCanAccessSiteAsync } from "./siteAccess";

/**
 * @returns {{ session, siteUrl: string }} normalized website origin
 * @throws error with .status when unauthorized / invalid
 */
export async function resolveWebsiteAccess(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    const err = new Error("Unauthorized. Please log in.");
    err.status = 401;
    throw err;
  }

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

/** Auth-only gate for tools that do not require a selected client website (e.g. SE Ranking Site Explorer). */
export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    const err = new Error("Unauthorized. Please log in.");
    err.status = 401;
    throw err;
  }
  return { session };
}
