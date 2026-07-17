import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { ROLES } from "../../../../lib/rbac";
import prisma from "../../../../lib/prisma";
import { sessionCanAccessSiteAsync } from "../../../../lib/siteAccess";
import { resolveSiteReportContext } from "../../../../lib/siteReportContext";
import { buildSectionReportPdf, siteFileSlug } from "../../../../lib/clientReportBuilder";
import { logReportSend } from "../../../../lib/clientReportSettings";

export const runtime = "nodejs";

const VALID_SECTIONS = new Set([
  "smm",
  "website",
  "seo-opportunities",
  "url-inspection",
  "sitemap-health",
  "device-appearance",
  "query-page-matrix",
  "full",
]);

/**
 * GET /api/reports/export?section=smm&url=&month=YYYY-MM
 * Download a section PDF for the current site.
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
    const section = String(req.nextUrl.searchParams.get("section") || "smm").trim();
    if (!VALID_SECTIONS.has(section)) {
      return new Response(JSON.stringify({ error: "Invalid report section." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

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
        return new Response(JSON.stringify({ error: "Access denied for this site." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (role === ROLES.USER) {
      const own = session.user.siteLink || session.user.facebookPageId;
      if (own !== siteKey) {
        return new Response(JSON.stringify({ error: "Access denied." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const reportMonth = String(req.nextUrl.searchParams.get("month") || "").trim() || undefined;
    const context = await resolveSiteReportContext(prisma, siteKey);

    if (section !== "smm" && !context.includeWebsiteReports) {
      return new Response(
        JSON.stringify({
          error:
            "Website reports require a linked website and GTM container. This Meta-only account can export SMM reports only.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const bytes = await buildSectionReportPdf(section, context, { reportMonth });
    const slug = siteFileSlug(context.websiteUrl || context.smmSiteKey);
    const month = reportMonth || new Date().toISOString().slice(0, 7);
    const filename = `${section}-report-${slug}-${month}.pdf`;

    await logReportSend({
      siteKey,
      recipientEmail: session.user.email || "export",
      reportTypes: [section],
      trigger: "export",
      status: "sent",
    });

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const status = error.status || 500;
    return new Response(JSON.stringify({ error: error.message || "Export failed." }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
