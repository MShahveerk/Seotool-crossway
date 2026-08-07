import prisma from "./prisma.js";

const DATAFORSEO_API_BASE = "https://api.dataforseo.com/v3";
const SETTING_LOGIN_KEY = "dataforseo_login";
const SETTING_PASSWORD_KEY = "dataforseo_password";

/**
 * Retrieve DataForSEO API Credentials from AppSetting database records
 * or fallback to process.env.
 */
export async function getDataForSeoCredentials() {
  try {
    const settings = await prisma.appSetting.findMany({
      where: {
        key: { in: [SETTING_LOGIN_KEY, SETTING_PASSWORD_KEY] },
      },
    });

    let login = settings.find((s) => s.key === SETTING_LOGIN_KEY)?.value || process.env.DATAFORSEO_LOGIN || "";
    let password = settings.find((s) => s.key === SETTING_PASSWORD_KEY)?.value || process.env.DATAFORSEO_PASSWORD || "";

    // Default fallback to user provided credentials if unconfigured
    if (!login) login = "shahveer@crosswayconsulting.com";
    if (!password) password = "cdb2f596cac77473";

    const authString = Buffer.from(`${login.trim()}:${password.trim()}`).toString("base64");

    return {
      login,
      configured: Boolean(login && password),
      authHeader: `Basic ${authString}`,
    };
  } catch (err) {
    console.error("[DataForSEO] Failed to fetch settings:", err.message);
    const fallbackAuth = Buffer.from("shahveer@crosswayconsulting.com:cdb2f596cac77473").toString("base64");
    return {
      login: "shahveer@crosswayconsulting.com",
      configured: true,
      authHeader: `Basic ${fallbackAuth}`,
    };
  }
}

/**
 * Save DataForSEO credentials to AppSetting
 */
export async function setLeaveDataForSeoCredentials(login, password) {
  if (login != null) {
    await prisma.appSetting.upsert({
      where: { key: SETTING_LOGIN_KEY },
      update: { value: String(login).trim() },
      create: { key: SETTING_LOGIN_KEY, value: String(login).trim() },
    });
  }
  if (password != null) {
    await prisma.appSetting.upsert({
      where: { key: SETTING_PASSWORD_KEY },
      update: { value: String(password).trim() },
      create: { key: SETTING_PASSWORD_KEY, value: String(password).trim() },
    });
  }
}

/**
 * General POST Query Runner for DataForSEO REST API v3
 */
export async function queryDataForSeo(endpointPath, payloadArray) {
  const creds = await getDataForSeoCredentials();
  if (!creds.authHeader) {
    throw new Error("DataForSEO API credentials are not configured.");
  }

  const url = `${DATAFORSEO_API_BASE}/${endpointPath.replace(/^\//, "")}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": creds.authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payloadArray),
  });

  const data = await res.json();
  if (!res.ok || data.status_code !== 20000) {
    const errorMsg = data.status_message || data.tasks?.[0]?.status_message || `DataForSEO API error (${res.status})`;
    throw new Error(errorMsg);
  }

  return data;
}

/**
 * Fetch Keyword Search Volume, Monthly Trends, CPC, and Difficulty
 */
export async function fetchKeywordVolumeData(keywords, locationCode = 2840, languageCode = "en") {
  const kwList = Array.isArray(keywords) ? keywords : [keywords];
  
  // 1. Search volume & CPC
  const volumeData = await queryDataForSeo("keywords_data/google_ads/search_volume/live", [
    {
      keywords: kwList,
      location_code: Number(locationCode) || 2840,
      language_code: languageCode || "en",
    },
  ]);

  // 2. Keyword Suggestions
  let suggestionsData = null;
  try {
    suggestionsData = await queryDataForSeo("keywords_data/google_ads/keywords_for_keywords/live", [
      {
        keywords: [kwList[0]],
        location_code: Number(locationCode) || 2840,
        language_code: languageCode || "en",
        limit: 10,
      },
    ]);
  } catch (e) {
    console.warn("[DataForSEO] Suggestions fetch skipped:", e.message);
  }

  const volumes = volumeData.tasks?.[0]?.result || [];
  const suggestions = suggestionsData?.tasks?.[0]?.result || [];

  return {
    keywords: volumes,
    suggestions: suggestions,
  };
}

/**
 * Fetch Live Organic SERP Rankings
 */
export async function fetchSerpData(keyword, locationCode = 2840, languageCode = "en") {
  const data = await queryDataForSeo("serp/google/organic/live/advanced", [
    {
      keyword: String(keyword).trim(),
      location_code: Number(locationCode) || 2840,
      language_code: languageCode || "en",
      depth: 20,
    },
  ]);

  const taskResult = data.tasks?.[0]?.result?.[0] || {};
  return {
    keyword: taskResult.keyword || keyword,
    totalCount: taskResult.se_results_count || 0,
    items: taskResult.items || [],
  };
}

/**
 * Fetch Domain Backlinks & Authority Summary
 */
export async function fetchBacklinksSummary(targetDomain) {
  const domain = String(targetDomain)
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];

  const data = await queryDataForSeo("backlinks/summary/live", [
    {
      target: domain,
      internal_list_limit: 10,
    },
  ]);

  const result = data.tasks?.[0]?.result?.[0] || {};
  return {
    domain,
    backlinks: result.backlinks || 0,
    referringDomains: result.referring_domains || 0,
    referringPages: result.referring_pages || 0,
    domainRank: result.rank || 0,
    dofollow: result.dofollow || 0,
    nofollow: result.nofollow || 0,
  };
}
