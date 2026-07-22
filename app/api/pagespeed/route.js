import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { getPageSpeedReport } from "../../../lib/pagespeed";
import { ROLES, hasPermission, PERMISSIONS } from "../../../lib/rbac";
import { isValidUrl, normalizeSiteOrigin } from "../../../lib/validation";
import prisma from "../../../lib/prisma";
import { resolveSiteEquivalents, sessionCanAccessSiteAsync } from "../../../lib/siteAccess";

export const runtime = "nodejs";

async function resolveWebsiteUrl(req, session) {
  const userRole = session.user.role || ROLES.USER;
  const sessionSiteFallback =
    session.user.siteLink ||
    (Array.isArray(session.user.accessibleSites) && session.user.accessibleSites.length
      ? session.user.accessibleSites[0]
      : null);

  let siteUrl = req.nextUrl.searchParams.get("url") || sessionSiteFallback;
  const requestedSiteKey = siteUrl;

  if (siteUrl && !isValidUrl(siteUrl)) {
    const mappedSite = await prisma.site.findFirst({
      where: {
        OR: [{ facebookPageId: siteUrl }, { instagramUserId: siteUrl }],
      },
      select: { siteUrl: true },
    });

    if (mappedSite?.siteUrl) {
      siteUrl = mappedSite.siteUrl;
    } else {
      const mappedUser = await prisma.user.findFirst({
        where: {
          OR: [{ facebookPageId: siteUrl }, { instagramUserId: siteUrl }],
        },
        select: { siteLink: true },
      });
      if (mappedUser?.siteLink) {
        siteUrl = mappedUser.siteLink;
      }
    }
  }

  if (userRole === ROLES.SUPER_ADMIN || userRole === ROLES.SMM) {
    if (!siteUrl || !isValidUrl(siteUrl)) {
      if (sessionSiteFallback && isValidUrl(sessionSiteFallback)) {
        siteUrl = sessionSiteFallback;
      } else {
        const err = new Error(
          userRole === ROLES.SMM
            ? "No website URL is linked to this client account. PageSpeed needs a website URL."
            : "Please select a website from the client dropdown (PageSpeed requires a valid URL)."
        );
        err.status = 400;
        throw err;
      }
    }
  } else if (!siteUrl || !isValidUrl(siteUrl)) {
    const err = new Error("No website URL linked to your account. Please contact an administrator.");
    err.status = 403;
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
      const err = new Error("Access denied. You can only view PageSpeed data for sites assigned to your account.");
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

  return { siteUrl: normalizedUrl, requestedSiteKey };
}

/**
 * GET /api/pagespeed?url=
 * Returns PageSpeed Insights data for the selected website.
 */
export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized. Please log in." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userRole = session.user.role || ROLES.USER;
    if (!hasPermission(userRole, PERMISSIONS.ACCESS_PAGESPEED)) {
      return new Response(JSON.stringify({ error: "Access denied. Insufficient permissions." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { siteUrl } = await resolveWebsiteUrl(req, session);
    const pagespeed = await getPageSpeedReport(siteUrl);

    return new Response(
      JSON.stringify({
        siteUrl,
        strategy: "mobile",
        pagespeed,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
      }
    );
  } catch (error) {
    const status = error.status || 500;
    const message = error.message || "Failed to fetch PageSpeed data.";
    if (status >= 500 && process.env.NODE_ENV === "development") {
      console.error("PageSpeed API error:", error);
    }
    return new Response(
      JSON.stringify({
        error: message,
        details: status >= 500 && process.env.NODE_ENV === "development" ? message : undefined,
      }),
      {
        status,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
