import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import prisma from "../../../../lib/prisma";
import { ROLES } from "../../../../lib/rbac";
import { canAccessSection } from "../../../../lib/modulePermissions";
import { normalizeSiteOrigin } from "../../../../lib/validation";
import {
  isMetaPageId,
  resolveSiteEquivalents,
  sessionCanAccessSiteAsync,
} from "../../../../lib/siteAccess";

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

    if (!canAccessSection(session.user, "smm-statistics")) {
      return new Response(JSON.stringify({ error: "Forbidden: SMM Statistics access not granted." }), {
        status: 403,
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
      const mappedSite = await prisma.site.findFirst({
        where: {
          OR: [
            { facebookPageId: targetSite },
            { instagramUserId: targetSite },
            { siteUrl: targetSite },
          ],
        },
        select: { siteUrl: true },
      });
      if (mappedSite?.siteUrl) {
        resolvedSiteLink = mappedSite.siteUrl;
      } else {
        const mappedUser = await prisma.user.findFirst({
          where: {
            OR: [
              { facebookPageId: targetSite },
              { instagramUserId: targetSite },
            ],
          },
          select: { siteLink: true },
        });
        if (mappedUser?.siteLink) {
          resolvedSiteLink = mappedUser.siteLink;
        }
      }
    }

    const targetSiteNormalized = isMetaPageId(resolvedSiteLink)
      ? String(resolvedSiteLink).trim()
      : normalizeSiteOrigin(resolvedSiteLink);
    if (!targetSiteNormalized) {
      return new Response(
        JSON.stringify({ baselines: [], siteUrl: null, message: "No site selected." }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const siteEquivalents = await resolveSiteEquivalents(prisma, targetSite || targetSiteNormalized);
    if (!siteEquivalents.includes(targetSiteNormalized)) siteEquivalents.push(targetSiteNormalized);

    if (role === ROLES.USER) {
      const ownSite = normalizeSiteOrigin(session.user.siteLink || "");
      const ownOk =
        ownSite &&
        (ownSite === targetSiteNormalized ||
          siteEquivalents.some((k) => normalizeSiteOrigin(k) === ownSite || k === ownSite));
      if (!ownOk) {
        return new Response(JSON.stringify({ error: "Access denied for selected site." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (role === ROLES.VIEWER || role === ROLES.SMM) {
      if (!(await sessionCanAccessSiteAsync(prisma, session.user, siteEquivalents))) {
        return new Response(JSON.stringify({ error: "Access denied for selected site." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Resolve equivalents (both website URLs and Meta IDs)
    const equivalentSites = [targetSiteNormalized];
    const linkedSite = await prisma.site.findFirst({
      where: {
        OR: [
          { siteUrl: targetSiteNormalized },
          { facebookPageId: targetSiteNormalized },
          { instagramUserId: targetSiteNormalized }
        ]
      }
    });
    if (linkedSite) {
      if (linkedSite.siteUrl) equivalentSites.push(linkedSite.siteUrl);
      if (linkedSite.facebookPageId) equivalentSites.push(linkedSite.facebookPageId);
      if (linkedSite.instagramUserId) equivalentSites.push(linkedSite.instagramUserId);
    }
    const linkedUsers = await prisma.user.findMany({
      where: {
        OR: [
          { siteLink: targetSiteNormalized },
          { facebookPageId: targetSiteNormalized },
          { instagramUserId: targetSiteNormalized }
        ]
      }
    });
    for (const u of linkedUsers) {
      if (u.siteLink) equivalentSites.push(u.siteLink);
      if (u.facebookPageId) equivalentSites.push(u.facebookPageId);
      if (u.instagramUserId) equivalentSites.push(u.instagramUserId);
    }
    const uniqueEquivalents = Array.from(new Set(
      equivalentSites.map(s => {
        if (/^\d+$/.test(String(s).trim())) return String(s).trim();
        return normalizeSiteOrigin(s);
      }).filter(Boolean)
    ));

    const ownerUser = await prisma.user.findFirst({
      where: {
        OR: [
          { siteLink: { in: uniqueEquivalents } },
          { facebookPageId: { in: uniqueEquivalents } },
          { instagramUserId: { in: uniqueEquivalents } }
        ]
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    // Prefer site-scoped rows across all writers (admin refresh vs site owner).
    const rawRows = await prisma.socialMediaDailyStat.findMany({
      where: {
        siteLink: { in: uniqueEquivalents },
      },
      orderBy: [{ statDate: "desc" }, { updatedAt: "desc" }],
    });
    const rows = rawRows.filter((r) => String(r.platform || "").toLowerCase() !== "linkedin");

    if (!rows.length) {
      return new Response(
        JSON.stringify({
          siteUrl: targetSiteNormalized,
          baselines: [],
          message: "No user or baseline rows found for this site yet.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

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
        userId: ownerUser?.id || rows[0]?.userId || null,
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
