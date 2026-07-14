import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import prisma from "../../../../lib/prisma";
import { ROLES } from "../../../../lib/rbac";
import { normalizeSiteOrigin } from "../../../../lib/validation";

export const runtime = "nodejs";

function normalizePlatformKey(value) {
  const p = String(value || "").trim().toLowerCase();
  if (p === "linkedin") return "";
  return p === "x" ? "tiktok" : p;
}

/**
 * GET /api/smm/baseline
 * Latest follower snapshot per platform for the site's SMM baseline (same source as admin baseline UI).
 * Query: super_admin may pass `url` for the integrated site; others use session site.
 */
export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const role = session.user.role || ROLES.USER;
    const fallbackSite =
      session.user.siteLink ||
      (Array.isArray(session.user.accessibleSites) && session.user.accessibleSites.length
        ? session.user.accessibleSites[0]
        : "");

    const hasGlobalAccess = role === ROLES.SUPER_ADMIN || role === ROLES.SMM;

    let targetSite = hasGlobalAccess
        ? (req.nextUrl.searchParams.get("url") || fallbackSite || "")
        : fallbackSite;

    // Resolve targetSite to siteLink if it is a Meta Page ID
    let resolvedSiteLink = targetSite;
    if (targetSite) {
      const mappedUser = await prisma.user.findFirst({
        where: {
          OR: [
            { facebookPageId: targetSite },
            { instagramUserId: targetSite }
          ]
        },
        select: { siteLink: true }
      });
      if (mappedUser?.siteLink) {
        resolvedSiteLink = mappedUser.siteLink;
      }
    }

    const targetSiteNormalized = normalizeSiteOrigin(resolvedSiteLink);
    if (!targetSiteNormalized) {
      return new Response(
        JSON.stringify({ baselines: [], siteUrl: null, message: "No site selected." }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (role === ROLES.USER) {
      const ownSite = normalizeSiteOrigin(session.user.siteLink || "");
      if (!ownSite || ownSite !== targetSiteNormalized) {
        return new Response(JSON.stringify({ error: "Access denied for selected site." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (role === ROLES.VIEWER || role === ROLES.SMM) {
      const allowed = new Set(
        (session.user.accessibleSites || []).map((s) => normalizeSiteOrigin(s)).filter(Boolean)
      );
      const ownLink = normalizeSiteOrigin(session.user.siteLink || "");
      if (ownLink) allowed.add(ownLink);
      if (!allowed.size || !allowed.has(targetSiteNormalized)) {
        return new Response(JSON.stringify({ error: "Access denied for selected site." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    let ownerUser = await prisma.user.findFirst({
      where: { siteLink: targetSiteNormalized },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!ownerUser) {
      const statOwner = await prisma.socialMediaDailyStat.findFirst({
        where: { siteLink: targetSiteNormalized },
        orderBy: { statDate: "desc" },
        select: { userId: true },
      });
      ownerUser = statOwner?.userId ? { id: statOwner.userId } : null;
    }

    if (!ownerUser?.id) {
      return new Response(
        JSON.stringify({
          siteUrl: targetSiteNormalized,
          baselines: [],
          message: "No user or baseline rows found for this site yet.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const rawRows = await prisma.socialMediaDailyStat.findMany({
      where: {
        userId: ownerUser.id,
        siteLink: targetSiteNormalized,
      },
      orderBy: [{ statDate: "desc" }, { updatedAt: "desc" }],
    });
    const rows = rawRows.filter((r) => String(r.platform || "").toLowerCase() !== "linkedin");

    const latestByPlatform = new Map();
    for (const row of rows) {
      const key = normalizePlatformKey(row.platform);
      if (!key) continue;
      const normalizedRow = { ...row, platform: key };
      const existing = latestByPlatform.get(key);
      if (
        !existing ||
        new Date(row.statDate) > new Date(existing.statDate) ||
        (new Date(row.statDate).getTime() === new Date(existing.statDate).getTime() &&
          Number(row.followers || 0) >= Number(existing.followers || 0))
      ) {
        latestByPlatform.set(key, normalizedRow);
      }
    }

    const baselines = Array.from(latestByPlatform.values()).map((row) => ({
      platform: row.platform,
      accountHandle: row.accountHandle || "",
      accountName: row.accountName || "",
      followers: Number(row.followers || 0),
      source: row.source || null,
      statDate: row.statDate ? row.statDate.toISOString().slice(0, 10) : null,
    }));

    return new Response(
      JSON.stringify({
        siteUrl: targetSiteNormalized,
        userId: ownerUser.id,
        baselines,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to load SMM baseline." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
