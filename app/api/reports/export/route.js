import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { ROLES } from "../../../../lib/rbac";
import prisma from "../../../../lib/prisma";
import { sessionCanAccessSiteAsync, isMetaPageId } from "../../../../lib/siteAccess";
import { hasGlobalSiteAccess } from "../../../../lib/modulePermissions";
import { logReportSend } from "../../../../lib/clientReportSettings";
import { buildSlideDeckPdfBytes, slideDeckFilename } from "../../../../lib/reports/buildSlideDecks";
import { resolveReportDisplayName } from "../../../../lib/reports/resolveReportPacks";
import { resolveSiteReportContext } from "../../../../lib/siteReportContext";

export const runtime = "nodejs";

/** Map legacy / tool section IDs into slide-deck kinds. */
const SECTION_TO_KIND = {
  smm: "smm",
  website: "website",
  full: "combined",
  combined: "combined",
  "seo-opportunities": "website",
  "url-inspection": "website",
  "sitemap-health": "website",
  "device-appearance": "website",
  "query-page-matrix": "website",
  "keyword-research": "website",
  "ai-keyword-research": "website",
  "site-explorer": "website",
  "link-index": "website",
};

/**
 * GET /api/reports/export?section=website|smm|combined&url=&month=YYYY-MM
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
    const kind = SECTION_TO_KIND[section];
    if (!kind) {
      return new Response(JSON.stringify({ error: "Invalid report section." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const fallbackSite =
      session.user.siteLink ||
      session.user.facebookPageId ||
      (Array.isArray(session.user.accessibleSites) && session.user.accessibleSites.length
        ? session.user.accessibleSites[0]
        : null);

    const canPickUrl = hasGlobalSiteAccess(session.user);
    let siteKey = canPickUrl
      ? req.nextUrl.searchParams.get("url") || fallbackSite || ""
      : fallbackSite;

    siteKey = String(siteKey || "").trim();
    if (!siteKey) {
      return new Response(JSON.stringify({ error: "No site selected." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (role !== ROLES.SUPER_ADMIN) {
      const allowed = await sessionCanAccessSiteAsync(prisma, session.user, [siteKey]);
      if (!allowed) {
        return new Response(JSON.stringify({ error: "Access denied for this site." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if ((kind === "website" || kind === "combined") && isMetaPageId(siteKey) && kind === "website") {
      return new Response(
        JSON.stringify({
          error: "Website reports require a website URL. Use the social or combined deck for Meta pages.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const reportMonth = String(req.nextUrl.searchParams.get("month") || "").trim() || undefined;
    const includeInternal =
      role === ROLES.SUPER_ADMIN || role === ROLES.SMM || role === ROLES.USER || role === ROLES.VIEWER;

    const context = await resolveSiteReportContext(prisma, siteKey);
    const buildKey = context.websiteUrl || siteKey;
    const deckKind =
      kind === "combined" && isMetaPageId(buildKey) && !context.websiteUrl
        ? "smm"
        : kind === "website" && isMetaPageId(buildKey) && !context.websiteUrl
          ? "smm"
          : kind;

    const displayName = await resolveReportDisplayName(buildKey, context);

    const bytes = await buildSlideDeckPdfBytes(deckKind, buildKey, {
      reportMonth,
      preparedFor: session.user.name || session.user.email,
      includeInternal: Boolean(includeInternal && deckKind === "website"),
      displayName,
    });

    const month = reportMonth || new Date().toISOString().slice(0, 7);
    const filename = slideDeckFilename(deckKind, displayName || buildKey, month);

    await logReportSend({
      siteKey,
      recipientEmail: session.user.email || "export",
      reportTypes: [deckKind],
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
