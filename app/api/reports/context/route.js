import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { ROLES } from "../../../../lib/rbac";
import prisma from "../../../../lib/prisma";
import { sessionCanAccessSiteAsync } from "../../../../lib/siteAccess";
import { resolveSiteReportContext } from "../../../../lib/siteReportContext";

export const runtime = "nodejs";

/**
 * GET /api/reports/context?url=
 * Report eligibility for a site key (Meta-only vs full pack).
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
        : null);

    const hasGlobalAccess = role === ROLES.SUPER_ADMIN || role === ROLES.SMM;
    let siteKey = hasGlobalAccess
      ? req.nextUrl.searchParams.get("url") || fallbackSite || ""
      : fallbackSite;

    siteKey = String(siteKey || "").trim();
    if (!siteKey) {
      return new Response(JSON.stringify({ error: "No site selected." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (role === ROLES.VIEWER || role === ROLES.SMM || role === ROLES.APPROVER) {
      const allowed = await sessionCanAccessSiteAsync(prisma, session.user, [siteKey]);
      if (!allowed) {
        return new Response(JSON.stringify({ error: "Access denied." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const context = await resolveSiteReportContext(prisma, siteKey);
    return new Response(
      JSON.stringify({
        siteKey: context.siteKey,
        displayName: context.displayName,
        includeWebsiteReports: context.includeWebsiteReports,
        applicableSections: context.applicableSections,
        isMetaPage: context.isMetaPage,
        websiteUrl: context.websiteUrl,
      }),
      { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Failed." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
