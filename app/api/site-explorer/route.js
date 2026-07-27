import { after } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { isAuthorityConfigured, toDomain } from "../../../lib/authority";
import {
  enrichPageUrlRatings,
  enrichWithLiveAuthority,
  executeSiteExplorerRefresh,
  getLatestSiteExplorer,
  prepareSiteExplorerRefresh,
  snapshotToApiPayload,
} from "../../../lib/siteExplorerJobs";
import { ROLES, hasPermission, PERMISSIONS } from "../../../lib/rbac";
import { resolveWebsiteAccess } from "../../../lib/resolveWebsiteAccess";
import { normalizeSiteOrigin } from "../../../lib/validation";
import { enrichSiteExplorerWithGsc } from "../../../lib/siteExplorerGsc";

export const runtime = "nodejs";
export const maxDuration = 300;

async function requireSession(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    const err = new Error("Unauthorized. Please log in.");
    err.status = 401;
    throw err;
  }
  const userRole = session.user.role || ROLES.USER;
  if (!hasPermission(userRole, PERMISSIONS.ACCESS_SEARCH_CONSOLE)) {
    const err = new Error("Access denied. Insufficient permissions.");
    err.status = 403;
    throw err;
  }
  return session;
}

function resolveTargetDomain(req) {
  const exploreDomain = req.nextUrl.searchParams.get("domain")?.trim();
  if (exploreDomain) {
    const domain = toDomain(exploreDomain);
    if (!domain) return { error: "Enter a valid domain (e.g. ahrefs.com)." };
    return { domain, siteUrl: `https://${domain}`, explore: true };
  }
  return null;
}

function emptySiteExplorerPayload(domain, view) {
  return {
    domain,
    view,
    source: "database",
    empty: true,
    message: "Search a domain above or click Analyze to load Open PageRank metrics.",
    authority: {
      configured: isAuthorityConfigured(),
      score: null,
      score100: null,
      globalRank: null,
      referringDomains: null,
      found: false,
      homepageUr100: null,
    },
    homepageUr100: null,
    overview: null,
    items: [],
    total: 0,
    notes: [
      "Open PageRank provides DR-like score, referring domain count, and homepage UR.",
      "Indexed pages load from Google Search Console when this property is connected.",
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

async function resolveGscSiteUrl(req, fallbackSiteUrl, explore) {
  const urlParam = req.nextUrl.searchParams.get("url")?.trim();
  if (urlParam) {
    try {
      const { siteUrl } = await resolveWebsiteAccess(req);
      return siteUrl;
    } catch {
      return normalizeSiteOrigin(urlParam) || urlParam;
    }
  }
  if (!explore && fallbackSiteUrl) return fallbackSiteUrl;
  return fallbackSiteUrl || null;
}

async function finalizePayload(payload, domain, view, gscSiteUrl, page, pageSize) {
  await enrichWithLiveAuthority(payload, domain);
  if (gscSiteUrl) {
    await enrichSiteExplorerWithGsc(payload, gscSiteUrl, { view, page, pageSize });
  }
  if (view === "pages" && Array.isArray(payload.items)) {
    payload.items = await enrichPageUrlRatings(payload.items, domain);
  }
  return payload;
}

function runningPayload({ domain, view, page, pageSize, latest, message }) {
  const base = latest
    ? snapshotToApiPayload(latest, { view, page, pageSize })
    : emptySiteExplorerPayload(domain, view);
  return { ...base, domain, view, source: "database", running: true, message };
}

/**
 * GET /api/site-explorer?domain=|url=&view=...&refresh=1
 * Explore any domain (Ahrefs-style). Manual refresh = Open PageRank only; CDX runs on cron.
 */
export async function GET(req) {
  try {
    await requireSession(req);

    const target = resolveTargetDomain(req);
    let domain;
    let siteUrl;
    let explore = false;

    if (target?.error) return json({ error: target.error }, 400);
    if (target) {
      domain = target.domain;
      siteUrl = target.siteUrl;
      explore = target.explore;
    } else {
      const { siteUrl: resolvedUrl } = await resolveWebsiteAccess(req);
      siteUrl = resolvedUrl;
      domain = toDomain(siteUrl);
    }

    if (!domain) return json({ error: "Could not extract a domain." }, 400);

    const gscSiteUrl = await resolveGscSiteUrl(req, siteUrl, explore);

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
            await executeSiteExplorerRefresh(siteUrl, snapshotId, {
              includeReferring: false,
              includeCrawl: false,
            });
          });
        }
      }

      const body = runningPayload({
        domain,
        view,
        page,
        pageSize,
        latest,
        message:
          "Loading Open PageRank (DA, referring domains, homepage UR). Indexed pages update overnight via cron.",
      });
      await finalizePayload(body, domain, view, gscSiteUrl, page, pageSize);
      return json(body, 202);
    }

    const { latest, running, failedToday } = await getLatestSiteExplorer(domain);

    if (running) {
      const body = runningPayload({
        domain,
        view,
        page,
        pageSize,
        latest,
        message: "Analysis in progress — showing last saved data until ready.",
      });
      await finalizePayload(body, domain, view, gscSiteUrl, page, pageSize);
      return json(body);
    }

    if (latest) {
      const body = snapshotToApiPayload(latest, { view, page, pageSize });
      body.explore = explore;
      await finalizePayload(body, domain, view, gscSiteUrl, page, pageSize);
      return json(body);
    }

    if (failedToday?.errorMessage && !explore) {
      return json(
        {
          error: failedToday.errorMessage,
          hint: "Try Analyze again. Common Crawl runs on the nightly cron only.",
        },
        502
      );
    }

    const body = emptySiteExplorerPayload(domain, view);
    body.explore = explore;
    await finalizePayload(body, domain, view, gscSiteUrl, page, pageSize);
    if (body.authority?.found) {
      body.empty = false;
      body.message = "Open PageRank loaded. Click Analyze to save today's snapshot. Indexed pages fill in overnight.";
    }
    return json(body);
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("Site explorer API error:", error);
    const hint = migrationHint(error);
    return json({ error: hint || error.message || "Failed to load site explorer data." }, status);
  }
}
