/**
 * Build social media report data with follower and activity trends for client PDFs.
 */
import { isMetaPageId, resolveSiteEquivalents } from "./siteAccess.js";
import { normalizeSiteOrigin } from "./validation.js";
import { getCalendarMonthYmdBounds, humanMonthYear, parseYearMonth } from "./smmReportMonthRange.js";

const PDF_PLATFORMS = [
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "youtube", label: "YouTube" },
  { key: "tiktok", label: "TikTok" },
];

function canonicalPlatformKey(value) {
  const k = String(value || "").toLowerCase().trim();
  return k === "x" ? "tiktok" : k;
}

function toDateOnly(ymd) {
  const d = new Date(`${ymd}T12:00:00`);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmtYmd(d) {
  const x = d instanceof Date ? d : new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftDays(ymd, days) {
  const d = toDateOnly(ymd);
  d.setDate(d.getDate() + days);
  return fmtYmd(d);
}

function priorYearMonth(ymStr) {
  const p = parseYearMonth(ymStr);
  if (!p) return null;
  let y = p.y;
  let mo = p.mo - 1;
  if (mo < 0) {
    mo = 11;
    y -= 1;
  }
  return `${y}-${String(mo + 1).padStart(2, "0")}`;
}

/** Latest row per platform on or before a date; prefer non-zero followers over newer zeros. */
function latestFollowersByPlatform(rows, onOrBeforeYmd) {
  const cutoff = toDateOnly(onOrBeforeYmd).getTime();
  const map = new Map();
  for (const row of rows) {
    const pk = canonicalPlatformKey(row.platform);
    if (!pk || pk === "linkedin") continue;
    const t = toDateOnly(row.statDate).getTime();
    if (t > cutoff) continue;
    const prev = map.get(pk);
    if (!prev) {
      map.set(pk, row);
      continue;
    }
    const prevT = toDateOnly(prev.statDate).getTime();
    const rowFollowers = Number(row.followers || 0);
    const prevFollowers = Number(prev.followers || 0);
    if (t > prevT) {
      // Newer day wins for activity date, but keep prior followers if the new day is 0.
      map.set(pk, rowFollowers > 0 || prevFollowers <= 0 ? row : { ...row, followers: prevFollowers });
    } else if (t === prevT && rowFollowers >= prevFollowers) {
      map.set(pk, row);
    } else if (t < prevT && prevFollowers <= 0 && rowFollowers > 0) {
      map.set(pk, { ...prev, followers: rowFollowers, accountName: row.accountName || prev.accountName, accountHandle: row.accountHandle || prev.accountHandle });
    }
  }
  return map;
}

function sumActivity(rows, startYmd, endYmd) {
  const start = toDateOnly(startYmd).getTime();
  const end = toDateOnly(endYmd).getTime();
  const byPlatform = new Map();
  let totalReach = 0;
  let totalEngagements = 0;

  for (const row of rows) {
    const pk = canonicalPlatformKey(row.platform);
    if (!pk || pk === "linkedin") continue;
    const t = toDateOnly(row.statDate).getTime();
    if (t < start || t > end) continue;
    const reach = Number(row.reach || 0);
    const engagements = Number(row.engagements || 0);
    totalReach += reach;
    totalEngagements += engagements;
    const cur = byPlatform.get(pk) || { reach: 0, engagements: 0 };
    cur.reach += reach;
    cur.engagements += engagements;
    byPlatform.set(pk, cur);
  }

  return { totalReach, totalEngagements, byPlatform };
}

function extractAccountLabel(row) {
  const handle = String(row?.accountHandle || "").trim();
  const name = String(row?.accountName || "").trim();
  if (handle.startsWith("@")) return handle.slice(1);
  if (handle) return handle;
  return name || "Not configured";
}

async function resolveOwnerAndEquivalents(prisma, siteKey) {
  const key = String(siteKey || "").trim();
  if (!key) return { equivalents: [], ownerUserId: null, siteUrl: null };

  let resolvedSiteLink = key;
  const mappedSite = await prisma.site.findFirst({
    where: { OR: [{ facebookPageId: key }, { instagramUserId: key }, { siteUrl: key }] },
    select: { siteUrl: true },
  });
  if (mappedSite?.siteUrl) {
    resolvedSiteLink = mappedSite.siteUrl;
  } else {
    const mappedUser = await prisma.user.findFirst({
      where: { OR: [{ facebookPageId: key }, { instagramUserId: key }] },
      select: { siteLink: true },
    });
    if (mappedUser?.siteLink) resolvedSiteLink = mappedUser.siteLink;
  }

  const targetSiteNormalized = isMetaPageId(resolvedSiteLink)
    ? String(resolvedSiteLink).trim()
    : normalizeSiteOrigin(resolvedSiteLink);
  if (!targetSiteNormalized) return { equivalents: [], ownerUserId: null, siteUrl: null };

  const equivalentSites = await resolveSiteEquivalents(prisma, key);
  if (!equivalentSites.includes(targetSiteNormalized)) equivalentSites.push(targetSiteNormalized);

  let ownerUser = await prisma.user.findFirst({
    where: {
      OR: [
        { siteLink: { in: equivalentSites } },
        { facebookPageId: { in: equivalentSites } },
        { instagramUserId: { in: equivalentSites } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!ownerUser) {
    const statOwner = await prisma.socialMediaDailyStat.findFirst({
      where: { siteLink: { in: equivalentSites } },
      orderBy: { statDate: "desc" },
      select: { userId: true },
    });
    ownerUser = statOwner?.userId ? { id: statOwner.userId } : null;
  }

  return {
    equivalents: equivalentSites,
    ownerUserId: ownerUser?.id || null,
    siteUrl: targetSiteNormalized,
  };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} siteKey
 * @param {string} reportMonth - YYYY-MM
 */
export async function fetchSmmReportData(prisma, siteKey, reportMonth) {
  const bounds = getCalendarMonthYmdBounds(reportMonth);
  if (!bounds) {
    return {
      periodLabel: humanMonthYear(reportMonth),
      reportMonth,
      platforms: [],
      totals: null,
      activity: null,
      summaryLines: ["We could not build a report for this month."],
      hasTrendData: false,
    };
  }

  const { equivalents, siteUrl } = await resolveOwnerAndEquivalents(prisma, siteKey);
  if (!equivalents.length) {
    return {
      periodLabel: humanMonthYear(reportMonth),
      reportMonth,
      platforms: [],
      totals: null,
      activity: null,
      summaryLines: ["No social accounts are linked yet."],
      hasTrendData: false,
    };
  }

  const priorMonth = priorYearMonth(bounds.yearMonth);
  const priorBounds = priorMonth ? getCalendarMonthYmdBounds(priorMonth) : null;
  const weekAgoYmd = shiftDays(bounds.endDate, -7);

  const historyStart = priorBounds?.startDate || bounds.startDate;
  const rows = await prisma.socialMediaDailyStat.findMany({
    where: {
      siteLink: { in: equivalents },
      statDate: { gte: toDateOnly(historyStart), lte: toDateOnly(bounds.endDate) },
    },
    orderBy: [{ statDate: "asc" }, { platform: "asc" }],
  });

  const monthEndMap = latestFollowersByPlatform(rows, bounds.endDate);
  const weekAgoMap = latestFollowersByPlatform(rows, weekAgoYmd);
  const priorMonthEndMap = priorBounds
    ? latestFollowersByPlatform(rows, priorBounds.endDate)
    : new Map();

  const monthActivity = sumActivity(rows, bounds.startDate, bounds.endDate);
  const priorActivity = priorBounds
    ? sumActivity(rows, priorBounds.startDate, priorBounds.endDate)
    : { totalReach: 0, totalEngagements: 0, byPlatform: new Map() };

  const platforms = PDF_PLATFORMS.map(({ key, label }) => {
    const current = monthEndMap.get(key);
    const weekRow = weekAgoMap.get(key);
    const priorRow = priorMonthEndMap.get(key);
    const followers = Number(current?.followers || 0);
    const weekFollowers = Number(weekRow?.followers ?? followers);
    const monthFollowers = Number(priorRow?.followers ?? followers);
    const activity = monthActivity.byPlatform.get(key) || { reach: 0, engagements: 0 };
    const priorAct = priorActivity.byPlatform.get(key) || { reach: 0, engagements: 0 };

    return {
      platform: label,
      platformKey: key,
      accountName: current
        ? extractAccountLabel(current)
        : weekRow
          ? extractAccountLabel(weekRow)
          : "Not configured",
      followers,
      weekChange: followers - weekFollowers,
      monthChange: followers - monthFollowers,
      reach: activity.reach,
      priorReach: priorAct.reach,
      reachChange: activity.reach - priorAct.reach,
      engagements: activity.engagements,
      priorEngagements: priorAct.engagements,
      engagementsChange: activity.engagements - priorAct.engagements,
      hasData: Boolean(current || weekRow || priorRow),
    };
  });

  const totals = platforms.reduce(
    (acc, p) => {
      acc.followers += p.followers;
      acc.weekChange += p.weekChange;
      acc.monthChange += p.monthChange;
      acc.reach += p.reach;
      acc.priorReach += p.priorReach;
      acc.engagements += p.engagements;
      acc.priorEngagements += p.priorEngagements;
      return acc;
    },
    {
      followers: 0,
      weekChange: 0,
      monthChange: 0,
      reach: 0,
      priorReach: 0,
      engagements: 0,
      priorEngagements: 0,
    }
  );

  totals.reachChange = totals.reach - totals.priorReach;
  totals.engagementsChange = totals.engagements - totals.priorEngagements;

  const hasTrendData = platforms.some((p) => p.hasData && p.followers > 0);
  const summaryLines = buildPlainSummary({
    periodLabel: humanMonthYear(bounds.yearMonth),
    priorPeriodLabel: priorBounds ? humanMonthYear(priorBounds.yearMonth) : null,
    totals,
    hasTrendData,
  });

  return {
    siteUrl,
    periodLabel: humanMonthYear(bounds.yearMonth),
    reportMonth: bounds.yearMonth,
    dateRange: { startDate: bounds.startDate, endDate: bounds.endDate },
    priorDateRange: priorBounds
      ? { startDate: priorBounds.startDate, endDate: priorBounds.endDate, label: humanMonthYear(priorBounds.yearMonth) }
      : null,
    platforms,
    totals,
    activity: {
      reach: totals.reach,
      priorReach: totals.priorReach,
      engagements: totals.engagements,
      priorEngagements: totals.priorEngagements,
    },
    summaryLines,
    hasTrendData,
  };
}

function trendPhrase(delta, unit) {
  const n = Math.round(Number(delta) || 0);
  if (n === 0) return `unchanged ${unit}`;
  if (n > 0) return `up ${Math.abs(n).toLocaleString("en-US")} ${unit}`;
  return `down ${Math.abs(n).toLocaleString("en-US")} ${unit}`;
}

function buildPlainSummary({ periodLabel, priorPeriodLabel, totals, hasTrendData }) {
  const lines = [];
  if (!hasTrendData) {
    lines.push(
      `This report covers ${periodLabel}. We are still collecting enough history to show week-over-week and month-over-month trends.`
    );
    return lines;
  }

  lines.push(
    `In ${periodLabel}, you had ${totals.followers.toLocaleString("en-US")} total followers across your linked accounts.`
  );
  lines.push(
    `Compared with last week, followers are ${trendPhrase(totals.weekChange, "overall")}. Compared with ${priorPeriodLabel || "the previous month"}, followers are ${trendPhrase(totals.monthChange, "overall")}.`
  );

  if (totals.reach > 0 || totals.priorReach > 0) {
    lines.push(
      `Your content reached about ${totals.reach.toLocaleString("en-US")} people this month${totals.priorReach > 0 ? `, ${trendPhrase(totals.reachChange, "compared with last month")}` : ""}.`
    );
  }
  if (totals.engagements > 0 || totals.priorEngagements > 0) {
    lines.push(
      `People interacted with your posts about ${totals.engagements.toLocaleString("en-US")} times this month${totals.priorEngagements > 0 ? ` (${trendPhrase(totals.engagementsChange, "vs last month")})` : ""}.`
    );
  }

  return lines;
}

/** Format signed delta for tables, e.g. "+15" or "-3". */
export function formatSignedDelta(n) {
  const v = Math.round(Number(n) || 0);
  if (v === 0) return "-";
  return v > 0 ? `+${v.toLocaleString("en-US")}` : `-${Math.abs(v).toLocaleString("en-US")}`;
}
