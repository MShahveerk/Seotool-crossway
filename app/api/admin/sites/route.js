import prisma from "../../../../lib/prisma";
import { requireSuperAdmin } from "../../../../lib/middleware/auth";
import { normalizeOnboardWebsiteUrl } from "../../../../lib/validation";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    await requireSuperAdmin();

    const sites = await prisma.site.findMany({
      orderBy: { createdAt: "desc" },
    });

    return new Response(JSON.stringify({ sites }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error.message === "Unauthorized" || error.message.includes("Super admin")) {
      return new Response(JSON.stringify({ error: "Forbidden: Super admin access required" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: error.message || "Failed to fetch sites" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function POST(req) {
  try {
    await requireSuperAdmin();
    const body = await req.json();
    const { siteUrl, gtmContainerId, facebookPageId, instagramUserId } = body || {};

    const normalizedSiteUrl = normalizeOnboardWebsiteUrl(siteUrl);

    if (!normalizedSiteUrl) {
      return new Response(JSON.stringify({ error: "A valid Site URL is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const existingSite = await prisma.site.findUnique({
      where: { siteUrl: normalizedSiteUrl },
    });

    if (existingSite) {
      return new Response(
        JSON.stringify({ error: "This Site URL is already registered in the system." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const site = await prisma.site.create({
      data: {
        siteUrl: normalizedSiteUrl,
        gtmContainerId: gtmContainerId ? String(gtmContainerId).trim() : null,
        facebookPageId: facebookPageId ? String(facebookPageId).trim() : null,
        instagramUserId: instagramUserId ? String(instagramUserId).trim() : null,
      },
    });

    return new Response(
      JSON.stringify({
        message: "Site onboarded successfully.",
        site,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    if (error.message === "Unauthorized" || error.message.includes("Super admin")) {
      return new Response(JSON.stringify({ error: "Forbidden: Super admin access required" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: error.message || "Failed to onboard site" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}