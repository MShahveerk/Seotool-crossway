import { SERANKING_BASE, isSerankingConfigured } from "./config.js";
import { canSpendCredits, recordCreditSpend, logBlockedAttempt } from "./credits.js";

export class SerankingApiError extends Error {
  constructor(message, { status = 500, body = null } = {}) {
    super(message);
    this.name = "SerankingApiError";
    this.status = status;
    this.body = body;
  }
}

function getApiKey() {
  const key = process.env.SERANKING_API_KEY?.trim();
  if (!key) throw new SerankingApiError("SERANKING_API_KEY is not configured.", { status: 503 });
  return key;
}

/**
 * @param {object} opts
 * @param {'GET'|'POST'|'PATCH'|'DELETE'} opts.method
 * @param {string} opts.path - e.g. /backlinks/summary
 * @param {Record<string, string|number|boolean>} [opts.query]
 * @param {object} [opts.body]
 * @param {number} opts.creditEstimate
 * @param {number} [opts.creditsOnSuccess] - if known exactly; else uses creditEstimate
 * @param {string} [opts.siteUrl]
 * @param {boolean} [opts.allowManual]
 * @param {boolean} [opts.skipBudget] - for free GET status endpoints
 */
export async function serankingRequest({
  method = "GET",
  path,
  query = {},
  body,
  creditEstimate = 0,
  creditsOnSuccess,
  siteUrl = null,
  allowManual = false,
  skipBudget = false,
  endpointLabel,
}) {
  if (!isSerankingConfigured()) {
    throw new SerankingApiError("SERANKING_API_KEY is not configured.", { status: 503 });
  }

  const endpoint = endpointLabel || path;
  const estimate = Math.max(0, Math.floor(Number(creditEstimate) || 0));

  if (!skipBudget && estimate > 0) {
    const gate = await canSpendCredits(estimate, { allowManual });
    if (!gate.ok) {
      await logBlockedAttempt({ endpoint, siteUrl, estimate, reason: gate.reason || "blocked" });
      throw new SerankingApiError(gate.reason || "Credit budget exceeded.", { status: 429 });
    }
  }

  const apiKey = getApiKey();
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query || {})) {
    if (v != null && v !== "") q.set(k, String(v));
  }
  if (method === "GET" && !q.has("apikey")) q.set("apikey", apiKey);

  const url = `${SERANKING_BASE}${path.startsWith("/") ? path : `/${path}`}${q.toString() ? `?${q}` : ""}`;

  const headers = { Authorization: `Token ${apiKey}`, Accept: "application/json" };
  const init = { method, headers, cache: "no-store" };
  if (body != null && method !== "GET") {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg =
      data?.error?.description ||
      data?.error?.message ||
      data?.message ||
      (typeof data === "string" ? data : `SE Ranking API error (${res.status})`);
    throw new SerankingApiError(String(msg).slice(0, 500), { status: res.status, body: data });
  }

  const spent =
    creditsOnSuccess != null
      ? Math.max(0, Math.floor(Number(creditsOnSuccess)))
      : skipBudget
        ? 0
        : estimate;

  if (spent > 0) {
    await recordCreditSpend({ credits: spent, endpoint, siteUrl, status: "success" });
  }

  return data;
}

export async function serankingGetSubscription() {
  return serankingRequest({
    method: "GET",
    path: "/account/subscription",
    skipBudget: true,
    creditEstimate: 0,
    endpointLabel: "account/subscription",
  });
}
