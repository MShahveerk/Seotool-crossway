import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { resolve } from "path";
import { readFileSync } from "fs";

/**
 * Get or create Google Search Console API client
 * Uses service account authentication similar to Analytics
 */
async function getSearchConsoleClient() {
  // Don't cache the client to avoid token expiration issues
  // Create fresh client each time to ensure valid tokens

  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  if (!credentialsJson) {
    throw new Error(
      "GOOGLE_APPLICATION_CREDENTIALS_JSON is not set. Search Console will not work."
    );
  }

  let credentials;
  try {
    // Check if it's inline JSON
    if (typeof credentialsJson === "string" && credentialsJson.startsWith("{")) {
      credentials = JSON.parse(credentialsJson);
    } else {
      // It's a file path - resolve it relative to project root
      let filePath;
      
      // Trim any whitespace from the path
      const trimmedPath = credentialsJson.trim();
      
      // If it's already an absolute path (starts with drive letter or /)
      if (trimmedPath.match(/^[A-Za-z]:/) || trimmedPath.startsWith("/")) {
        filePath = trimmedPath;
      } else {
        // Remove leading ./ if present
        const cleanPath = trimmedPath.startsWith("./") 
          ? trimmedPath.substring(2) 
          : trimmedPath;
        
        // Resolve from process.cwd() (project root in Next.js)
        filePath = resolve(process.cwd(), cleanPath);
      }
      
      // Normalize the path to handle any issues
      filePath = resolve(filePath);
      
      // Read and parse the file
      const fileContent = readFileSync(filePath, "utf8");
      credentials = JSON.parse(fileContent);
    }
  } catch (err) {
    // Provide more detailed error message with the actual values
    const attemptedPath = credentialsJson.startsWith("{") 
      ? "inline JSON" 
      : (credentialsJson.match(/^[A-Za-z]:/) || credentialsJson.startsWith("/"))
        ? credentialsJson.trim()
        : resolve(process.cwd(), credentialsJson.trim().startsWith("./") ? credentialsJson.trim().substring(2) : credentialsJson.trim());
    
    throw new Error(
      `Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON: ${err.message}\n` +
      `Original env value: "${credentialsJson}"\n` +
      `Attempted path: ${attemptedPath}\n` +
      `Current working directory: ${process.cwd()}`
    );
  }

  // Use JWT authentication directly for service accounts
  // Create a fresh auth client - the library will handle token generation automatically
  const jwtClient = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
    projectId: credentials.project_id,
  });

  // Don't call authorize() explicitly - let the library handle token generation
  // when making API calls. This ensures fresh tokens with correct timing.
  // The JWT client will automatically generate tokens with proper iat/exp claims
  // when needed.

  // Create Search Console client with the JWT client
  // Token will be generated automatically on first API call
  const client = google.searchconsole({
    version: "v1",
    auth: jwtClient,
  });

  return client;
}

let gscPropertiesCache = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

async function getVerifiedProperties(client) {
  const now = Date.now();
  if (gscPropertiesCache && (now - cacheTimestamp < CACHE_TTL_MS)) {
    return gscPropertiesCache;
  }
  try {
    const res = await client.sites.list();
    gscPropertiesCache = res.data?.siteEntry || [];
    cacheTimestamp = now;
  } catch (err) {
    console.warn("Failed to fetch verified GSC properties list:", err.message);
    gscPropertiesCache = gscPropertiesCache || [];
  }
  return gscPropertiesCache;
}

/**
 * Resolves the requested siteUrl to the exact format registered in Google Search Console.
 * E.g., handles missing trailing slashes, www vs non-www, and sc-domain properties.
 */
async function resolveRegisteredSiteUrl(client, requestedSiteUrl) {
  if (!requestedSiteUrl) return requestedSiteUrl;
  
  const siteEntries = await getVerifiedProperties(client);
  if (siteEntries.length === 0) {
    return requestedSiteUrl;
  }

  const cleanRequested = String(requestedSiteUrl)
    .replace(/^sc-domain:/i, "")
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "")
    .trim()
    .toLowerCase();

  // 1. Try exact match (normalized)
  for (const entry of siteEntries) {
    const cleanEntry = String(entry.siteUrl || "")
      .replace(/^sc-domain:/i, "")
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/+$/, "")
      .trim()
      .toLowerCase();
    
    if (cleanEntry === cleanRequested) {
      return entry.siteUrl;
    }
  }

  // 2. Fallback to containing substring match
  for (const entry of siteEntries) {
    const cleanEntry = String(entry.siteUrl || "").toLowerCase();
    if (cleanEntry.includes(cleanRequested)) {
      return entry.siteUrl;
    }
  }
  
  return requestedSiteUrl;
}

async function enhanceGscError(err, client) {
  const message =
    err?.response?.data?.error?.message ||
    err?.message ||
    "Unknown Search Console API error";
  
  const is403 = err?.response?.status === 403 || 
                message.includes("Access denied") || 
                message.includes("permission") || 
                message.includes("Forbidden");

  if (is403 && client) {
    let verifiedProperties = [];
    try {
      const listRes = await client.sites.list();
      verifiedProperties = (listRes.data?.siteEntry || []).map(e => e.siteUrl);
    } catch {}
    
    // Get service account email from env if possible to display
    let emailStr = "";
    try {
      const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
      if (credentialsJson) {
        const credentials = credentialsJson.startsWith("{") ? JSON.parse(credentialsJson) : {};
        if (credentials.client_email) {
          emailStr = ` '${credentials.client_email}'`;
        }
      }
    } catch {}

    return new Error(
      `Access denied (403). The service account${emailStr} has access to: [${verifiedProperties.length > 0 ? verifiedProperties.join(", ") : "No properties found"}]. ` +
      `Please ensure this email is added as a user to your GSC property with 'Full' or 'Owner' permission.`
    );
  }
  
  return new Error(`Search Console API error: ${message}`);
}

/**
 * Get search analytics data for a site
 * @param {string} siteUrl - The site URL (must be verified in Search Console)
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @returns {Promise<Object>} Search analytics data
 */
export async function getSearchAnalytics(siteUrl, startDate, endDate) {
  const client = await getSearchConsoleClient();
  const resolvedSiteUrl = await resolveRegisteredSiteUrl(client, siteUrl);

  try {
    const response = await client.searchanalytics.query({
      siteUrl: resolvedSiteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ["date", "query", "page"],
        rowLimit: 1000,
      },
    });

    const rows = response.data.rows || [];

    // Aggregate totals
    const totals = rows.reduce(
      (acc, row) => {
        acc.clicks += row.clicks || 0;
        acc.impressions += row.impressions || 0;
        acc.ctr += row.ctr || 0;
        acc.position += row.position || 0;
        return acc;
      },
      { clicks: 0, impressions: 0, ctr: 0, position: 0 }
    );

    const avgCtr = rows.length > 0 ? totals.ctr / rows.length : 0;
    const avgPosition = rows.length > 0 ? totals.position / rows.length : 0;

    return {
      totalClicks: totals.clicks,
      totalImpressions: totals.impressions,
      averageCtr: avgCtr,
      averagePosition: avgPosition,
      rows: rows.slice(0, 100), // Limit to top 100 rows for display
      dateRange: { startDate, endDate },
    };
  } catch (err) {
    throw await enhanceGscError(err, client);
  }
}

/**
 * Helper to retry API calls with fresh client on token errors
 */
async function withRetry(apiCall, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await apiCall();
    } catch (error) {
      const isTokenError = error?.message?.includes("invalid_grant") || 
                          error?.message?.includes("JWT") ||
                          error?.response?.status === 401;
      
      if (isTokenError && i < retries) {
        continue;
      }
      throw error;
    }
  }
}

/**
 * Get search analytics data grouped by date for time-series charts
 * @param {string} siteUrl - The site URL
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @returns {Promise<Object>} Time-series analytics data
 */
export async function getSearchAnalyticsTimeSeries(siteUrl, startDate, endDate) {
  return withRetry(async () => {
    const client = await getSearchConsoleClient();
    const resolvedSiteUrl = await resolveRegisteredSiteUrl(client, siteUrl);

    try {
      // Fetch data grouped by date only
      const t0 = new Date(`${startDate}T12:00:00`).getTime();
      const t1 = new Date(`${endDate}T12:00:00`).getTime();
      const spanDays =
        Number.isFinite(t0) && Number.isFinite(t1) && t1 >= t0
          ? Math.max(1, Math.round((t1 - t0) / (1000 * 60 * 60 * 24)) + 1)
          : 31;
      const response = await client.searchanalytics.query({
        siteUrl: resolvedSiteUrl,
        requestBody: {
          startDate,
          endDate,
          dimensions: ["date"],
          rowLimit: Math.min(25000, Math.max(1000, spanDays + 31)),
        },
      });

      const rows = response.data.rows || [];

      // Group by date and calculate totals
      const dateMap = new Map();
      let totalClicks = 0;
      let totalImpressions = 0;
      let totalCtr = 0;
      let totalPosition = 0;
      let rowCount = 0;

      rows.forEach((row) => {
        const date = row.keys?.[0];
        if (date) {
          if (!dateMap.has(date)) {
            dateMap.set(date, {
              date,
              clicks: 0,
              impressions: 0,
              ctr: 0,
              position: 0,
              count: 0,
            });
          }
          const dayData = dateMap.get(date);
          dayData.clicks += row.clicks || 0;
          dayData.impressions += row.impressions || 0;
          dayData.ctr += row.ctr || 0;
          dayData.position += row.position || 0;
          dayData.count += 1;
        }

        totalClicks += row.clicks || 0;
        totalImpressions += row.impressions || 0;
        totalCtr += row.ctr || 0;
        totalPosition += row.position || 0;
        rowCount += 1;
      });

      // Convert map to sorted array and calculate averages
      const timeSeries = Array.from(dateMap.values())
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((day) => ({
          date: day.date,
          clicks: day.clicks,
          impressions: day.impressions,
          ctr: day.count > 0 ? day.ctr / day.count : 0,
          position: day.count > 0 ? day.position / day.count : 0,
        }));

      const avgCtr = rowCount > 0 ? totalCtr / rowCount : 0;
      const avgPosition = rowCount > 0 ? totalPosition / rowCount : 0;

      return {
        timeSeries,
        totals: {
          clicks: totalClicks,
          impressions: totalImpressions,
          averageCtr: avgCtr,
          averagePosition: avgPosition,
        },
        dateRange: { startDate, endDate },
      };
    } catch (err) {
      throw await enhanceGscError(err, client);
    }
  });
}

export async function getTopQueries(siteUrl, startDate, endDate, limit = 1000) {
  return withRetry(async () => {
    const client = await getSearchConsoleClient();
    const resolvedSiteUrl = await resolveRegisteredSiteUrl(client, siteUrl);

    try {
      const response = await client.searchanalytics.query({
        siteUrl: resolvedSiteUrl,
        requestBody: {
          startDate,
          endDate,
          dimensions: ["query"],
          rowLimit: limit,
        },
      });

      const rows = response.data.rows || [];

      const queries = rows.map((row) => ({
        query: row.keys?.[0] || "Unknown",
        clicks: row.clicks || 0,
        impressions: row.impressions || 0,
        ctr: row.ctr || 0,
        position: row.position || 0,
      }));

      return {
        queries,
        total: queries.length,
        dateRange: { startDate, endDate },
      };
    } catch (err) {
      throw await enhanceGscError(err, client);
    }
  });
}

/**
 * Get top pages for Search Console
 * @param {string} siteUrl - The site URL
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {number} limit - Maximum number of rows to return
 * @returns {Promise<Object>} Top pages data
 */
export async function getTopPages(siteUrl, startDate, endDate, limit = 1000) {
  return withRetry(async () => {
    const client = await getSearchConsoleClient();
    const resolvedSiteUrl = await resolveRegisteredSiteUrl(client, siteUrl);

    try {
      const response = await client.searchanalytics.query({
        siteUrl: resolvedSiteUrl,
        requestBody: {
          startDate,
          endDate,
          dimensions: ["page"],
          rowLimit: limit,
        },
      });

      const rows = response.data.rows || [];

      const pages = rows.map((row) => ({
        page: row.keys?.[0] || "Unknown",
        clicks: row.clicks || 0,
        impressions: row.impressions || 0,
        ctr: row.ctr || 0,
        position: row.position || 0,
      }));

      return {
        pages,
        total: pages.length,
        dateRange: { startDate, endDate },
      };
    } catch (err) {
      throw await enhanceGscError(err, client);
    }
  });
}

/**
 * Get top countries for Search Console
 * @param {string} siteUrl - The site URL
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {number} limit - Maximum number of rows to return
 * @returns {Promise<Object>} Top countries data
 */
export async function getTopCountries(siteUrl, startDate, endDate, limit = 50) {
  return withRetry(async () => {
    const client = await getSearchConsoleClient();
    const resolvedSiteUrl = await resolveRegisteredSiteUrl(client, siteUrl);

    try {
      const response = await client.searchanalytics.query({
        siteUrl: resolvedSiteUrl,
        requestBody: {
          startDate,
          endDate,
          dimensions: ["country"],
          rowLimit: limit,
        },
      });

      const rows = response.data.rows || [];

      const countries = rows.map((row) => ({
        country: row.keys?.[0] || "unknown",
        clicks: row.clicks || 0,
        impressions: row.impressions || 0,
      }));

      return {
        countries,
        total: countries.length,
        dateRange: { startDate, endDate },
      };
    } catch (err) {
      throw await enhanceGscError(err, client);
    }
  });
}

/**
 * Device breakdown (DESKTOP / MOBILE / TABLET)
 */
export async function getDeviceBreakdown(siteUrl, startDate, endDate) {
  return withRetry(async () => {
    const client = await getSearchConsoleClient();
    const resolvedSiteUrl = await resolveRegisteredSiteUrl(client, siteUrl);

    try {
      const response = await client.searchanalytics.query({
        siteUrl: resolvedSiteUrl,
        requestBody: {
          startDate,
          endDate,
          dimensions: ["device"],
          rowLimit: 10,
        },
      });

      const rows = response.data.rows || [];
      const devices = rows.map((row) => {
        const raw = String(row.keys?.[0] || "UNKNOWN").toUpperCase();
        const label =
          raw === "DESKTOP" ? "Desktop" : raw === "MOBILE" ? "Mobile" : raw === "TABLET" ? "Tablet" : raw;
        return {
          device: raw,
          label,
          clicks: row.clicks || 0,
          impressions: row.impressions || 0,
          ctr: row.ctr || 0,
          position: row.position || 0,
        };
      });

      return { devices, total: devices.length, dateRange: { startDate, endDate } };
    } catch (err) {
      throw await enhanceGscError(err, client);
    }
  });
}

/**
 * Search appearance breakdown (rich results types)
 */
export async function getSearchAppearanceBreakdown(siteUrl, startDate, endDate, limit = 50) {
  return withRetry(async () => {
    const client = await getSearchConsoleClient();
    const resolvedSiteUrl = await resolveRegisteredSiteUrl(client, siteUrl);

    try {
      const response = await client.searchanalytics.query({
        siteUrl: resolvedSiteUrl,
        requestBody: {
          startDate,
          endDate,
          dimensions: ["searchAppearance"],
          rowLimit: limit,
        },
      });

      const rows = response.data.rows || [];
      const appearances = rows.map((row) => {
        const raw = String(row.keys?.[0] || "UNKNOWN");
        const label = raw
          .replace(/^AMP_/i, "")
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        return {
          appearance: raw,
          label,
          clicks: row.clicks || 0,
          impressions: row.impressions || 0,
          ctr: row.ctr || 0,
          position: row.position || 0,
        };
      });

      return { appearances, total: appearances.length, dateRange: { startDate, endDate } };
    } catch (err) {
      throw await enhanceGscError(err, client);
    }
  });
}

/**
 * Query × page matrix — which keywords drive which landing pages
 */
export async function getQueryPageMatrix(siteUrl, startDate, endDate, limit = 500) {
  return withRetry(async () => {
    const client = await getSearchConsoleClient();
    const resolvedSiteUrl = await resolveRegisteredSiteUrl(client, siteUrl);

    try {
      const response = await client.searchanalytics.query({
        siteUrl: resolvedSiteUrl,
        requestBody: {
          startDate,
          endDate,
          dimensions: ["query", "page"],
          rowLimit: limit,
        },
      });

      const rows = response.data.rows || [];
      const pairs = rows.map((row) => ({
        query: row.keys?.[0] || "Unknown",
        page: row.keys?.[1] || "Unknown",
        clicks: row.clicks || 0,
        impressions: row.impressions || 0,
        ctr: row.ctr || 0,
        position: row.position || 0,
      }));

      return { pairs, total: pairs.length, dateRange: { startDate, endDate } };
    } catch (err) {
      throw await enhanceGscError(err, client);
    }
  });
}

/**
 * Striking-distance opportunities: mid-page positions with high impressions / low CTR
 */
export async function getStrikingDistanceQueries(siteUrl, startDate, endDate, limit = 200) {
  return withRetry(async () => {
    const client = await getSearchConsoleClient();
    const resolvedSiteUrl = await resolveRegisteredSiteUrl(client, siteUrl);

    try {
      const response = await client.searchanalytics.query({
        siteUrl: resolvedSiteUrl,
        requestBody: {
          startDate,
          endDate,
          dimensions: ["query"],
          rowLimit: Math.min(25000, Math.max(limit * 5, 1000)),
        },
      });

      const rows = response.data.rows || [];
      const opportunities = rows
        .map((row) => ({
          query: row.keys?.[0] || "Unknown",
          clicks: row.clicks || 0,
          impressions: row.impressions || 0,
          ctr: row.ctr || 0,
          position: row.position || 0,
        }))
        .filter(
          (r) =>
            r.impressions >= 50 &&
            r.position >= 8 &&
            r.position <= 20 &&
            r.ctr < 0.08
        )
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, limit)
        .map((r) => ({
          ...r,
          opportunityScore: Math.round(r.impressions * (1 - r.ctr) * (1 / Math.max(r.position, 1))),
        }));

      return { opportunities, total: opportunities.length, dateRange: { startDate, endDate } };
    } catch (err) {
      throw await enhanceGscError(err, client);
    }
  });
}

/**
 * Get sitemap information
 * @param {string} siteUrl - The site URL
 * @returns {Promise<Object>} Sitemap data
 */
export async function getSitemaps(siteUrl) {
  const client = await getSearchConsoleClient();
  const resolvedSiteUrl = await resolveRegisteredSiteUrl(client, siteUrl);

  try {
    const response = await client.sitemaps.list({ siteUrl: resolvedSiteUrl });
    const sitemaps = response.data.sitemap || [];

    return {
      sitemaps: sitemaps.map((sitemap) => ({
        path: sitemap.path,
        lastSubmitted: sitemap.lastSubmitted,
        contentsCount: sitemap.contentsCount || 0,
        isPending: sitemap.isPending || false,
        isSitemapsIndex: sitemap.isSitemapsIndex || false,
      })),
    };
  } catch (err) {
    throw await enhanceGscError(err, client);
  }
}

/**
 * Get URL inspection data (indexing status)
 * @param {string} siteUrl - The site URL
 * @param {string} inspectionUrl - The URL to inspect
 * @returns {Promise<Object>} Inspection data
 */
export async function inspectUrl(siteUrl, inspectionUrl) {
  const client = await getSearchConsoleClient();
  const resolvedSiteUrl = await resolveRegisteredSiteUrl(client, siteUrl);

  try {
    const response = await client.urlInspection.index.inspect({
      requestBody: {
        inspectionUrl,
        siteUrl: resolvedSiteUrl,
      },
    });

    const inspectionResult = response.data.inspectionResult || {};

    return {
      indexStatusResult: {
        verdict: inspectionResult.indexStatusResult?.verdict || "UNKNOWN",
        coverageState: inspectionResult.indexStatusResult?.coverageState || "UNKNOWN",
        lastCrawlTime: inspectionResult.indexStatusResult?.lastCrawlTime || null,
        indexingState: inspectionResult.indexStatusResult?.indexingState || "UNKNOWN",
      },
      url: inspectionUrl,
    };
  } catch (err) {
    throw await enhanceGscError(err, client);
  }
}

/**
 * Get site verification status and basic info
 * @param {string} siteUrl - The site URL
 * @returns {Promise<Object>} Site information
 */
export async function getSiteInfo(siteUrl) {
  try {
    // Try to get sitemaps as a way to verify access
    const sitemaps = await getSitemaps(siteUrl);
    
    return {
      siteUrl,
      verified: true,
      sitemapsCount: sitemaps.sitemaps.length,
    };
  } catch (err) {
    return {
      siteUrl,
      verified: false,
      error: err.message,
    };
  }
}

/**
 * Get comprehensive Search Console report
 * @param {string} siteUrl - The site URL
 * @param {number} days - Number of days to look back (default: 30)
 * @returns {Promise<Object>} Complete Search Console data
 */
export async function getSearchConsoleReport(siteUrl, days = 30) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const startDateStr = formatDate(startDate);
  const endDateStr = formatDate(endDate);

  try {
    const [searchAnalytics, sitemaps, siteInfo] = await Promise.all([
      getSearchAnalytics(siteUrl, startDateStr, endDateStr).catch((err) => ({
        error: err.message,
        totalClicks: 0,
        totalImpressions: 0,
        averageCtr: 0,
        averagePosition: 0,
        rows: [],
      })),
      getSitemaps(siteUrl).catch((err) => ({
        error: err.message,
        sitemaps: [],
      })),
      getSiteInfo(siteUrl).catch((err) => ({
        error: err.message,
        verified: false,
      })),
    ]);

    return {
      siteUrl,
      dateRange: {
        startDate: startDateStr,
        endDate: endDateStr,
        days,
      },
      searchAnalytics,
      sitemaps,
      siteInfo,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    throw new Error(`Failed to fetch Search Console data: ${err.message}`);
  }
}

