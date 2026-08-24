import prisma from "../../../../../lib/prisma";
import { requireSuperAdmin } from "../../../../../lib/middleware/auth";
import { normalizeSiteOrigin } from "../../../../../lib/validation";
import { isMetaPageId } from "../../../../../lib/siteAccess";

export const dynamic = "force-dynamic";

export async function PATCH(req, { params }) {
  try {
    await requireSuperAdmin();
    const { id } = await params;

    const body = await req.json();
    const { siteUrl, gtmContainerId, facebookPageId, instagramUserId } = body || {};

    const normalizedSiteUrl = normalizeSiteOrigin(siteUrl);

    if (!normalizedSiteUrl) {
      return new Response(JSON.stringify({ error: "A valid Site URL is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const existingUrl = await prisma.site.findUnique({
      where: { siteUrl: normalizedSiteUrl },
    });

    if (existingUrl && existingUrl.id !== id) {
      return new Response(JSON.stringify({ error: "Another site is already using this URL." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const site = await prisma.site.update({
      where: { id },
      data: {
        siteUrl: normalizedSiteUrl,
        gtmContainerId: gtmContainerId ? String(gtmContainerId).trim() : null,
        facebookPageId: facebookPageId ? String(facebookPageId).trim() : null,
        instagramUserId: instagramUserId ? String(instagramUserId).trim() : null,
      },
    });

    return new Response(
      JSON.stringify({
        message: "Site updated successfully.",
        site,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    if (error.message === "Unauthorized" || error.message.includes("Super admin")) {
      return new Response(JSON.stringify({ error: "Forbidden: Super admin access required" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (error.code === "P2025") {
      return new Response(JSON.stringify({ error: "Site not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: error.message || "Failed to update site" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function DELETE(req, { params }) {
  try {
    await requireSuperAdmin();
    const { id } = await params;

    const site = await prisma.site.findUnique({
      where: { id },
    });

    if (!site) {
      return new Response(JSON.stringify({ error: "Site not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const targetUrl = site.siteUrl;
    const fbId = site.facebookPageId ? String(site.facebookPageId).trim() : "";
    const igId = site.instagramUserId ? String(site.instagramUserId).trim() : "";
    // Website delete must not wipe Meta pages. Keep numeric page IDs on users,
    // assignments, stats, and approvals so those projects remain and reappear.
    const websiteKeys = [targetUrl].filter(Boolean);

    const operations = [];

    if (fbId && isMetaPageId(fbId)) {
      operations.push(
        prisma.sitePostConfig.upsert({
          where: { siteKey: fbId },
          create: {
            siteKey: fbId,
            facebookPageId: fbId,
            instagramUserId: igId && isMetaPageId(igId) ? igId : null,
          },
          update: {
            facebookPageId: fbId,
            ...(igId && isMetaPageId(igId) ? { instagramUserId: igId } : {}),
          },
        })
      );
    } else if (igId && isMetaPageId(igId)) {
      operations.push(
        prisma.sitePostConfig.upsert({
          where: { siteKey: igId },
          create: { siteKey: igId, instagramUserId: igId },
          update: { instagramUserId: igId },
        })
      );
    }

    if (websiteKeys.length) {
      operations.push(
        prisma.user.updateMany({
          where: { siteLink: { in: websiteKeys } },
          data: { siteLink: null },
        })
      );
      operations.push(
        prisma.userAccessibleSite.deleteMany({
          where: { siteLink: { in: websiteKeys } },
        })
      );
      operations.push(
        prisma.socialMediaDailyStat.deleteMany({
          where: { siteLink: { in: websiteKeys } },
        })
      );
      operations.push(
        prisma.approval.deleteMany({
          where: { siteLink: { in: websiteKeys } },
        })
      );
    }

    operations.push(
      prisma.site.delete({
        where: { id },
      })
    );

    await prisma.$transaction(operations);

    return new Response(
      JSON.stringify({
        message: "Website removed. Linked Meta pages stay on the dashboard.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    if (error.message === "Unauthorized" || error.message.includes("Super admin")) {
      return new Response(JSON.stringify({ error: "Forbidden: Super admin access required" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (error.code === "P2025") {
      return new Response(JSON.stringify({ error: "Site not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: error.message || "Failed to delete site" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
