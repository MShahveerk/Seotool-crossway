import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { getSearchAnalyticsTimeSeries, getTopQueries, getTopPages, getTopCountries } from "../../../../lib/searchconsole";
import { ROLES } from "../../../../lib/rbac";
import { isValidUrl, normalizeSiteOrigin, validateAndNormalizeSiteUrl } from "../../../../lib/validation";
import { classifyError, ERROR_TYPES } from "../../../../lib/errorHandling";
import {
  getDateRangeForPresetId,
  isValidYMD,
  inclusiveDayCountYMD,
  densifyTimeSeries,
  clampSearchConsoleQueryRange,
} from "../../../../lib/searchConsoleDateRanges";

// Ensure this route runs in the Node.js runtime
export const runtime = "nodejs";

const MAX_SPAN_DAYS = 500;

/** Preset `range` values from the UI — must win over stray `startDate`/`endDate` query params. */
const PRESET_RANGE_IDS = new Set(["7d", "28d", "3m", "6m", "12m", "16m"]);

function resolveRange(rangeParam, startDateQ, endDateQ) {
  const r = String(rangeParam || "").trim();
  if (PRESET_RANGE_IDS.has(r)) {
    return { ...getDateRangeForPresetId(r), range: r };
  }
  if (isValidYMD(startDateQ) && isValidYMD(endDateQ) && startDateQ <= endDateQ) {
    if (inclusiveDayCountYMD(startDateQ, endDateQ) > MAX_SPAN_DAYS) {
      throw new Error(`Date range is too long (max ${MAX_SPAN_DAYS} days).`);
    }
    return { startDate: startDateQ, endDate: endDateQ, range: "custom" };
  }
  if (r) {
    return { ...getDateRangeForPresetId(r), range: r };
  }
  return { ...getDateRangeForPresetId("28d"), range: "28d" };
}

/**
 * GET /api/searchconsole/performance
 * Returns Search Console performance data with time-series and top queries
 */
export async function GET(req) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized. Please log in." }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const userRole = session.user.role || ROLES.USER;
    const rangeParam = req.nextUrl.searchParams.get("range");
    const startDateQ = req.nextUrl.searchParams.get("startDate");
    const endDateQ = req.nextUrl.searchParams.get("endDate");
    const compareStartQ = req.nextUrl.searchParams.get("compareStart");
    const compareEndQ = req.nextUrl.searchParams.get("compareEnd");
    const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
    const pageSize = parseInt(req.nextUrl.searchParams.get("pageSize") || "10");

    const sessionSiteFallback =
      session.user.siteLink ||
      (Array.isArray(session.user.accessibleSites) && session.user.accessibleSites.length
        ? session.user.accessibleSites[0]
        : null);

    // Get site URL based on role
    let siteUrl = req.nextUrl.searchParams.get("url") || sessionSiteFallback;

    // Resolve Meta Page ID to website URL if needed
    if (siteUrl && !isValidUrl(siteUrl)) {
      const { PrismaClient } = require("@prisma/client");
      const prisma = new PrismaClient();
      const mappedSite = await prisma.site.findFirst({
        where: {
          OR: [
            { facebookPageId: siteUrl },
            { instagramUserId: siteUrl }
          ]
        },
        select: { siteUrl: true }
      });

      if (mappedSite?.siteUrl) {
        siteUrl = mappedSite.siteUrl;
      } else {
        const mappedUser = await prisma.user.findFirst({
          where: {
            OR: [
              { facebookPageId: siteUrl },
              { instagramUserId: siteUrl }
            ]
          },
          select: { siteLink: true }
        });
        if (mappedUser?.siteLink) {
          siteUrl = mappedUser.siteLink;
        } else {
          const statMatch = await prisma.socialMediaDailyStat.findFirst({
            where: {
              OR: [
                { accountHandle: siteUrl },
                { accountName: siteUrl }
              ]
            },
            select: { siteLink: true }
          });
          if (statMatch?.siteLink) {
            siteUrl = statMatch.siteLink;
          }
        }
      }
    }

    if (userRole === ROLES.SUPER_ADMIN) {
      if (!siteUrl || !isValidUrl(siteUrl)) {
        // Safe fallback for Super Admin if unlinked
        if (sessionSiteFallback && isValidUrl(sessionSiteFallback)) {
          siteUrl = sessionSiteFallback;
        } else {
          return new Response(
            JSON.stringify({ 
              error: "Please provide a valid 'url' parameter or ensure your account has a linked website URL." 
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      }
    } else {
      if (!siteUrl || !isValidUrl(siteUrl)) {
        return new Response(
          JSON.stringify({
            error: "No website URL linked to your account. Please contact an administrator.",
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    const normalizedUrl = normalizeSiteOrigin(siteUrl);
    if (!normalizedUrl) {
      return new Response(
        JSON.stringify({ error: "Invalid URL format." }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (userRole === ROLES.VIEWER || userRole === ROLES.SMM) {
      const allowed = new Set(
        (session.user.accessibleSites || []).map((s) => normalizeSiteOrigin(s)).filter(Boolean)
      );
      const own = normalizeSiteOrigin(session.user.siteLink || "");
      if (own) allowed.add(own);
      if (!allowed.size || !allowed.has(normalizedUrl)) {
        return new Response(
          JSON.stringify({
            error: "Access denied. You can only view Search Console data for sites assigned to your account.",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }
    let { startDate, endDate, range: rangeResolved } = resolveRange(rangeParam, startDateQ, endDateQ);
    const primaryClamped = clampSearchConsoleQueryRange(startDate, endDate);
    startDate = primaryClamped.startDate;
    endDate = primaryClamped.endDate;

    const hasCompareRequest =
      isValidYMD(compareStartQ) && isValidYMD(compareEndQ) && compareStartQ <= compareEndQ;
    let compareStart = compareStartQ;
    let compareEnd = compareEndQ;
    if (hasCompareRequest) {
      const compareClamped = clampSearchConsoleQueryRange(compareStartQ, compareEndQ);
      compareStart = compareClamped.startDate;
      compareEnd = compareClamped.endDate;
    }
    if (hasCompareRequest && inclusiveDayCountYMD(compareStart, compareEnd) > MAX_SPAN_DAYS) {
      return new Response(
        JSON.stringify({ error: `Compare date range is too long (max ${MAX_SPAN_DAYS} days).` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Access control: Regular users can only query their own siteLink
    if (userRole === ROLES.USER) {
      const userSiteValidation = validateAndNormalizeSiteUrl(session.user.siteLink);
      const requestUrlValidation = validateAndNormalizeSiteUrl(normalizedUrl);

      if (!userSiteValidation.valid || !requestUrlValidation.valid) {
        return new Response(
          JSON.stringify({ error: "Invalid URL format." }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      if (requestUrlValidation.normalized !== userSiteValidation.normalized) {
        return new Response(
          JSON.stringify({
            error: "Access denied. You can only query your own website URL.",
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    try {
      const comparePromise = hasCompareRequest
        ? getSearchAnalyticsTimeSeries(normalizedUrl, compareStart, compareEnd)
        : Promise.resolve(null);

      const [timeSeriesData, topQueriesData, topPagesData, topCountriesData, timeSeriesCompareData] =
        await Promise.all([
          getSearchAnalyticsTimeSeries(normalizedUrl, startDate, endDate),
          getTopQueries(normalizedUrl, startDate, endDate, 1000),
          getTopPages(normalizedUrl, startDate, endDate, 1000),
          getTopCountries(normalizedUrl, startDate, endDate, 50),
          comparePromise,
        ]);

      const timeSeriesDens = densifyTimeSeries(
        startDate,
        endDate,
        timeSeriesData.timeSeries
      );
      const compareDens =
        hasCompareRequest && timeSeriesCompareData
          ? densifyTimeSeries(
              compareStart,
              compareEnd,
              timeSeriesCompareData.timeSeries
            )
          : null;

      // Paginate top queries
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedQueries = topQueriesData.queries.slice(startIndex, endIndex);

      return new Response(
        JSON.stringify({
          siteUrl: normalizedUrl,
          timeSeries: timeSeriesDens,
          compareTimeSeries: hasCompareRequest ? compareDens : null,
          totals: timeSeriesData.totals,
          compareTotals: hasCompareRequest && timeSeriesCompareData ? timeSeriesCompareData.totals : null,
          topQueries: {
            queries: paginatedQueries,
            total: topQueriesData.total,
            page,
            pageSize,
            totalPages: Math.ceil(topQueriesData.total / pageSize),
          },
          topPages: {
            pages: topPagesData.pages,
            total: topPagesData.total,
          },
          topCountries: {
            countries: topCountriesData.countries,
            total: topCountriesData.total,
          },
          dateRange: {
            startDate,
            endDate,
            range: rangeResolved,
          },
          compareDateRange:
            hasCompareRequest
              ? { startDate: compareStart, endDate: compareEnd }
              : null,
          lastUpdated: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "private, no-store, max-age=0",
          },
        }
      );
    } catch (err) {
      const errorMessage = err?.message ?? String(err);
      const classifiedError = classifyError(err);
      
      if (process.env.NODE_ENV === "development") {
        console.error("Search Console Performance API error:", err);
      }

      // Determine appropriate HTTP status code
      let statusCode = 500;
      if (classifiedError.type === ERROR_TYPES.MISSING_CREDENTIALS || 
          classifiedError.type === ERROR_TYPES.EXPIRED_TOKEN ||
          classifiedError.type === ERROR_TYPES.INVALID_TOKEN) {
        statusCode = 401;
      } else if (classifiedError.type === ERROR_TYPES.INSUFFICIENT_PERMISSIONS ||
                 classifiedError.type === ERROR_TYPES.PROPERTY_NOT_VERIFIED) {
        statusCode = 403;
      } else if (classifiedError.type === ERROR_TYPES.API_QUOTA_EXCEEDED) {
        statusCode = 429;
      } else if (classifiedError.type === ERROR_TYPES.NETWORK_ERROR ||
                 classifiedError.type === ERROR_TYPES.TIMEOUT_ERROR) {
        statusCode = 503;
      }

      return new Response(
        JSON.stringify({
          error: "Failed to fetch Search Console performance data.",
          errorType: classifiedError.type,
          userMessage: classifiedError.userMessage,
          actionRequired: classifiedError.actionRequired,
          technicalDetails: process.env.NODE_ENV === "development" || userRole === ROLES.SUPER_ADMIN 
            ? classifiedError.technicalDetails 
            : undefined,
          originalError: process.env.NODE_ENV === "development" || userRole === ROLES.SUPER_ADMIN
            ? errorMessage
            : undefined,
        }),
        {
          status: statusCode,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  } catch (error) {
    const session = await getServerSession(authOptions).catch(() => null);
    const userRole = session?.user?.role || ROLES.USER;
    
    console.error("Search Console Performance API error:", error);
    const classifiedError = classifyError(error);
    
    return new Response(
      JSON.stringify({
        error: "An error occurred while processing the request.",
        errorType: classifiedError.type,
        userMessage: classifiedError.userMessage,
        actionRequired: classifiedError.actionRequired,
        technicalDetails: process.env.NODE_ENV === "development" || userRole === ROLES.SUPER_ADMIN
          ? classifiedError.technicalDetails
          : undefined,
        originalError: process.env.NODE_ENV === "development" || userRole === ROLES.SUPER_ADMIN
          ? error.message
          : undefined,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
