import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import prisma from "../../../../lib/prisma";
import { ROLES } from "../../../../lib/rbac";
import { normalizeSiteOrigin } from "../../../../lib/validation";
import {
  describeReportPeriod,
  formatYearMonth,
  getCalendarMonthRange,
} from "../../../../lib/smmReportMonthRange";

export const runtime = "nodejs";

function toDateOnly(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toEndOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function getDateRange(range) {
  const end = toEndOfDay(new Date());
  const start = new Date(end);
  start.setHours(0, 0, 0, 0);
  switch (range) {
    case "7d":
      start.setDate(start.getDate() - 6);
      break;
    case "28d":
      start.setDate(start.getDate() - 27);
      break;
    case "3m":
      start.setMonth(start.getMonth() - 3);
      break;
    case "12m":
      start.setFullYear(start.getFullYear() - 1);
      break;
    default:
      start.setDate(start.getDate() - 27);
      break;
  }
  return { start, end };
}

function fmtDate(value) {
  const d = new Date(value);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function pctChange(current, previous) {
  const curr = Number(current || 0);
  const prev = Number(previous || 0);
  if (prev <= 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

function canonicalSmmPlatform(value) {
  const k = String(value || "").toLowerCase();
  return k === "x" ? "tiktok" : k;
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function buildMonthlyBreakdownFromRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const d = new Date(row.statDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const cur = map.get(key) || { monthKey: key, reach: 0, engagements: 0 };
    cur.reach += Number(row.reach || 0);
    cur.engagements += Number(row.engagements || 0);
    map.set(key, cur);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({
      ...v,
      monthLabel: `${MONTH_SHORT[parseInt(key.slice(5, 7), 10) - 1]} ${key.slice(0, 4)}`,
    }));
}

function extractAccountName(accountHandle, fallbackName, fallbackPlatform) {
  const raw = String(accountHandle || "").trim();
  if (raw) {
    if (raw.startsWith("@")) {
      return raw.slice(1).trim();
    }
    try {
      const parsed = new URL(raw);
      const parts = parsed.pathname.split("/").filter(Boolean);
      const first = parts[0] || "";
      if (first.startsWith("@")) return first.slice(1).trim();
      if (first) return first.trim();
    } catch {
      return raw.replace(/^@/, "").trim();
    }
  }
  return String(fallbackName || fallbackPlatform || "").trim();
}

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
    const range = req.nextUrl.searchParams.get("range") || "28d";
    const platform = (req.nextUrl.searchParams.get("platform") || "all").toLowerCase();
    const endMonthParam = req.nextUrl.searchParams.get("endMonth");
    const monthSpanParam = req.nextUrl.searchParams.get("monthSpan");

    const fallbackSite =
      session.user.siteLink ||
      (Array.isArray(session.user.accessibleSites) && session.user.accessibleSites.length
        ? session.user.accessibleSites[0]
        : "");

    const hasGlobalAccess = role === ROLES.SUPER_ADMIN || role === ROLES.SMM;

    let targetSite = hasGlobalAccess
        ? (req.nextUrl.searchParams.get("url") || fallbackSite || "")
        : fallbackSite;

    // Resolve targetSite to siteLink if it is a Meta Page ID
    let resolvedSiteLink = targetSite;
    if (targetSite) {
      const mappedSite = await prisma.site.findFirst({
        where: {
          OR: [
            { facebookPageId: targetSite },
            { instagramUserId: targetSite },
            { siteUrl: targetSite }
          ]
        },
        select: { siteUrl: true }
      });

      if (mappedSite?.siteUrl) {
        resolvedSiteLink = mappedSite.siteUrl;
      } else {
        // Fallback for older configurations mapped to users
        const mappedUser = await prisma.user.findFirst({
          where: {
            OR: [
              { facebookPageId: targetSite },
              { instagramUserId: targetSite }
            ]
          },
          select: { siteLink: true }
        });
        if (mappedUser?.siteLink) {
          resolvedSiteLink = mappedUser.siteLink;
        }
      }
    }

    const targetSiteNormalized = normalizeSiteOrigin(resolvedSiteLink);
    if (!targetSiteNormalized) {
      return new Response(
        JSON.stringify({
          error: "No site selected.",
          setup: {
            message: "Please integrate a site first, then add GTM container ID for tracking.",
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (role === ROLES.USER) {
      const ownSite = normalizeSiteOrigin(session.user.siteLink || "");
      if (!ownSite || ownSite !== targetSiteNormalized) {
        return new Response(JSON.stringify({ error: "Access denied for selected site." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (role === ROLES.VIEWER || role === ROLES.SMM) {
      const allowed = new Set(
        (session.user.accessibleSites || []).map((s) => normalizeSiteOrigin(s)).filter(Boolean)
      );
      const ownLink = normalizeSiteOrigin(session.user.siteLink || "");
      if (ownLink) allowed.add(ownLink);
      if (!allowed.size || !allowed.has(targetSiteNormalized)) {
        return new Response(JSON.stringify({ error: "Access denied for selected site." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    let start;
    let end;
    let rangeEffective = range;
    let reportMeta = null;

    if (endMonthParam && /^(\d{4})-(\d{2})$/.test(String(endMonthParam).trim())) {
      const span = [1, 2, 3].includes(Number(monthSpanParam)) ? Number(monthSpanParam) : 1;
      const { start: rs, end: re, endMonthClamped, monthSpan } = getCalendarMonthRange(endMonthParam, span);
      start = rs;
      end = re;
      rangeEffective = `months:${monthSpan}m:end:${endMonthClamped}`;
      reportMeta = {
        mode: "calendar_months",
        monthSpan,
        endMonth: endMonthClamped,
        start: start.toISOString(),
        end: end.toISOString(),
        periodLabel: describeReportPeriod(start, end, monthSpan),
      };
    } else {
      const r = getDateRange(range);
      start = r.start;
      end = r.end;
    }
    const platformWhere =
      platform !== "all"
        ? platform === "tiktok"
          ? { platform: { in: ["tiktok", "x"] } }
          : { platform }
        : {};
    const filter = {
      siteLink: targetSiteNormalized,
      statDate: { gte: start, lte: end },
      ...platformWhere,
    };

    const rawRows = await prisma.socialMediaDailyStat.findMany({
      where: filter,
      orderBy: [{ statDate: "asc" }, { platform: "asc" }],
    });
    const rows = rawRows.filter((r) => String(r.platform || "").toLowerCase() !== "linkedin");

    const globalSite = await prisma.site.findUnique({
      where: { siteUrl: targetSiteNormalized }
    });

    const usersForSite = await prisma.user.findMany({
      where: { siteLink: targetSiteNormalized },
      select: { id: true, email: true, name: true, gtmContainerId: true },
      orderBy: { createdAt: "asc" },
    });

    const gtmContainerId = globalSite?.gtmContainerId || usersForSite[0]?.gtmContainerId || null;

    const monthlyBreakdown = buildMonthlyBreakdownFromRows(rows);

    if (!rows.length) {
      return new Response(
        JSON.stringify({
          siteUrl: targetSiteNormalized,
          range: rangeEffective,
          platform,
          monthlyBreakdown,
          summary: {
            totalReach: 0,
            totalEngagements: 0,
            followers: 0,
            queuedPosts: 0,
            queuedReels: 0,
          },
          platformCards: [],
          timeSeries: [],
          accounts: [],
          setup: {
            message: "No SMM stats received yet. Configure GTM and push daily platform metrics to /api/smm/collect.",
            gtmContainerId,
          },
          currentYearMonth: formatYearMonth(new Date()),
          reportMeta:
            reportMeta || {
              mode: "rolling",
              start: start.toISOString(),
              end: end.toISOString(),
              periodLabel: `${rangeEffective} (rolling window)`,
            },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const latestByPlatform = new Map();
    const previousByPlatform = new Map();
    for (const row of rows) {
      const key = canonicalSmmPlatform(row.platform);
      const normalizedRow = { ...row, platform: key };
      const prev = latestByPlatform.get(key);
      if (!prev || new Date(row.statDate) >= new Date(prev.statDate)) {
        if (prev) previousByPlatform.set(key, prev);
        latestByPlatform.set(key, normalizedRow);
      }
    }

    const platformCards = Array.from(latestByPlatform.values()).map((row) => {
      const prev = previousByPlatform.get(row.platform);
      const prevFollowers = prev?.followers || 0;
      const deltaFollowers = row.followers - prevFollowers;
      return {
        platform: row.platform,
        accountName: extractAccountName(row.accountHandle, row.accountName, row.platform),
        accountHandle: row.accountHandle || "",
        followers: row.followers,
        deltaFollowers,
        reach: row.reach,
        engagements: row.engagements,
      };
    });

    const byDate = new Map();
    rows.forEach((row) => {
      const key = fmtDate(row.statDate);
      const current = byDate.get(key) || { date: key, reach: 0, engagements: 0 };
      current.reach += row.reach || 0;
      current.engagements += row.engagements || 0;
      byDate.set(key, current);
    });
    const timeSeries = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));

    const accounts = Array.from(latestByPlatform.values()).map((row) => {
      const prev = previousByPlatform.get(row.platform);
      return {
        platform: row.platform,
        accountName: extractAccountName(row.accountHandle, row.accountName, row.platform),
        accountHandle: row.accountHandle || "",
        reach: row.reach || 0,
        engagements: row.engagements || 0,
        queuedPosts: row.queuedPosts || 0,
        queuedReels: row.queuedReels || 0,
        followers: row.followers || 0,
        reachChangePct: pctChange(row.reach || 0, prev?.reach || 0),
        engagementsChangePct: pctChange(row.engagements || 0, prev?.engagements || 0),
      };
    });

    const summary = accounts.reduce(
      (acc, row) => {
        acc.totalReach += row.reach;
        acc.totalEngagements += row.engagements;
        acc.followers += row.followers;
        acc.queuedPosts += row.queuedPosts;
        acc.queuedReels += row.queuedReels;
        return acc;
      },
      { totalReach: 0, totalEngagements: 0, followers: 0, queuedPosts: 0, queuedReels: 0 }
    );

    return new Response(
      JSON.stringify({
        siteUrl: targetSiteNormalized,
        range: rangeEffective,
        platform,
        monthlyBreakdown,
        reportMeta: reportMeta || {
          mode: "rolling",
          start: start.toISOString(),
          end: end.toISOString(),
          periodLabel: `${rangeEffective} (rolling window)`,
        },
        summary,
        platformCards,
        timeSeries,
        accounts,
        setup: {
          gtmContainerId,
          users: usersForSite.map((u) => ({
            id: u.id,
            email: u.email,
            name: u.name,
            gtmContainerId: u.gtmContainerId || null,
          })),
        },
        lastUpdated: new Date().toISOString(),
        /** YYYY-MM of current month (for report UI defaults). */
        currentYearMonth: formatYearMonth(new Date()),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to fetch SMM stats." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

