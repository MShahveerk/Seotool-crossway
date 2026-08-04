/**
 * Shared auth + site URL resolution for Search Console API routes.
 */
import { getServerSession } from "next-auth";
import { authOptions } from "../app/api/auth/[...nextauth]/route";
import { ROLES } from "./rbac";
import { canAccessSection } from "./modulePermissions";
import { isValidUrl, normalizeSiteOrigin } from "./validation";
import prisma from "./prisma";
import { resolveSiteEquivalents, sessionCanAccessSiteAsync, isMetaPageId } from "./siteAccess";
import {
  getDateRangeForPresetId,
  isValidYMD,
  inclusiveDayCountYMD,
  clampSearchConsoleQueryRange,
} from "./searchConsoleDateRanges";

const MAX_SPAN_DAYS = 500;
const PRESET_RANGE_IDS = new Set(["7d", "28d", "3m", "6m", "12m", "16m"]);

export function resolveGscDateRange(rangeParam, startDateQ, endDateQ) {
  const r = String(rangeParam || "").trim();
  if (PRESET_RANGE_IDS.has(r)) {
    return { ...getDateRangeForPresetId(r), range: r };
  }
  if (isValidYMD(startDateQ) && isValidYMD(endDateQ) && startDateQ <= endDateQ) {
    if (inclusiveDayCountYMD(startDateQ, endDateQ) > MAX_SPAN_DAYS) {
      throw new Error(`Date range is too long (max ${MAX_SPAN_DAYS} days).`);
    }
    return { startDate: startDateQ, endDate: endDateQ, range: "custom" };
  }
  if (r) {
    return { ...getDateRangeForPresetId(r), range: r };
  }
  return { ...getDateRangeForPresetId("28d"), range: "28d" };
}

/**
 * Authenticate, resolve site URL (Meta ID → website), enforce RBAC.
 * @returns {{ session, siteUrl: string, startDate: string, endDate: string, range: string }}
 */
export async function resolveSearchConsoleRequest(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    const err = new Error("Unauthorized. Please log in.");
    err.status = 401;
    throw err;
  }

  const path = String(req.nextUrl.pathname || "");
  const gscSection =
    path.includes("inspect") || path.includes("indexing")
      ? "url-inspection"
      : "website-statistics";
  if (!canAccessSection(session.user, gscSection)) {
    const err = new Error("Forbidden: Search Console access not granted.");
    err.status = 403;
    throw err;
  }

  const userRole = session.user.role || ROLES.USER;
  const rangeParam = req.nextUrl.searchParams.get("range");
  const startDateQ = req.nextUrl.searchParams.get("startDate");
  const endDateQ = req.nextUrl.searchParams.get("endDate");

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
      if (mappedUser?.siteLink) siteUrl = mappedUser.siteLink;
    }
  }

  if (!siteUrl || !isValidUrl(siteUrl)) {
    const err = new Error(
      "A website URL is required for this tool. Select a website (not only a Meta page) from the client dropdown."
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
      const err = new Error(
        "Access denied. You can only view Search Console data for sites assigned to your account."
      );
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

  let { startDate, endDate, range } = resolveGscDateRange(rangeParam, startDateQ, endDateQ);
  const clamped = clampSearchConsoleQueryRange(startDate, endDate);
  startDate = clamped.startDate;
  endDate = clamped.endDate;

  return { session, siteUrl: normalizedUrl, startDate, endDate, range, requestedSiteKey };
}

export function isWebsiteSelection(selectedSite, availableSites = []) {
  if (!selectedSite) return false;
  if (String(selectedSite).startsWith("http")) return true;
  if (isMetaPageId(selectedSite)) {
    const entry = availableSites.find(
      (s) => s.facebookPageId === selectedSite || s.siteLink === selectedSite
    );
    return entry?.type === "website" && Boolean(entry.siteLink?.startsWith("http"));
  }
  const entry = availableSites.find(
    (s) => s.siteLink === selectedSite || s.facebookPageId === selectedSite
  );
  return entry?.type === "website" || String(selectedSite).includes(".");
}
