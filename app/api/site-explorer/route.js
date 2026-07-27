import { isAuthorityConfigured, toDomain } from "../../../lib/authority";
import {
  getLatestSiteExplorer,
  runSiteExplorer,
  snapshotToApiPayload,
} from "../../../lib/siteExplorerJobs";
import { ROLES, hasPermission, PERMISSIONS } from "../../../lib/rbac";
import { resolveWebsiteAccess } from "../../../lib/resolveWebsiteAccess";

export const runtime = "nodejs";
/** Common Crawl first fetch can take 1–3 minutes (many CDX queries). */
export const maxDuration = 300;

function emptySiteExplorerPayload(domain, view) {
  return {
    domain,
    view,
    source: "database",
    empty: true,
    message:
      "No snapshot saved yet. Click Refresh now (first fetch hits Common Crawl and can take 1–3 minutes), or wait for the daily 05:00 cron.",
    authority: {
      configured: isAuthorityConfigured(),
      score: null,
      score100: null,
      globalRank: null,
      referringDomains: null,
      found: false,
    },
    overview: null,
    items: [],
    total: 0,
    notes: [
      "Common Crawl needs no API key — data is fetched from index.commoncrawl.org.",
      "Set OPENPAGERANK_API_KEY in .env for authority score and referring-domain counts (optional).",
    ],
    openhrefs: {
      status: "planned",
      message: "Full HTML backlink graph pending openhrefs dataset import.",
    },
    fetchedAt: null,
    stale: true,
  };
}

function migrationHint(error) {
  const msg = String(error?.message || "");
  if (/site_explorer_snapshots|does not exist|P2021|P2022/i.test(msg)) {
    return "Database tables are missing. On the server run: npm run prisma:deploy (or npx prisma migrate deploy).";
  }
  return null;
}

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
        return json(emptySiteExplorerPayload(domain, view));
      }
    }

    return json(snapshotToApiPayload(snapshot, { view, page, pageSize }));
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("Site explorer API error:", error);
    const hint = migrationHint(error);
    return json({ error: hint || error.message || "Failed to load site explorer data." }, status);
  }
}
