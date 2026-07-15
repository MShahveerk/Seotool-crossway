import prisma from "../../../../../lib/prisma";
import { requireSuperAdmin } from "../../../../../lib/middleware/auth";
import { normalizeSiteOrigin } from "../../../../../lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(req, { params }) {
  try {
    await requireSuperAdmin();
    const { id } = params;

    const body = await req.json();
    const { siteUrl, gtmContainerId, facebookPageId, instagramUserId } = body || {};

    const normalizedSiteUrl = normalizeSiteOrigin(siteUrl);

    if (!normalizedSiteUrl) {
      return new Response(JSON.stringify({ error: "A valid Site URL is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check if another site already uses this URL
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
    const { id } = params;

    await prisma.site.delete({
      where: { id },
    });

    return new Response(
      JSON.stringify({ message: "Site deleted successfully." }),
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