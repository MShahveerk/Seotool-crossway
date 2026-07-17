import { getSitemaps, submitSitemap, resubmitAllSitemaps } from "../../../../lib/searchconsole";
import { buildSitemapWarnings } from "../../../../lib/seoOpportunityHelpers";
import { resolveSearchConsoleRequest } from "../../../../lib/searchConsoleRequest";
import { ROLES } from "../../../../lib/rbac";

export const runtime = "nodejs";

/**
 * GET /api/searchconsole/sitemaps?url=<site>
 */
export async function GET(req) {
  try {
    const { siteUrl } = await resolveSearchConsoleRequest(req);
    const data = await getSitemaps(siteUrl);
    const sitemaps = data.sitemaps || [];
    return new Response(
      JSON.stringify({
        siteUrl,
        sitemaps,
        warnings: buildSitemapWarnings(sitemaps),
        total: sitemaps.length,
        lastUpdated: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
      }
    );
  } catch (error) {
    const status = error.status || 500;
    return new Response(
      JSON.stringify({ error: error.message || "Failed to load sitemaps." }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * POST /api/searchconsole/sitemaps
 * Body: { url?, feedpath?, resubmitAll?: boolean }
 * Submits/resubmits sitemap(s). Super admin / SMM / site owner.
 */
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const urlFromBody = body.url || body.siteUrl || "";
    const feedpath = String(body.feedpath || body.path || "").trim();
    const resubmitAll = Boolean(body.resubmitAll);

    if (urlFromBody && req.nextUrl) {
      req.nextUrl.searchParams.set("url", urlFromBody);
    }
    const { session, siteUrl } = await resolveSearchConsoleRequest(req);

    const role = session.user.role || ROLES.USER;
    if (role === ROLES.VIEWER || role === ROLES.APPROVER) {
      const err = new Error("You do not have permission to submit sitemaps.");
      err.status = 403;
      throw err;
    }

    if (resubmitAll) {
      const result = await resubmitAllSitemaps(siteUrl);
      return new Response(JSON.stringify({ ok: true, ...result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!feedpath) {
      return new Response(
        JSON.stringify({ error: "feedpath is required (or set resubmitAll: true)." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await submitSitemap(siteUrl, feedpath);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const status = error.status || 500;
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to submit sitemap.",
        userMessage:
          status === 403
            ? error.message
            : "Sitemap submit failed. Ensure the service account is Owner/Full on this Search Console property.",
      }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }
}
