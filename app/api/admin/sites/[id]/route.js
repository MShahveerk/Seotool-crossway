import prisma from "../../../../../lib/prisma";
import { requireSuperAdmin } from "../../../../../lib/middleware/auth";
import { normalizeSiteOrigin } from "../../../../../lib/validation";

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
    const accessibleKeys = [targetUrl, fbId, igId].filter(Boolean);

    const operations = [];

    // 1. Clean user siteLink fields (exact + common variants)
    operations.push(
      prisma.user.updateMany({
        where: { siteLink: { in: accessibleKeys } },
        data: { siteLink: null },
      })
    );

    // 2. Detach Meta Page IDs on User table
    const userMetaOr = [];
    if (fbId) userMetaOr.push({ facebookPageId: fbId });
    if (igId) userMetaOr.push({ instagramUserId: igId });
    if (userMetaOr.length > 0) {
      operations.push(
        prisma.user.updateMany({
          where: { OR: userMetaOr },
          data: {
            facebookPageId: null,
            instagramUserId: null,
          },
        })
      );
    }

    // 3. Delete user accessible site links (URL and Meta IDs used as association keys)
    operations.push(
      prisma.userAccessibleSite.deleteMany({
        where: { siteLink: { in: accessibleKeys } },
      })
    );

    // 4. Delete social media daily stats
    operations.push(
      prisma.socialMediaDailyStat.deleteMany({
        where: { siteLink: { in: accessibleKeys } },
      })
    );

    // 5. Delete approvals targeting this site or its pages
    const approvalsOr = [{ siteLink: { in: accessibleKeys } }];
    if (fbId) approvalsOr.push({ facebookPageId: fbId });
    if (igId) approvalsOr.push({ instagramUserId: igId });
    operations.push(
      prisma.approval.deleteMany({
        where: { OR: approvalsOr },
      })
    );

    // 6. Finally delete the site record
    operations.push(
      prisma.site.delete({
        where: { id },
      })
    );

    await prisma.$transaction(operations);

    return new Response(
      JSON.stringify({ message: "Site and all associated records deleted successfully." }),
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
