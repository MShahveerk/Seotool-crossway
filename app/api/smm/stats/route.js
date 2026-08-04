import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import prisma from "../../../../lib/prisma";
import { ROLES } from "../../../../lib/rbac";
import { canAccessSection } from "../../../../lib/modulePermissions";
import { loadMetaAccounts } from "../../../../lib/metaAccounts";
import {
  fetchFacebookInsightsDaily,
  fetchFacebookPageLive,
  fetchInstagramInsightsDaily,
  fetchInstagramLive,
  metaAccessTokens,
  resolvePageAccessToken,
} from "../../../../lib/metaGraph";
import { normalizeSiteOrigin } from "../../../../lib/validation";
import {
  isMetaPageId,
  resolveSiteEquivalents,
  sessionCanAccessSiteAsync,
} from "../../../../lib/siteAccess";
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

    if (!canAccessSection(session.user, "smm-statistics")) {
      return new Response(JSON.stringify({ error: "Forbidden: SMM Statistics access not granted." }), {
        status: 403,
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
      const isLikelyMetaId = /^\d+$/.test(String(targetSite).trim());

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
        } else {
          // Check daily stats history for page-to-site link mapping
          const statMatch = await prisma.socialMediaDailyStat.findFirst({
            where: {
              OR: [
                { accountHandle: targetSite },
                { accountName: targetSite }
              ]
            },
            select: { siteLink: true }
          });
          if (statMatch?.siteLink) {
            resolvedSiteLink = statMatch.siteLink;
          } else if (isLikelyMetaId) {
            if (fallbackSite && /^https?:\/\//i.test(fallbackSite)) {
              resolvedSiteLink = fallbackSite;
            } else {
              // Numeric Meta page ID with no linked website yet.
              // Use the page ID itself as the storage key — insights will still be fetched
              // from the Graph API and stored under this key, so the dashboard works standalone.
              resolvedSiteLink = targetSite;
            }
          }
        }
      }
    }

    // Normalize: for regular URLs use normalizeSiteOrigin; for numeric Meta page IDs pass through as-is
    const isRawMetaId = isMetaPageId(resolvedSiteLink);
    const targetSiteNormalized = isRawMetaId
      ? String(resolvedSiteLink).trim()
      : normalizeSiteOrigin(resolvedSiteLink);

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

    const siteEquivalents = await resolveSiteEquivalents(prisma, targetSite || targetSiteNormalized);
    if (!siteEquivalents.includes(targetSiteNormalized)) {
      siteEquivalents.push(targetSiteNormalized);
    }
    if (targetSite && !siteEquivalents.includes(String(targetSite).trim())) {
      siteEquivalents.push(String(targetSite).trim());
    }

    if (role === ROLES.USER) {
      const ownSite = normalizeSiteOrigin(session.user.siteLink || "");
      const ownOk =
        ownSite &&
        (ownSite === targetSiteNormalized ||
          siteEquivalents.some((k) => normalizeSiteOrigin(k) === ownSite || k === ownSite));
      if (!ownOk) {
        return new Response(JSON.stringify({ error: "Access denied for selected site." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (role === ROLES.VIEWER || role === ROLES.SMM) {
      if (!(await sessionCanAccessSiteAsync(prisma, session.user, siteEquivalents))) {
        return new Response(JSON.stringify({ error: "Access denied for selected site." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Auto-fetch live Meta statistics — never persist Graph failures as zero forever.
    if (metaAccessTokens().length) {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const forceRefresh = req.nextUrl.searchParams.get("refresh") === "true";
        const equivKeys = [...new Set((siteEquivalents || []).filter(Boolean))];
        if (!equivKeys.includes(targetSiteNormalized)) equivKeys.push(targetSiteNormalized);

        const existingMetaToday = await prisma.socialMediaDailyStat.findMany({
          where: {
            siteLink: { in: equivKeys },
            statDate: today,
            platform: { in: ["facebook", "instagram"] },
          },
          select: { followers: true, reach: true, engagements: true, platform: true },
        });
        // Reach-only days must not block a follower refresh — Meta often writes reach with followers=0.
        const hasUsableMetaToday = existingMetaToday.some((r) => Number(r.followers || 0) > 0);

        if (!existingMetaToday.length || forceRefresh || !hasUsableMetaToday) {
          const since = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
          const until = Math.floor(Date.now() / 1000);

          const siteRecord = await prisma.site.findFirst({
            where: {
              OR: equivKeys.flatMap((key) => [
                { siteUrl: key },
                { facebookPageId: key },
                { instagramUserId: key },
              ]),
            },
          });

          const linkedUsersForMeta = await prisma.user.findMany({
            where: {
              OR: [
                { siteLink: { in: equivKeys } },
                { facebookPageId: { in: equivKeys } },
                { instagramUserId: { in: equivKeys } },
              ],
            },
            select: {
              id: true,
              facebookPageId: true,
              instagramUserId: true,
              siteLink: true,
              createdAt: true,
            },
            orderBy: { createdAt: "asc" },
          });

          // Stable owner so Dashboard (owner-scoped reads) and live pulls share the same rows.
          let ownerUserId =
            linkedUsersForMeta[0]?.id ||
            (
              await prisma.socialMediaDailyStat.findFirst({
                where: { siteLink: { in: equivKeys } },
                orderBy: { statDate: "desc" },
                select: { userId: true },
              })
            )?.userId ||
            session.user.id;

          const targetIsMetaId = /^\d+$/.test(String(targetSiteNormalized).trim());

          let fbPageId =
            siteRecord?.facebookPageId ||
            linkedUsersForMeta.find((u) => u.facebookPageId)?.facebookPageId ||
            session.user.facebookPageId ||
            (targetIsMetaId ? targetSiteNormalized : null);

          let igUserId =
            siteRecord?.instagramUserId ||
            linkedUsersForMeta.find((u) => u.instagramUserId)?.instagramUserId ||
            session.user.instagramUserId ||
            null;

          // Only auto-link when website URL matches a Graph page website — never blind pages[0]
          if (!fbPageId && !igUserId && !targetIsMetaId) {
            try {
              const loaded = await loadMetaAccounts({ includeDatabase: true });
              const matchedPage = (loaded.accounts || []).find((page) => {
                if (!page.siteLink) return false;
                const parsedWeb = normalizeSiteOrigin(page.siteLink);
                return parsedWeb && parsedWeb === targetSiteNormalized;
              });
              if (matchedPage?.facebookPageId) {
                fbPageId = matchedPage.facebookPageId;
                igUserId = matchedPage.instagramUserId || null;
                if (siteRecord) {
                  await prisma.site.update({
                    where: { id: siteRecord.id },
                    data: { facebookPageId: fbPageId, instagramUserId: igUserId },
                  });
                }
              }
            } catch (discErr) {
              console.warn("Failed to auto-discover Meta accounts:", discErr.message);
            }
          }

          const writeKeys = [
            ...new Set(
              [
                targetSiteNormalized,
                siteRecord?.siteUrl ? normalizeSiteOrigin(siteRecord.siteUrl) : null,
                fbPageId && /^\d+$/.test(String(fbPageId)) ? String(fbPageId) : null,
                igUserId && /^\d+$/.test(String(igUserId)) ? String(igUserId) : null,
              ].filter(Boolean)
            ),
          ];

          const lastKnownFollowerCache = new Map();
          async function resolveFollowersForWrite(platform, siteLink, liveFollowers) {
            const live = Number(liveFollowers);
            if (Number.isFinite(live) && live > 0) return live;
            const cacheKey = `${platform}::${siteLink}`;
            if (lastKnownFollowerCache.has(cacheKey)) return lastKnownFollowerCache.get(cacheKey);
            const prior = await prisma.socialMediaDailyStat.findFirst({
              where: {
                userId: ownerUserId,
                siteLink,
                platform,
                followers: { gt: 0 },
              },
              orderBy: { statDate: "desc" },
              select: { followers: true },
            });
            const known = Number(prior?.followers || 0);
            lastKnownFollowerCache.set(cacheKey, known);
            return known;
          }

          async function upsertPlatformDays({
            platform,
            days,
            followers,
            accountName,
            accountHandle,
          }) {
            if (!days?.size) return;
            const liveFollowers = Number(followers);
            const hasLiveFollowers = Number.isFinite(liveFollowers) && liveFollowers > 0;
            // Only persist when we have real followers or non-zero day metrics — never stamp a day of zeros.
            const usableDays = [...days.entries()].filter(([, val]) => {
              return (
                hasLiveFollowers ||
                Number(val.reach || 0) > 0 ||
                Number(val.engagements || 0) > 0
              );
            });
            if (!usableDays.length) return;

            for (const [, val] of usableDays) {
              const statDate = new Date(val.statDate);
              statDate.setHours(0, 0, 0, 0);
              for (const siteLink of writeKeys) {
                const followerCount = await resolveFollowersForWrite(platform, siteLink, followers);
                const hasFollowers = followerCount > 0;
                const update = {
                  reach: val.reach,
                  engagements: val.engagements,
                  accountName,
                  accountHandle,
                  source: "meta_graph",
                };
                if (hasFollowers) update.followers = followerCount;
                await prisma.socialMediaDailyStat.upsert({
                  where: {
                    userId_siteLink_platform_statDate: {
                      userId: ownerUserId,
                      siteLink,
                      platform,
                      statDate,
                    },
                  },
                  update,
                  create: {
                    userId: ownerUserId,
                    siteLink,
                    platform,
                    statDate,
                    followers: hasFollowers ? followerCount : 0,
                    reach: val.reach,
                    engagements: val.engagements,
                    accountName,
                    accountHandle,
                    queuedPosts: 0,
                    queuedReels: 0,
                    source: "meta_graph",
                  },
                });
              }
            }
          }

          if (fbPageId && /^\d+$/.test(String(fbPageId).trim())) {
            const pageToken = await resolvePageAccessToken(fbPageId);
            const tokens = pageToken ? [pageToken] : [];
            const live = await fetchFacebookPageLive(fbPageId, { tokens });
            const insights = await fetchFacebookInsightsDaily(fbPageId, since, until, { tokens });
            if (!live.ok && !insights.ok) {
              console.warn(`Skipping FB write for ${fbPageId}: ${live.error || insights.error}`);
            } else if (!(Number(live.followers) > 0) && !insights.ok) {
              console.warn(
                `Skipping FB write for ${fbPageId}: live followers unavailable (${live.error || "0"})`
              );
            } else {
              const days =
                insights.days?.size > 0
                  ? insights.days
                  : new Map([
                      [
                        today.toISOString().slice(0, 10),
                        { statDate: today, reach: 0, engagements: 0 },
                      ],
                    ]);
              try {
                await upsertPlatformDays({
                  platform: "facebook",
                  days,
                  followers: live.followers,
                  accountName: live.name || "Facebook Page",
                  accountHandle: String(fbPageId),
                });
                console.info(
                  `[SMM] FB live ok page=${fbPageId} followers=${live.followers ?? "n/a"} days=${days.size}`
                );
              } catch (dbErr) {
                console.error(`Failed to write FB stats for ${fbPageId}:`, dbErr.message);
              }
            }
          }

          if (igUserId && /^\d+$/.test(String(igUserId).trim())) {
            const pageToken = fbPageId ? await resolvePageAccessToken(fbPageId) : null;
            const tokens = pageToken ? [pageToken] : [];
            const live = await fetchInstagramLive(igUserId, { tokens });
            const insights = await fetchInstagramInsightsDaily(igUserId, since, until, { tokens });
            if (!live.ok && !insights.ok) {
              console.warn(`Skipping IG write for ${igUserId}: ${live.error || insights.error}`);
            } else if (!(Number(live.followers) > 0) && !insights.ok) {
              console.warn(
                `Skipping IG write for ${igUserId}: live followers unavailable (${live.error || "0"})`
              );
            } else {
              const days =
                insights.days?.size > 0
                  ? insights.days
                  : new Map([
                      [
                        today.toISOString().slice(0, 10),
                        { statDate: today, reach: 0, engagements: 0 },
                      ],
                    ]);
              try {
                await upsertPlatformDays({
                  platform: "instagram",
                  days,
                  followers: live.followers,
                  accountName: live.username || "Instagram Account",
                  accountHandle: live.username || String(igUserId),
                });
                console.info(
                  `[SMM] IG live ok id=${igUserId} followers=${live.followers ?? "n/a"} days=${days.size}`
                );
              } catch (dbErr) {
                console.error(`Failed to write IG stats for ${igUserId}:`, dbErr.message);
              }
            }
          }
        }
      } catch (err) {
        console.error("Auto-fetch error during SMM stats request:", err.message);
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
    // Same equivalent key set as live Meta writes + reports (resolveSiteEquivalents).
    const equivalentSites = [...(siteEquivalents || []), targetSiteNormalized];
    const linkedSite = await prisma.site.findFirst({
      where: {
        OR: [
          { siteUrl: targetSiteNormalized },
          { facebookPageId: targetSiteNormalized },
          { instagramUserId: targetSiteNormalized },
        ],
      },
    });
    if (linkedSite) {
      if (linkedSite.siteUrl) equivalentSites.push(linkedSite.siteUrl);
      if (linkedSite.facebookPageId) equivalentSites.push(linkedSite.facebookPageId);
      if (linkedSite.instagramUserId) equivalentSites.push(linkedSite.instagramUserId);
    }
    const linkedUsers = await prisma.user.findMany({
      where: {
        OR: [
          { siteLink: targetSiteNormalized },
          { facebookPageId: targetSiteNormalized },
          { instagramUserId: targetSiteNormalized },
        ],
      },
    });
    for (const u of linkedUsers) {
      if (u.siteLink) equivalentSites.push(u.siteLink);
      if (u.facebookPageId) equivalentSites.push(u.facebookPageId);
      if (u.instagramUserId) equivalentSites.push(u.instagramUserId);
    }
    const uniqueEquivalents = Array.from(
      new Set(
        equivalentSites
          .map((s) => {
            if (/^\d+$/.test(String(s).trim())) return String(s).trim();
            return normalizeSiteOrigin(s);
          })
          .filter(Boolean)
      )
    );

    const filter = {
      siteLink: { in: uniqueEquivalents },
      statDate: { gte: start, lte: end },
      ...platformWhere,
    };

    const [rawRows, knownFollowerRows] = await Promise.all([
      prisma.socialMediaDailyStat.findMany({
        where: filter,
        orderBy: [{ statDate: "asc" }, { platform: "asc" }],
      }),
      // Forward-fill: reports often show historical baselines while newest Meta days have followers=0.
      prisma.socialMediaDailyStat.findMany({
        where: {
          siteLink: { in: uniqueEquivalents },
          followers: { gt: 0 },
          ...platformWhere,
        },
        orderBy: [{ statDate: "desc" }],
        select: {
          platform: true,
          followers: true,
          accountName: true,
          accountHandle: true,
          statDate: true,
          reach: true,
          engagements: true,
        },
      }),
    ]);
    const rows = rawRows.filter((r) => String(r.platform || "").toLowerCase() !== "linkedin");
    const lastKnownByPlatform = new Map();
    for (const row of knownFollowerRows) {
      const key = canonicalSmmPlatform(row.platform);
      if (!key || key === "linkedin" || lastKnownByPlatform.has(key)) continue;
      lastKnownByPlatform.set(key, { ...row, platform: key });
    }

    const globalSite = await prisma.site.findFirst({
      where: {
        OR: [
          { siteUrl: { in: uniqueEquivalents } },
          { facebookPageId: { in: uniqueEquivalents } },
          { instagramUserId: { in: uniqueEquivalents } }
        ]
      }
    });

    const usersForSite = await prisma.user.findMany({
      where: {
        OR: [
          { siteLink: { in: uniqueEquivalents } },
          { facebookPageId: { in: uniqueEquivalents } },
          { instagramUserId: { in: uniqueEquivalents } }
        ]
      },
      select: {
        id: true,
        email: true,
        name: true,
        gtmContainerId: true,
        facebookPageId: true,
        instagramUserId: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const gtmContainerId = globalSite?.gtmContainerId || usersForSite[0]?.gtmContainerId || null;
    const setupFacebookPageId =
      globalSite?.facebookPageId ||
      usersForSite.find((u) => u.facebookPageId)?.facebookPageId ||
      null;
    const setupInstagramUserId =
      globalSite?.instagramUserId ||
      usersForSite.find((u) => u.instagramUserId)?.instagramUserId ||
      null;

    const monthlyBreakdown = buildMonthlyBreakdownFromRows(rows);

    const hasMetaConfig = Boolean(
      setupFacebookPageId ||
      setupInstagramUserId ||
      /^\d+$/.test(String(targetSiteNormalized).trim())
    );

    const hasMetaToken = metaAccessTokens().length > 0;
    let setupMessage = "No SMM stats received yet. Configure GTM and push daily platform metrics to /api/smm/collect.";
    if (hasMetaToken) {
      if (!hasMetaConfig) {
        setupMessage = "No Facebook Page or Instagram Account is linked to this website. Link a Facebook Page ID or Instagram User ID in User Management or Site Settings to view live SMM analytics.";
      } else {
        setupMessage = "No SMM statistics found in the database. Click the Refresh button in the top right to pull the latest live data from Meta.";
      }
    } else {
      setupMessage =
        "META_PAGE_ACCESS_TOKEN is not set on the server. Add it in Render env (Page or System User token), redeploy, then Refresh.";
    }

    const latestByPlatform = new Map();
    const previousByPlatform = new Map();
    for (const row of rows) {
      const key = canonicalSmmPlatform(row.platform);
      const normalizedRow = { ...row, platform: key };
      const prev = latestByPlatform.get(key);
      const rowDate = new Date(row.statDate).getTime();
      const prevDate = prev ? new Date(prev.statDate).getTime() : 0;
      const better =
        !prev ||
        rowDate > prevDate ||
        (rowDate === prevDate && Number(row.followers || 0) >= Number(prev.followers || 0));
      if (better) {
        if (prev && rowDate > prevDate) previousByPlatform.set(key, prev);
        else if (prev && !previousByPlatform.has(key)) previousByPlatform.set(key, prev);
        latestByPlatform.set(key, normalizedRow);
      } else if (prev && rowDate < prevDate && !previousByPlatform.has(key)) {
        previousByPlatform.set(key, normalizedRow);
      }
    }

    // If the window has no rows, still surface last-known follower baselines (same as reports).
    if (!latestByPlatform.size && lastKnownByPlatform.size) {
      for (const [key, row] of lastKnownByPlatform.entries()) {
        latestByPlatform.set(key, row);
      }
    }

    function resolvedFollowers(platform, row) {
      const current = Number(row?.followers || 0);
      if (current > 0) return current;
      return Number(lastKnownByPlatform.get(platform)?.followers || 0);
    }

    const platformCards = Array.from(latestByPlatform.values()).map((row) => {
      const prev = previousByPlatform.get(row.platform);
      const followers = resolvedFollowers(row.platform, row);
      const prevFollowers = resolvedFollowers(row.platform, prev) || Number(prev?.followers || 0);
      const deltaFollowers = followers - prevFollowers;
      const known = lastKnownByPlatform.get(row.platform);
      return {
        platform: row.platform,
        accountName: extractAccountName(
          row.accountHandle || known?.accountHandle,
          row.accountName || known?.accountName,
          row.platform
        ),
        accountHandle: row.accountHandle || known?.accountHandle || "",
        followers,
        deltaFollowers,
        reach: row.reach,
        engagements: row.engagements,
      };
    });

    if (!rows.length && !platformCards.length) {
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
            message: setupMessage,
            gtmContainerId,
            facebookPageId: setupFacebookPageId,
            instagramUserId: setupInstagramUserId,
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
      const known = lastKnownByPlatform.get(row.platform);
      const followers = resolvedFollowers(row.platform, row);
      return {
        platform: row.platform,
        accountName: extractAccountName(
          row.accountHandle || known?.accountHandle,
          row.accountName || known?.accountName,
          row.platform
        ),
        accountHandle: row.accountHandle || known?.accountHandle || "",
        reach: row.reach || 0,
        engagements: row.engagements || 0,
        queuedPosts: row.queuedPosts || 0,
        queuedReels: row.queuedReels || 0,
        followers,
        reachChangePct: pctChange(row.reach || 0, prev?.reach || 0),
        engagementsChangePct: pctChange(row.engagements || 0, prev?.engagements || 0),
      };
    });

    const summary = {
      totalReach: accounts.reduce((s, r) => s + (r.reach || 0), 0),
      totalEngagements: accounts.reduce((s, r) => s + (r.engagements || 0), 0),
      followers: platformCards.reduce((s, r) => s + Number(r.followers || 0), 0),
      queuedPosts: accounts.reduce((s, r) => s + (r.queuedPosts || 0), 0),
      queuedReels: accounts.reduce((s, r) => s + (r.queuedReels || 0), 0),
    };

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
          facebookPageId: setupFacebookPageId,
          instagramUserId: setupInstagramUserId,
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

