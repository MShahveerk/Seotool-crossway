/**
 * Google Ads API client (REST) using the same service account as Search Console.
 * Requires the service account email added as a user on the Google Ads MCC/account.
 */
import { JWT } from "google-auth-library";
import { resolve } from "path";
import { readFileSync } from "fs";

const ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
const API_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v24";

let tokenCache = { token: null, expiresAt: 0 };

function loadCredentials() {
  const credentialsJson =
    process.env.GOOGLE_ADS_CREDENTIALS_JSON?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim();

  if (!credentialsJson) {
    throw new Error(
      "Neither GOOGLE_ADS_CREDENTIALS_JSON nor GOOGLE_APPLICATION_CREDENTIALS_JSON is configured in environment."
    );
  }

  if (typeof credentialsJson === "string" && credentialsJson.startsWith("{")) {
    return JSON.parse(credentialsJson);
  }

  const trimmedPath = credentialsJson.trim();
  const filePath = trimmedPath.match(/^[A-Za-z]:/) || trimmedPath.startsWith("/")
    ? trimmedPath
    : resolve(process.cwd(), trimmedPath.startsWith("./") ? trimmedPath.substring(2) : trimmedPath);

  return JSON.parse(readFileSync(resolve(filePath), "utf8"));
}

export function isGoogleAdsConfigured() {
  const hasCreds = Boolean(
    process.env.GOOGLE_ADS_CREDENTIALS_JSON?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim()
  );
  return Boolean(
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim() &&
    process.env.GOOGLE_ADS_CUSTOMER_ID?.trim() &&
    hasCreds
  );
}

export function normalizeCustomerId(id) {
  return String(id || "")
    .replace(/-/g, "")
    .trim();
}

export function getGoogleAdsServiceAccountEmail() {
  try {
    return loadCredentials().client_email || null;
  } catch {
    return null;
  }
}

export function hasRefreshTokenConfig() {
  return Boolean(
    process.env.GOOGLE_ADS_CLIENT_ID?.trim() &&
    process.env.GOOGLE_ADS_CLIENT_SECRET?.trim() &&
    process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim()
  );
}

async function getAccessTokenFromRefreshToken() {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim();

  if (!clientId || !clientSecret || !refreshToken) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(
      `Failed to refresh Google Ads OAuth token: ${data.error_description || data.error || res.status}`
    );
  }
  return data.access_token;
}

export async function getGoogleAdsAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  // 1. Prefer standard OAuth2 Refresh Token if configured
  if (hasRefreshTokenConfig()) {
    const token = await getAccessTokenFromRefreshToken();
    tokenCache = { token, expiresAt: Date.now() + 3_500_000 };
    return token;
  }

  // 2. Fallback to Service Account JWT authentication
  const credentials = loadCredentials();
  const impersonateEmail = process.env.GOOGLE_ADS_IMPERSONATE_EMAIL?.trim();
  const jwtClient = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [ADS_SCOPE],
    projectId: credentials.project_id,
    ...(impersonateEmail ? { subject: impersonateEmail } : {}),
  });

  try {
    await jwtClient.authorize();
  } catch (err) {
    throw new Error(
      `Failed to obtain Google Ads OAuth access token: ${err.message}. ` +
        `Enable the Google Ads API in Google Cloud project "${credentials.project_id}", ` +
        `then add ${credentials.client_email} as Admin on your Ads account.`
    );
  }

  const token = jwtClient.credentials?.access_token;
  if (!token || typeof token !== "string") {
    throw new Error(
      "Failed to obtain Google Ads OAuth access token (empty token). " +
        "Check credentials on Render — the private_key must include valid \\n line breaks."
    );
  }

  tokenCache = { token, expiresAt: Date.now() + 3_500_000 };
  return token;
}

function parseAdsError(data, fallback) {
  if (Array.isArray(data)) {
    for (const row of data) {
      const msg = row?.error?.message;
      if (msg) return msg;
    }
  }
  return data?.error?.message || fallback;
}

function formatAdsApiError(status, data, text) {
  const base = parseAdsError(data, text.slice(0, 400));
  const sa = getGoogleAdsServiceAccountEmail();
  const raw = `${base} ${text}`.toUpperCase();
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;

  if (status === 403 || status === 401 || raw.includes("PERMISSION") || raw.includes("NOT_ADS_USER")) {
    let msg = `${base} — Google Ads API permission rejected for account "${process.env.GOOGLE_ADS_CUSTOMER_ID}". `;
    
    if (!loginCustomerId) {
      msg += `CRITICAL FIX: If account ${process.env.GOOGLE_ADS_CUSTOMER_ID} is under an MCC Manager Account, you MUST set GOOGLE_ADS_LOGIN_CUSTOMER_ID="<your_mcc_manager_id>" in .env! Without login-customer-id, Google Ads API rejects child account requests even if permissions exist. `;
    }

    msg += `Also note: Google Ads API blocks direct Service Accounts unless added as Admin under Admin → Access & Security → Users, OR authenticated via GOOGLE_ADS_REFRESH_TOKEN.`;

    return msg;
  }

  return base;
}

/** Lightweight connectivity check for admin diagnostics. */
export async function testGoogleAdsConnection() {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  const customerId = normalizeCustomerId(process.env.GOOGLE_ADS_CUSTOMER_ID);
  const loginCustomerId = normalizeCustomerId(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
  const serviceAccountEmail = getGoogleAdsServiceAccountEmail();
  const hasCredentialsJson = Boolean(
    process.env.GOOGLE_ADS_CREDENTIALS_JSON?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim()
  );

  const checks = {
    developerToken: Boolean(developerToken),
    customerId: Boolean(customerId),
    credentialsJson: hasCredentialsJson,
    usesAdsSpecificCredentials: Boolean(process.env.GOOGLE_ADS_CREDENTIALS_JSON?.trim()),
    serviceAccountEmail,
    loginCustomerId: loginCustomerId || null,
    apiVersion: API_VERSION,
  };

  if (!developerToken || !customerId || !hasCredentialsJson) {
    return {
      ok: false,
      checks,
      step: "env",
      error: "Missing GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CUSTOMER_ID, or GOOGLE_ADS_CREDENTIALS_JSON / GOOGLE_APPLICATION_CREDENTIALS_JSON.",
    };
  }

  let accessTokenPreview = null;
  try {
    const token = await getGoogleAdsAccessToken();
    accessTokenPreview = `${token.slice(0, 8)}…`;
  } catch (err) {
    return { ok: false, checks, step: "oauth", error: err.message };
  }

  try {
    await googleAdsPost("generateKeywordHistoricalMetrics", {
      keywords: ["seo"],
      geoTargetConstants: ["geoTargetConstants/2840"],
      language: "languageConstants/1000",
      keywordPlanNetwork: "GOOGLE_SEARCH",
      includeAdultKeywords: false,
    });
    return { ok: true, checks: { ...checks, accessTokenPreview }, step: "planner" };
  } catch (err) {
    return {
      ok: false,
      checks: { ...checks, accessTokenPreview },
      step: "planner",
      error: err.message,
    };
  }
}

/**
 * POST to a KeywordPlanIdeaService method on the configured customer ID.
 * @param {"generateKeywordHistoricalMetrics"|"generateKeywordIdeas"} method
 */
export async function googleAdsPost(method, body) {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  const customerId = normalizeCustomerId(process.env.GOOGLE_ADS_CUSTOMER_ID);
  const loginCustomerId = normalizeCustomerId(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);

  if (!developerToken || !customerId) {
    throw new Error(
      "Google Ads API is not configured. Set GOOGLE_ADS_DEVELOPER_TOKEN and GOOGLE_ADS_CUSTOMER_ID."
    );
  }

  const token = await getGoogleAdsAccessToken();
  const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}:${method}`;

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "developer-token": developerToken,
  };
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    // Invalidate token cache so fresh credentials/permissions are evaluated on retry
    tokenCache = { token: null, expiresAt: 0 };
    const isHtml404 =
      res.status === 404 && typeof text === "string" && text.includes("<!DOCTYPE html>");
    if (isHtml404) {
      throw new Error(
        `Google Ads API ${res.status}: endpoint not found for ${API_VERSION}. ` +
          `Version ${API_VERSION} may be sunset — set GOOGLE_ADS_API_VERSION=v24 (or v23) and redeploy.`
      );
    }
    throw new Error(`Google Ads API ${res.status}: ${formatAdsApiError(res.status, data, text)}`);
  }

  return data;
}
