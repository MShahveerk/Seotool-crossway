/**
 * Meta Graph helpers for live page/IG metrics (SMM stats).
 * Tries page-specific tokens first, then META_PAGE_ACCESS_TOKEN / META_APP_ACCESS_TOKEN.
 */
import axios from "axios";

const GRAPH = "https://graph.facebook.com/v20.0";

export function metaAccessTokens() {
  const page = String(process.env.META_PAGE_ACCESS_TOKEN || "").trim();
  const app = String(process.env.META_APP_ACCESS_TOKEN || "").trim();
  const out = [];
  if (page) out.push(page);
  if (app && app !== page) out.push(app);
  return out;
}

function uniqueTokens(list) {
  const seen = new Set();
  const out = [];
  for (const t of list || []) {
    const token = String(t || "").trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

function graphErrorMessage(err) {
  return err?.response?.data?.error?.message || err?.message || "Graph request failed";
}

/**
 * Resolve a Page access token for a given Facebook page id.
 * User tokens expose per-page tokens via /me/accounts; page tokens match /me.id.
 */
export async function resolvePageAccessToken(pageId) {
  const id = String(pageId || "").trim();
  if (!/^\d+$/.test(id)) return null;
  const envTokens = metaAccessTokens();

  for (const token of envTokens) {
    try {
      const meRes = await axios.get(`${GRAPH}/me`, {
        params: { fields: "id", access_token: token },
        timeout: 15000,
      });
      if (String(meRes.data?.id || "") === id) return token;
    } catch {
      // try accounts list
    }

    try {
      const accRes = await axios.get(`${GRAPH}/me/accounts`, {
        params: { fields: "id,access_token", limit: 100, access_token: token },
        timeout: 20000,
      });
      const rows = Array.isArray(accRes.data?.data) ? accRes.data.data : [];
      const match = rows.find((p) => String(p?.id || "") === id && p?.access_token);
      if (match?.access_token) return String(match.access_token);
    } catch {
      // continue
    }
  }

  return null;
}

/**
 * GET a Graph path, trying preferred tokens then env tokens.
 * @returns {{ data: object|null, tokenUsed: string|null, error: string|null }}
 */
export async function metaGraphGet(path, { fields, since, until, period, metric, tokens } = {}) {
  const tryTokens = uniqueTokens([...(tokens || []), ...metaAccessTokens()]);
  if (!tryTokens.length) {
    return { data: null, tokenUsed: null, error: "No Meta access token configured." };
  }

  const errors = [];
  for (const token of tryTokens) {
    try {
      const params = new URLSearchParams();
      params.set("access_token", token);
      if (fields) params.set("fields", fields);
      if (metric) params.set("metric", metric);
      if (period) params.set("period", period);
      if (since != null) params.set("since", String(since));
      if (until != null) params.set("until", String(until));

      const url = `${GRAPH}${path.startsWith("/") ? path : `/${path}`}?${params.toString()}`;
      const res = await axios.get(url, { timeout: 25000 });
      if (res.data?.error?.message) {
        errors.push(res.data.error.message);
        continue;
      }
      return { data: res.data, tokenUsed: token.slice(0, 8) + "…", error: null };
    } catch (err) {
      errors.push(graphErrorMessage(err));
    }
  }

  return { data: null, tokenUsed: null, error: errors.filter(Boolean)[0] || "Graph request failed" };
}

/** Live Facebook page followers + name. */
export async function fetchFacebookPageLive(pageId, { tokens } = {}) {
  const id = String(pageId || "").trim();
  if (!/^\d+$/.test(id)) {
    return { ok: false, followers: null, name: null, error: "Invalid Facebook page id." };
  }

  const preferred = uniqueTokens([...(tokens || [])]);
  if (!preferred.length) {
    const pageToken = await resolvePageAccessToken(id);
    if (pageToken) preferred.push(pageToken);
  }

  const fieldCombos = [
    "id,name,followers_count,fan_count",
    "id,name,fan_count,followers_count",
    "id,name,fan_count",
    "id,name,followers_count",
    "id,name",
  ];

  let lastError = null;
  let best = null;
  for (const fields of fieldCombos) {
    const { data, error } = await metaGraphGet(`/${id}`, { fields, tokens: preferred });
    if (!data?.id) {
      lastError = error || lastError;
      continue;
    }
    const followers = Number(data.followers_count ?? data.fan_count);
    const row = {
      ok: true,
      followers: Number.isFinite(followers) ? followers : null,
      name: data.name || null,
      error: null,
    };
    if (row.followers != null && row.followers > 0) return row;
    if (!best) best = row;
  }

  if (best) return best;
  return { ok: false, followers: null, name: null, error: lastError || "Page not found." };
}

/** Live Instagram business account followers + username. */
export async function fetchInstagramLive(igUserId, { tokens } = {}) {
  const id = String(igUserId || "").trim();
  if (!/^\d+$/.test(id)) {
    return { ok: false, followers: null, username: null, error: "Invalid Instagram user id." };
  }

  const preferred = uniqueTokens([...(tokens || [])]);
  const fieldCombos = [
    "id,name,username,followers_count",
    "id,username,followers_count",
    "id,username,name",
  ];

  let lastError = null;
  let best = null;
  for (const fields of fieldCombos) {
    const { data, error } = await metaGraphGet(`/${id}`, { fields, tokens: preferred });
    if (!data?.id) {
      lastError = error || lastError;
      continue;
    }
    const followers = Number(data.followers_count);
    const row = {
      ok: true,
      followers: Number.isFinite(followers) ? followers : null,
      username: data.username || data.name || null,
      error: null,
    };
    if (row.followers != null && row.followers > 0) return row;
    if (!best) best = row;
  }

  if (best) return best;
  return { ok: false, followers: null, username: null, error: lastError || "IG account not found." };
}

/** Day-level page insights (reach + engagements). */
export async function fetchFacebookInsightsDaily(pageId, since, until, { tokens } = {}) {
  const id = String(pageId || "").trim();
  const preferred = uniqueTokens([...(tokens || [])]);
  if (!preferred.length) {
    const pageToken = await resolvePageAccessToken(id);
    if (pageToken) preferred.push(pageToken);
  }

  // Try current + legacy metric names (Meta renames these often).
  const metricCombos = [
    "page_impressions_unique,page_post_engagements",
    "page_media_view,page_post_engagements",
    "page_impressions,page_post_engagements",
    "page_follows",
  ];

  let data = null;
  let error = null;
  for (const metric of metricCombos) {
    const res = await metaGraphGet(`/${id}/insights`, {
      metric,
      period: "day",
      since,
      until,
      tokens: preferred,
    });
    if (res.data?.data?.length) {
      data = res.data;
      break;
    }
    error = res.error;
  }

  if (!data?.data) {
    return { ok: false, days: new Map(), error: error || "No insights." };
  }

  const days = new Map();
  const reachData =
    data.data.find((d) => d.name === "page_impressions_unique")?.values ||
    data.data.find((d) => d.name === "page_media_view")?.values ||
    data.data.find((d) => d.name === "page_impressions")?.values ||
    data.data.find((d) => d.name === "page_follows")?.values ||
    [];
  const engagementData = data.data.find((d) => d.name === "page_post_engagements")?.values || [];

  for (const item of reachData) {
    const dateStr = String(item.end_time || "").split("T")[0];
    if (!dateStr) continue;
    days.set(dateStr, {
      statDate: new Date(dateStr),
      reach: Number(item.value || 0),
      engagements: 0,
    });
  }
  for (const item of engagementData) {
    const dateStr = String(item.end_time || "").split("T")[0];
    if (!dateStr) continue;
    const existing = days.get(dateStr) || {
      statDate: new Date(dateStr),
      reach: 0,
      engagements: 0,
    };
    existing.engagements = Number(item.value || 0);
    days.set(dateStr, existing);
  }

  return { ok: days.size > 0, days, error: days.size ? null : error };
}

/** Day-level IG insights (reach + engagements). */
export async function fetchInstagramInsightsDaily(igUserId, since, until, { tokens } = {}) {
  const id = String(igUserId || "").trim();
  const preferred = uniqueTokens([...(tokens || [])]);

  let data = null;
  let error = null;
  for (const metric of ["reach,accounts_engaged", "reach,impressions", "reach"]) {
    const res = await metaGraphGet(`/${id}/insights`, {
      metric,
      period: "day",
      since,
      until,
      tokens: preferred,
    });
    if (res.data?.data?.length) {
      data = res.data;
      break;
    }
    error = res.error;
  }
  if (!data?.data) {
    return { ok: false, days: new Map(), error: error || "No IG insights." };
  }

  const days = new Map();
  const reachData = data.data.find((d) => d.name === "reach")?.values || [];
  const engData =
    data.data.find((d) => d.name === "accounts_engaged")?.values ||
    data.data.find((d) => d.name === "impressions")?.values ||
    [];

  for (const item of reachData) {
    const dateStr = String(item.end_time || "").split("T")[0];
    if (!dateStr) continue;
    days.set(dateStr, {
      statDate: new Date(dateStr),
      reach: Number(item.value || 0),
      engagements: 0,
    });
  }
  for (const item of engData) {
    const dateStr = String(item.end_time || "").split("T")[0];
    if (!dateStr) continue;
    const existing = days.get(dateStr) || {
      statDate: new Date(dateStr),
      reach: 0,
      engagements: 0,
    };
    existing.engagements = Number(item.value || 0);
    days.set(dateStr, existing);
  }

  return { ok: days.size > 0, days, error: days.size ? null : error };
}
