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
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!credentialsJson) {
    throw new Error(
      "GOOGLE_APPLICATION_CREDENTIALS_JSON is not set. Google Ads Keyword Planner requires the same service account as Search Console."
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
  return Boolean(
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim() && process.env.GOOGLE_ADS_CUSTOMER_ID?.trim()
  );
}

export function normalizeCustomerId(id) {
  return String(id || "")
    .replace(/-/g, "")
    .trim();
}

export async function getGoogleAdsAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  const credentials = loadCredentials();
  const jwtClient = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [ADS_SCOPE],
  });

  const { token } = await jwtClient.getAccessToken();
  if (!token) throw new Error("Failed to obtain Google Ads access token.");

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
    const isHtml404 =
      res.status === 404 && typeof text === "string" && text.includes("<!DOCTYPE html>");
    if (isHtml404) {
      throw new Error(
        `Google Ads API ${res.status}: endpoint not found for ${API_VERSION}. ` +
          `Version ${API_VERSION} may be sunset — set GOOGLE_ADS_API_VERSION=v24 (or v23) and redeploy.`
      );
    }
    throw new Error(`Google Ads API ${res.status}: ${parseAdsError(data, text.slice(0, 400))}`);
  }

  return data;
}
