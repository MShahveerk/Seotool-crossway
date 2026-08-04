import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/[...nextauth]/route";
import prisma from "../../../../../lib/prisma";
import { resolveSiteEquivalents, sessionCanAccessSiteAsync } from "../../../../../lib/siteAccess";
import { hasGlobalSiteAccess } from "../../../../../lib/modulePermissions";
import { ROLES } from "../../../../../lib/rbac";
import { resolveSiteReportContext } from "../../../../../lib/siteReportContext";
import {
  canAccessReportsStudio,
  getReportCatalogPayload,
  getReportDeckConfig,
  setReportDeckConfig,
  summarizeDeckConfig,
  normalizeReportDeckConfig,
} from "../../../../../lib/reports/reportDeckConfig";

export const runtime = "nodejs";

function deny(status, error) {
  return Response.json({ error }, { status });
}

async function resolveSiteKey(session, urlParam) {
  const role = session.user.role || ROLES.USER;
  const fallback =
    session.user.siteLink ||
    session.user.facebookPageId ||
    (Array.isArray(session.user.accessibleSites) && session.user.accessibleSites[0]) ||
    "";
  const canPick = hasGlobalSiteAccess(session.user);
  let siteKey = String((canPick ? urlParam || fallback : fallback) || "").trim();
  if (!siteKey) return { error: "No site selected.", status: 400 };

  if (role !== ROLES.SUPER_ADMIN) {
    const allowed = await sessionCanAccessSiteAsync(prisma, session.user, [siteKey]);
    if (!allowed) return { error: "Access denied for this site.", status: 403 };
  }
  return { siteKey };
}

/** GET /api/reports/studio/config?url= */
export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return deny(401, "Unauthorized");
    if (!canAccessReportsStudio(session.user)) return deny(403, "Reports studio is for admin and SMM only.");

    const resolved = await resolveSiteKey(session, req.nextUrl.searchParams.get("url"));
    if (resolved.error) return deny(resolved.status, resolved.error);

    const [context, equivalents] = await Promise.all([
      resolveSiteReportContext(prisma, resolved.siteKey),
      resolveSiteEquivalents(prisma, resolved.siteKey),
    ]);
    const config = await getReportDeckConfig(context.websiteUrl || resolved.siteKey, {
      equivalents: [...equivalents, resolved.siteKey, context.websiteUrl].filter(Boolean),
    });
    return Response.json({
      siteKey: resolved.siteKey,
      websiteUrl: context.websiteUrl || null,
      config,
      summary: summarizeDeckConfig(config),
      catalog: getReportCatalogPayload(),
    });
  } catch (err) {
    return deny(err.status || 500, err.message || "Failed to load report config");
  }
}

/** PUT /api/reports/studio/config  body: { url, config } */
export async function PUT(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return deny(401, "Unauthorized");
    if (!canAccessReportsStudio(session.user)) return deny(403, "Reports studio is for admin and SMM only.");

    const body = await req.json().catch(() => ({}));
    const resolved = await resolveSiteKey(session, body.url || body.siteKey);
    if (resolved.error) return deny(resolved.status, resolved.error);

    const [context, equivalents] = await Promise.all([
      resolveSiteReportContext(prisma, resolved.siteKey),
      resolveSiteEquivalents(prisma, resolved.siteKey),
    ]);
    const saved = await setReportDeckConfig(resolved.siteKey, normalizeReportDeckConfig(body.config), {
      websiteUrl: context.websiteUrl,
      equivalents,
    });
    return Response.json({
      siteKey: resolved.siteKey,
      websiteUrl: context.websiteUrl || null,
      config: saved,
      summary: summarizeDeckConfig(saved),
      ok: true,
    });
  } catch (err) {
    return deny(err.status || 500, err.message || "Failed to save report config");
  }
}
