import { getLatestSiteAudit, runSiteAudit } from "../../../lib/siteAuditJobs";
import { getAuthorityScores, isAuthorityConfigured, toDomain } from "../../../lib/authority";
import { ROLES, hasPermission, PERMISSIONS } from "../../../lib/rbac";
import { resolveWebsiteAccess } from "../../../lib/resolveWebsiteAccess";

export const runtime = "nodejs";
export const maxDuration = 300;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}

/**
 * GET /api/site-audit?url=&refresh=1
 * Returns the latest audit snapshot, health trend, and authority score.
 * Snapshots are refreshed nightly by cron (03:30); `refresh=1` runs a live crawl.
 */
export async function GET(req) {
  try {
    const { session, siteUrl } = await resolveWebsiteAccess(req);

    const userRole = session.user.role || ROLES.USER;
    if (!hasPermission(userRole, PERMISSIONS.ACCESS_SEARCH_CONSOLE)) {
      return json({ error: "Access denied. Insufficient permissions." }, 403);
    }

    const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1";
    if (forceRefresh) {
      await runSiteAudit(siteUrl);
    }

    const { snapshot, running, trend, lastError } = await getLatestSiteAudit(siteUrl);

    let authority = null;
    const domain = toDomain(siteUrl);
    if (domain) {
      try {
        const scores = await getAuthorityScores([domain]);
        const row = scores.get(domain);
        if (row) authority = { domain, score: row.score, globalRank: row.globalRank };
      } catch {
        /* authority is optional decoration on this page */
      }
    }

    return json({
      siteUrl,
      running,
      lastError,
      authority,
      authorityConfigured: isAuthorityConfigured(),
      trend: trend.map((t) => ({
        date: t.startedAt,
        healthScore: t.healthScore,
        critical: t.criticalCount,
        warning: t.warningCount,
      })),
      snapshot: snapshot
        ? {
            id: snapshot.id,
            startedAt: snapshot.startedAt,
            finishedAt: snapshot.finishedAt,
            healthScore: snapshot.healthScore,
            totalPages: snapshot.totalPages,
            counts: {
              critical: snapshot.criticalCount,
              warning: snapshot.warningCount,
              notice: snapshot.noticeCount,
            },
            ...snapshot.payload,
          }
        : null,
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("Site audit API error:", error);
    return json({ error: error.message || "Failed to load site audit." }, status);
  }
}
