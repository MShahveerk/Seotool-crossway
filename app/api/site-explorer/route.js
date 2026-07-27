import { after } from "next/server";
import { isAuthorityConfigured, toDomain } from "../../../lib/authority";
import {
  executeSiteExplorerRefresh,
  getLatestSiteExplorer,
  prepareSiteExplorerRefresh,
  snapshotToApiPayload,
} from "../../../lib/siteExplorerJobs";
import { ROLES, hasPermission, PERMISSIONS } from "../../../lib/rbac";
import { resolveWebsiteAccess } from "../../../lib/resolveWebsiteAccess";

export const runtime = "nodejs";
export const maxDuration = 300;

function emptySiteExplorerPayload(domain, view) {
  return {
    domain,
    view,
    source: "database",
    empty: true,
    message:
      "No snapshot saved yet. Click Refresh now — data loads in the background and this page updates automatically.",
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
      "Run npm run prisma:deploy on the server if you see database errors.",
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

function runningPayload({ domain, view, page, pageSize, latest, message }) {
  return {
    domain,
    view,
    source: "database",
    running: true,
    message,
    ...(latest ? snapshotToApiPayload(latest, { view, page, pageSize }) : emptySiteExplorerPayload(domain, view)),
  };
}

/**
 * GET /api/site-explorer?url=&view=overview|pages|subdomains|referring|backlinks&refresh=1
 * Serves the latest stored daily snapshot; refresh=1 queues Common Crawl + Open PageRank via after().
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

    if (refresh) {
      const { latest, running } = await getLatestSiteExplorer(domain);

      if (!running) {
        const prep = await prepareSiteExplorerRefresh(siteUrl);
        if (prep.started && prep.snapshotId) {
          const snapshotId = prep.snapshotId;
          after(async () => {
            await executeSiteExplorerRefresh(siteUrl, snapshotId, { includeReferring: false });
          });
        }
      }

      return json(
        runningPayload({
          domain,
          view,
          page,
          pageSize,
          latest,
          message:
            "Fetching indexed pages and authority in the background (about 30–60 seconds). This page updates automatically.",
        }),
        202
      );
    }

    const { latest, running, failedToday } = await getLatestSiteExplorer(domain);

    if (running) {
      return json(
        runningPayload({
          domain,
          view,
          page,
          pageSize,
          latest,
          message: "Refresh in progress — showing the last saved snapshot until the new one is ready.",
        })
      );
    }

    if (latest) {
      return json(snapshotToApiPayload(latest, { view, page, pageSize }));
    }

    if (failedToday?.errorMessage) {
      return json(
        {
          error: failedToday.errorMessage,
          hint: "If this keeps failing, confirm npm run prisma:deploy was run and that index.commoncrawl.org is reachable from your server.",
        },
        502
      );
    }

    return json(emptySiteExplorerPayload(domain, view));
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("Site explorer API error:", error);
    const hint = migrationHint(error);
    return json({ error: hint || error.message || "Failed to load site explorer data." }, status);
  }
}
