import { toDomain } from "../../../lib/authority";
import {
  getLatestSiteExplorer,
  runSiteExplorer,
  snapshotToApiPayload,
} from "../../../lib/siteExplorerJobs";
import { ROLES, hasPermission, PERMISSIONS } from "../../../lib/rbac";
import { resolveWebsiteAccess } from "../../../lib/resolveWebsiteAccess";

export const runtime = "nodejs";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}

/**
 * GET /api/site-explorer?url=&view=overview|pages|subdomains|referring|backlinks&refresh=1
 * Serves the latest stored daily snapshot; refresh=1 re-fetches Common Crawl + Open PageRank.
 */
export async function GET(req) {
  try {
    const { session, siteUrl } = await resolveWebsiteAccess(req);
    const userRole = session.user.role || ROLES.USER;
    if (!hasPermission(userRole, PERMISSIONS.ACCESS_SEARCH_CONSOLE)) {
      return json({ error: "Access denied. Insufficient permissions." }, 403);
    }

    const domain = toDomain(siteUrl);
    if (!domain) return json({ error: "Could not extract a domain from the selected website." }, 400);

    const view = req.nextUrl.searchParams.get("view") || "overview";
    const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") || 1));
    const pageSize = Math.min(100, Math.max(10, Number(req.nextUrl.searchParams.get("pageSize") || 50)));
    const refresh = req.nextUrl.searchParams.get("refresh") === "1";

    let snapshot = null;

    if (refresh) {
      snapshot = await runSiteExplorer(siteUrl);
      if (snapshot.status === "error") {
        return json({ error: snapshot.errorMessage || "Site explorer refresh failed." }, 502);
      }
    } else {
      const { latest, running } = await getLatestSiteExplorer(domain);
      if (running) {
        return json({
          domain,
          view,
          source: "database",
          running: true,
          message: "A site explorer refresh is already in progress. Showing the last saved snapshot when ready.",
          ...(latest ? snapshotToApiPayload(latest, { view, page, pageSize }) : {}),
        });
      }
      if (latest) {
        snapshot = latest;
      } else {
        snapshot = await runSiteExplorer(siteUrl);
        if (snapshot.status === "error") {
          return json({ error: snapshot.errorMessage || "Site explorer fetch failed." }, 502);
        }
      }
    }

    return json(snapshotToApiPayload(snapshot, { view, page, pageSize }));
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("Site explorer API error:", error);
    return json({ error: error.message || "Failed to load site explorer data." }, status);
  }
}
