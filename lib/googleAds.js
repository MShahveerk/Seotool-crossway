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

export function getGoogleAdsServiceAccountEmail() {
  try {
    return loadCredentials().client_email || null;
  } catch {
    return null;
  }
}

export async function getGoogleAdsAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

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
        `then add ${credentials.client_email} as Admin on your Ads account (Access and security → Users).`
    );
  }

  const token = jwtClient.credentials?.access_token;
  if (!token || typeof token !== "string") {
    throw new Error(
      "Failed to obtain Google Ads OAuth access token (empty token). " +
        "Check GOOGLE_APPLICATION_CREDENTIALS_JSON on Render — the service account private_key must include valid \\n line breaks."
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
  const raw = `${base} ${text}`.toUpperCase();

  if (status !== 401) return base;

  if (raw.includes("NOT_ADS_USER")) {
    const sa = getGoogleAdsServiceAccountEmail();
    return (
      `${base} — The OAuth token is valid but not linked to Google Ads. ` +
      `In your test MCC go to Admin → Access and security → Users, add ` +
      `${sa || "your service account email"} as Admin (upgrade from Standard if needed).`
    );
  }

  return (
    `${base} — Keyword Planner needs three credentials, not two: ` +
    `(1) GOOGLE_ADS_DEVELOPER_TOKEN, (2) GOOGLE_ADS_CUSTOMER_ID, and (3) OAuth from ` +
    `GOOGLE_APPLICATION_CREDENTIALS_JSON (same service account as Search Console). ` +
    `Also enable Google Ads API in Google Cloud for that project.`
  );
}

/** Lightweight connectivity check for admin diagnostics. */
export async function testGoogleAdsConnection() {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  const customerId = normalizeCustomerId(process.env.GOOGLE_ADS_CUSTOMER_ID);
  const loginCustomerId = normalizeCustomerId(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
  const serviceAccountEmail = getGoogleAdsServiceAccountEmail();
  const hasCredentialsJson = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim());

  const checks = {
    developerToken: Boolean(developerToken),
    customerId: Boolean(customerId),
    credentialsJson: hasCredentialsJson,
    serviceAccountEmail,
    loginCustomerId: loginCustomerId || null,
    apiVersion: API_VERSION,
  };

  if (!developerToken || !customerId || !hasCredentialsJson) {
    return {
      ok: false,
      checks,
      step: "env",
      error: "Missing GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CUSTOMER_ID, or GOOGLE_APPLICATION_CREDENTIALS_JSON.",
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
