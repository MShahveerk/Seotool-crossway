/**
 * Shared WordPress REST API client (Application Password auth).
 */
import axios from "axios";
import https from "https";
import { logWordpressHttp, logWordpressVerbose, logWordpress } from "./wordpressLogger.js";
import {
  formatWordpressGmtDate,
  formatWordpressLocalDate,
  getAppTimezone,
  parseWordpressLocalDate,
} from "./timezone.js";

/** Reuse TLS connections — reduces handshake failures to slow hosts (e.g. SiteGround). */
const WP_HTTPS_AGENT = new https.Agent({
  keepAlive: true,
  maxSockets: 4,
  maxFreeSockets: 2,
  timeout: 60000,
});

export function isTransientWordpressNetworkError(error) {
  const msg = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toUpperCase();
  const transientCodes = new Set([
    "ECONNRESET",
    "ECONNABORTED",
    "ETIMEDOUT",
    "ESOCKETTIMEDOUT",
    "EPIPE",
    "ENOTFOUND",
    "EAI_AGAIN",
    "ERR_NETWORK",
  ]);
  if (transientCodes.has(code)) return true;
  if (msg.includes("socket disconnected")) return true;
  if (msg.includes("tls connection")) return true;
  if (msg.includes("secure tls")) return true;
  if (msg.includes("network error")) return true;
  if (msg.includes("timeout")) return true;
  return false;
}

function getWordpressHttpRetries() {
  const raw = Number(process.env.WORDPRESS_HTTP_RETRIES || 2);
  return Number.isFinite(raw) && raw >= 0 ? Math.min(raw, 5) : 2;
}

async function withWordpressRetry(fn, { label = "WordPress HTTP", retries = getWordpressHttpRetries() } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !isTransientWordpressNetworkError(error)) throw error;
      const waitMs = 1500 * (attempt + 1);
      logWordpress("http_retry", { label, attempt: attempt + 1, waitMs, error: error.message });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError;
}

function wpAxiosOptions({ auth, timeout, headers = {}, ...rest } = {}) {
  return {
    auth,
    timeout,
    headers: { ...WP_NO_CACHE_HEADERS, ...headers },
    httpsAgent: WP_HTTPS_AGENT,
    ...rest,
  };
}

export function getWordpressConfig(config) {
  const base = String(config?.wordpressUrl || "").trim().replace(/\/+$/, "");
  const username = String(config?.wordpressUsername || "").trim();
  const password = String(config?.wordpressAppPassword || "")
    .trim()
    .replace(/\s+/g, "");
  if (!base || !username || !password) {
    const err = new Error("WordPress URL, username, and application password are required.");
    err.status = 400;
    throw err;
  }
  return { base, auth: { username, password } };
}

const WP_NO_CACHE_HEADERS = {
  "Cache-Control": "no-cache, no-store, must-revalidate",
  Pragma: "no-cache",
};

function wpCacheBust() {
  return Date.now();
}

export function getWordpressHttpTimeout() {
  const raw = Number(process.env.WORDPRESS_HTTP_TIMEOUT_MS || 90000);
  return Number.isFinite(raw) && raw >= 15000 ? raw : 90000;
}

export function detectWordpressBlockResponse(res) {
  const contentType = String(res?.headers?.["content-type"] || "");
  const raw = typeof res?.data === "string" ? res.data : JSON.stringify(res?.data || "");
  const status = res?.status;

  if (raw.includes("sgcaptcha") || raw.includes(".well-known/sgcaptcha")) {
    const ipMatch = raw.match(/ipr:([\d.]+):/);
    const blockedIp = ipMatch?.[1] || null;
    return {
      blocked: true,
      provider: "SiteGround",
      blockedIp,
      message: `SiteGround captcha/firewall blocked your server${blockedIp ? ` (IP ${blockedIp})` : ""} from reaching the WordPress REST API. Whitelist that IP in SiteGround → Security, or allow /wp-json/ for server requests. WordPress never saw your application password.`,
    };
  }

  if ((status === 202 || status === 403) && contentType.includes("text/html") && !raw.includes('"name"') && !raw.includes("application/json")) {
    return {
      blocked: true,
      provider: "firewall",
      blockedIp: null,
      message:
        "Hosting firewall returned HTML instead of WordPress JSON. Server-to-server REST API calls are being blocked — not a wrong password issue.",
    };
  }

  return { blocked: false };
}

function assertWordpressJsonResponse(res, action = "WordPress request") {
  const block = detectWordpressBlockResponse(res);
  if (block.blocked) {
    const err = new Error(block.message);
    err.status = 502;
    err.code = "wordpress_host_blocked";
    err.block = block;
    throw err;
  }
  if (typeof res?.data === "string" && res.data.trim().startsWith("<")) {
    const err = new Error(`${action} returned HTML instead of JSON — hosting firewall or captcha is blocking REST API access.`);
    err.status = 502;
    err.code = "wordpress_host_blocked";
    throw err;
  }
}

/** Low-level GET with keep-alive agent + transient retries (no JSON validation). */
export async function wordpressRawGet(url, { auth, params = {}, timeout = getWordpressHttpTimeout(), headers = {}, logLabel = "wordpressRawGet" } = {}) {
  return withWordpressRetry(
    () =>
      axios.get(
        url,
        wpAxiosOptions({
          auth,
          timeout,
          params: { ...params, _nc: wpCacheBust() },
          headers,
        })
      ),
    { label: logLabel }
  );
}

async function wpGet(url, { auth, params = {}, timeout = getWordpressHttpTimeout(), logLabel = "wpGet" } = {}) {
  const started = Date.now();
  const requestParams = { ...params, _nc: wpCacheBust() };

  try {
    const res = await wordpressRawGet(url, { auth, params, timeout, logLabel });
    assertWordpressJsonResponse(res, logLabel);
    logWordpressHttp({
      label: logLabel,
      method: "GET",
      url,
      params: requestParams,
      authenticated: Boolean(auth?.username),
      authUsername: auth?.username || null,
      status: res.status,
      durationMs: Date.now() - started,
      xWpTotal: res.headers["x-wp-total"] ?? null,
      xWpTotalPages: res.headers["x-wp-totalpages"] ?? null,
      resultCount: Array.isArray(res.data) ? res.data.length : res.data ? 1 : 0,
    });
    logWordpressVerbose("http_body", {
      label: logLabel,
      url,
      bodyPreview: Array.isArray(res.data)
        ? res.data.slice(0, 2).map((p) => ({ id: p?.id, status: p?.status, title: p?.title?.rendered || p?.title }))
        : { id: res.data?.id, name: res.data?.name, roles: res.data?.roles, code: res.data?.code },
    });
    return res;
  } catch (error) {
    const data = error?.response?.data;
    logWordpressHttp({
      label: logLabel,
      method: "GET",
      url,
      params: requestParams,
      authenticated: Boolean(auth?.username),
      authUsername: auth?.username || null,
      status: error?.response?.status || null,
      durationMs: Date.now() - started,
      error: data?.message || error.message,
      code: data?.code || null,
    });
    throw error;
  }
}

function tallyWordpressStatuses(posts = []) {
  const counts = {};
  for (const post of posts) {
    const status = String(post?.status || "unknown");
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

function batchMatchesStatuses(batch, allowedStatuses) {
  if (!Array.isArray(batch) || batch.length === 0) return true;
  const allowed = new Set(allowedStatuses);
  return batch.every((post) => allowed.has(String(post?.status || "")));
}

async function fetchWordpressPostsPaginated(config, { status, perPage = 100, maxPages = 20, fields = null } = {}) {
  const { base, auth } = getWordpressConfig(config);
  const merged = [];
  let headerTotal = null;

  for (let page = 1; page <= maxPages; page += 1) {
    const params = {
      status,
      context: "edit",
      per_page: Math.min(Math.max(perPage, 1), 100),
      page,
      orderby: "modified",
      order: "desc",
    };
    if (fields) params._fields = fields;

    const res = await wpGet(`${base}/wp-json/wp/v2/posts`, { auth, params });
    const batch = Array.isArray(res.data) ? res.data : [];
    if (page === 1) headerTotal = Number(res.headers["x-wp-total"] || batch.length);
    merged.push(...batch);

    const totalPages = Number(res.headers["x-wp-totalpages"] || 1);
    if (page >= totalPages || batch.length === 0) break;
  }

  return { posts: merged, headerTotal };
}

async function collectWordpressPostsByStatuses(config, statuses, { perPage = 100, maxPages = 10, fields = null, embed = false } = {}) {
  const byId = new Map();
  for (const status of statuses) {
    try {
      const { posts } = await fetchWordpressPostsPaginated(config, {
        status,
        perPage,
        maxPages,
        fields,
      });
      for (const post of posts) {
        if (post?.id != null) byId.set(post.id, post);
      }
    } catch {
      /* status not permitted for this user */
    }
  }
  return [...byId.values()];
}

export async function probeWordpressAccess(config) {
  const { base, auth } = getWordpressConfig(config);

  let me = null;
  try {
    const meRes = await wpGet(`${base}/wp-json/wp/v2/users/me`, {
      auth,
      params: { context: "edit", _fields: "id,name,slug,roles,capabilities" },
    });
    me = meRes.data;
  } catch (error) {
    return {
      user: null,
      probes: [],
      diagnosis: formatWordpressError(error, "WordPress user lookup").message,
    };
  }

  async function probe(label, params, { authenticated = true } = {}) {
    try {
      const res = await wpGet(`${base}/wp-json/wp/v2/posts`, {
        auth: authenticated ? auth : undefined,
        timeout: 15000,
        params: {
          per_page: 5,
          page: 1,
          _fields: "id,status,title,author,modified",
          ...params,
        },
      });
      const batch = Array.isArray(res.data) ? res.data : [];
      return {
        label,
        ok: true,
        total: Number(res.headers["x-wp-total"] || batch.length),
        sample: batch.slice(0, 3).map((post) => ({
          id: post.id,
          status: post.status,
          author: post.author,
          title: stripHtml(post.title?.rendered || post.title || ""),
        })),
      };
    } catch (error) {
      const data = error?.response?.data;
      return {
        label,
        ok: false,
        status: error?.response?.status || null,
        error: data?.message || error.message,
        code: data?.code || null,
      };
    }
  }

  const probes = [];
  for (const [label, params, opts] of [
    ["public published posts", { status: "publish", context: "view" }, { authenticated: false }],
    ["authenticated publish", { status: "publish", context: "view" }, { authenticated: true }],
    ["authenticated drafts", { status: "draft", context: "edit" }, { authenticated: true }],
    ["authenticated scheduled", { status: "future", context: "edit" }, { authenticated: true }],
    ["authenticated trash", { status: "trash", context: "edit" }, { authenticated: true }],
    ["authenticated all statuses", { status: "any", context: "edit" }, { authenticated: true }],
  ]) {
    probes.push(await probe(label, params, opts));
  }

  const publicPublish = probes[0]?.ok ? probes[0].total : 0;
  const authEditable = probes[5]?.ok ? probes[5].total : 0;
  const roles = Array.isArray(me?.roles) ? me.roles : [];
  const roleLabel = roles.length ? roles.join(", ") : "unknown role";

  let diagnosis = null;
  if (publicPublish > 0 && authEditable === 0) {
    diagnosis = `Authenticated as "${me?.name || me?.slug || "user"}" (${roleLabel}) but WordPress returned 0 editable posts while ${publicPublish} published posts are public. Use an Administrator or Editor application password for an account that owns the drafts/scheduled posts (not a limited/subscriber account).`;
  } else if (publicPublish === 0 && authEditable === 0) {
    diagnosis =
      "WordPress returned 0 posts for every query. Confirm the site URL, REST API access, and that the post is a standard blog Post (not a Page).";
  }

  return {
    user: { id: me?.id, name: me?.name || me?.slug, roles },
    probes,
    diagnosis,
  };
}

export async function fetchWordpressPostById(config, postId) {
  const id = Number(postId);
  if (!Number.isFinite(id) || id <= 0) {
    const err = new Error("A valid WordPress post ID is required.");
    err.status = 400;
    throw err;
  }
  const { base, auth } = getWordpressConfig(config);
  try {
    const res = await wpGet(`${base}/wp-json/wp/v2/posts/${id}`, {
      auth,
      params: { context: "edit", _embed: 1 },
    });
    return res.data;
  } catch (error) {
    throw formatWordpressError(error, `Fetching WordPress post #${id}`);
  }
}

export function formatWordpressError(error, action = "WordPress request") {
  const status = error?.response?.status;
  const data = error?.response?.data;
  const code = data?.code || data?.error?.code;
  const message = data?.message || data?.error?.message || error?.message || `${action} failed.`;

  if (status === 401) {
    return new Error("WordPress authentication failed. Check username and application password.");
  }
  if (status === 403 || code === "rest_forbidden_context") {
    return new Error(
      "WordPress denied access to drafts or scheduled posts. Use an Administrator or Editor account with permission to edit others' posts."
    );
  }
  if (status === 404) {
    return new Error("WordPress REST API not found. Confirm the site URL and that REST API is enabled.");
  }
  if (code === "rest_invalid_param" && String(message).includes("status")) {
    return new Error(`WordPress rejected the post status filter. ${message}`);
  }
  if (isTransientWordpressNetworkError(error)) {
    return new Error(
      `${action}: secure connection to WordPress dropped before completing (TLS/network). This is usually transient — try again in a moment. If it keeps happening, SiteGround may be throttling your server IP. (${message})`
    );
  }

  const err = new Error(`${action}: ${message}`);
  err.status = status || error?.status || 500;
  return err;
}

function parseWordpressDate(raw, { assumeUtc = true, siteTimezone = null } = {}) {
  if (!raw) return null;
  let s = String(raw).trim().replace(" ", "T").replace(/\.\d+/, "");
  if (!s) return null;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (assumeUtc) {
    const d = new Date(`${s}Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // WP `date` is site-local with no offset — interpret in the site timezone,
  // never the server's local TZ (Render is UTC).
  return parseWordpressLocalDate(s, siteTimezone || getAppTimezone());
}

export function getWordpressScheduledDate(wpPost, { siteTimezone = null } = {}) {
  if (!wpPost) return null;
  // Prefer GMT — absolute publish moment. Fall back to local date in WP TZ.
  return (
    parseWordpressDate(wpPost.date_gmt, { assumeUtc: true }) ||
    parseWordpressDate(wpPost.date, { assumeUtc: false, siteTimezone })
  );
}

export function isWordpressScheduledPost(wpPost, now = new Date(), { siteTimezone = null } = {}) {
  if (String(wpPost?.status || "") === "future") return true;
  const scheduled = getWordpressScheduledDate(wpPost, { siteTimezone });
  if (!scheduled) return false;
  return scheduled.getTime() > now.getTime();
}

async function countWordpressPostsForStatus(config, status) {
  const { base, auth } = getWordpressConfig(config);
  try {
    const res = await wpGet(`${base}/wp-json/wp/v2/posts`, {
      auth,
      timeout: 15000,
      params: { status, context: "edit", per_page: 20, page: 1 },
    });
    const batch = Array.isArray(res.data) ? res.data : [];
    const headerTotal = Number(res.headers["x-wp-total"] || batch.length || 0);
    const matching = batch.filter((post) => String(post?.status || "") === status).length;
    const filterWorks = batch.length === 0 || matching === batch.length;
    return {
      status,
      total: filterWorks ? headerTotal : null,
      headerTotal,
      totalPages: Number(res.headers["x-wp-totalpages"] || 1),
      ok: true,
      filterWorks,
      sampleStatuses: [...new Set(batch.map((post) => post?.status).filter(Boolean))],
    };
  } catch (error) {
    return { status, total: null, totalPages: 0, ok: false, error: error.message, filterWorks: false };
  }
}

export async function getWordpressPostStatusSummary(config) {
  const statuses = ["publish", "draft", "future", "pending", "private", "trash"];
  const parts = await Promise.all(statuses.map((status) => countWordpressPostsForStatus(config, status)));
  const okParts = parts.filter((part) => part.ok);
  const filterWorks = okParts.length > 0 && okParts.every((part) => part.filterWorks);
  const headerTotals = okParts.map((part) => part.headerTotal).filter((n) => typeof n === "number");
  const statusFilterBroken =
    !filterWorks ||
    (headerTotals.length > 1 && Math.max(...headerTotals) - Math.min(...headerTotals) <= 3);

  if (statusFilterBroken) {
    let posts = [];
    try {
      const anyFetch = await fetchWordpressPostsPaginated(config, {
        status: "any",
        perPage: 100,
        maxPages: 30,
        fields: "id,status,title,date,date_gmt,modified",
      });
      posts = anyFetch.posts;
    } catch {
      posts = [];
    }

    if (!posts.length) {
      posts = await collectWordpressPostsByStatuses(config, statuses, {
        perPage: 100,
        maxPages: 30,
        fields: "id,status,title,date,date_gmt,modified",
      });
    }

    const counts = tallyWordpressStatuses(posts);
    const apiTotal = Object.values(counts).reduce((sum, n) => sum + (typeof n === "number" ? n : 0), 0);

    return {
      counts,
      apiTotal,
      wordpressUrl: getWordpressConfig(config).base,
      statusFilterBroken: true,
      statusFilterNote:
        apiTotal === 0
          ? "No editable posts returned for this WordPress user."
          : "WordPress returned unreliable status totals; counts below are from actual post records.",
    };
  }

  const counts = {};
  for (const part of parts) {
    counts[part.status] = part.ok ? part.total : null;
  }
  const apiTotal = Object.values(counts).reduce((sum, n) => sum + (typeof n === "number" ? n : 0), 0);
  return { counts, apiTotal, wordpressUrl: getWordpressConfig(config).base, statusFilterBroken: false };
}

export async function testWordpressConnection(config) {
  const { base, auth } = getWordpressConfig(config);
  try {
    const res = await withWordpressRetry(
      () => axios.get(`${base}/wp-json/wp/v2/users/me`, wpAxiosOptions({ auth, timeout: 20000 })),
      { label: "WordPress connection test (users/me)" }
    );

    async function countStatus(status) {
      try {
        const countRes = await wpGet(`${base}/wp-json/wp/v2/posts`, {
          auth,
          timeout: 15000,
          logLabel: `test count (${status})`,
          params: { status, context: "edit", per_page: 1, page: 1, _fields: "id" },
        });
        return Number(countRes.headers["x-wp-total"] || 0);
      } catch {
        return null;
      }
    }

    const draftCount = await countStatus("draft");
    const futureCount = await countStatus("future");
    const pendingCount = await countStatus("pending");

    let sampleDrafts = [];
    try {
      const sampleRes = await wpGet(`${base}/wp-json/wp/v2/posts`, {
        auth,
        timeout: 15000,
        logLabel: "test sample posts",
        params: {
          status: "future,draft,pending",
          context: "edit",
          per_page: 5,
          orderby: "modified",
          order: "desc",
          _fields: "id,title,status,date,date_gmt,modified",
        },
      });
      sampleDrafts = (sampleRes.data || [])
        .filter((p) => ["draft", "future", "pending"].includes(String(p?.status || "")))
        .map((p) => ({
          id: p.id,
          title: stripHtml(p.title?.rendered || p.title || ""),
          status: p.status,
          modified: p.modified_gmt || p.modified,
          scheduledFor: getWordpressScheduledDate(p)?.toISOString() || null,
        }));
    } catch {
      sampleDrafts = [];
    }

    const counts = { draft: draftCount, future: futureCount, pending: pendingCount };
    const apiTotal = [draftCount, futureCount, pendingCount]
      .filter((n) => typeof n === "number")
      .reduce((sum, n) => sum + n, 0);

    return {
      ok: true,
      name: res.data?.name || res.data?.slug || usernameLabel(auth.username),
      roles: res.data?.roles || [],
      wordpressUrl: base,
      canListDrafts: draftCount !== null,
      draftCount,
      futureCount,
      statusCounts: counts,
      apiTotal,
      statusFilterBroken: false,
      statusFilterNote: null,
      accessProbe: null,
      diagnosis:
        apiTotal > 0
          ? `API access looks OK (${apiTotal} draft/scheduled/pending post(s) visible to this user).`
          : "WordPress returned 0 draft, scheduled, or pending posts for this account.",
      sampleDrafts,
    };
  } catch (error) {
    throw formatWordpressError(error, "WordPress connection test");
  }
}

function usernameLabel(u) {
  return String(u || "user");
}

export async function fetchWordpressPosts(
  config,
  { statuses = ["draft", "future", "pending"], perPage = 50, maxPages = 10 } = {}
) {
  const { base, auth } = getWordpressConfig(config);
  const uniqueStatuses = [...new Set(statuses.map((s) => String(s || "").trim()).filter(Boolean))];
  if (!uniqueStatuses.length) uniqueStatuses.push("draft", "future", "pending");

  const merged = [];
  const seen = new Set();
  const allowed = new Set(uniqueStatuses);
  const statusCounts = tallyWordpressStatuses([]);
  const timeout = getWordpressHttpTimeout();
  const probeTimeout = Math.min(timeout, 20000);
  const pageSize = Math.min(Math.max(perPage, 1), 100);

  const listParams = (status, page) => ({
    status,
    context: "edit",
    _embed: 1,
    per_page: pageSize,
    page,
    orderby: "modified",
    order: "desc",
  });

  const ingestBatch = (batch) => {
    for (const post of batch) {
      const postStatus = String(post?.status || "");
      if (!allowed.has(postStatus)) continue;
      const id = post?.id;
      if (id == null || seen.has(id)) continue;
      seen.add(id);
      merged.push(post);
    }
  };

  const fetchStatusPages = async (status) => {
    for (let page = 1; page <= maxPages; page += 1) {
      const res = await wpGet(`${base}/wp-json/wp/v2/posts`, {
        auth,
        timeout,
        logLabel: `fetch posts (${status}) page ${page}`,
        params: listParams(status, page),
      });
      const batch = Array.isArray(res.data) ? res.data : [];
      ingestBatch(batch);
      const totalPages = Number(res.headers["x-wp-totalpages"] || 1);
      if (page >= totalPages || batch.length === 0) break;
    }
  };

  // Single-status pulls (e.g. cron scheduled-only): skip the combined probe.
  let statusFilterBroken = false;
  if (uniqueStatuses.length === 1) {
    await fetchStatusPages(uniqueStatuses[0]);
  } else {
    try {
      const combinedStatus = uniqueStatuses.join(",");
      const probeRes = await wpGet(`${base}/wp-json/wp/v2/posts`, {
        auth,
        timeout: probeTimeout,
        logLabel: "fetch posts probe",
        params: listParams(combinedStatus, 1),
      });
      const probeBatch = Array.isArray(probeRes.data) ? probeRes.data : [];
      if (!batchMatchesStatuses(probeBatch, uniqueStatuses)) {
        statusFilterBroken = true;
      } else {
        ingestBatch(probeBatch);
        const totalPages = Number(probeRes.headers["x-wp-totalpages"] || 1);
        for (let page = 2; page <= Math.min(totalPages, maxPages); page += 1) {
          const res = await wpGet(`${base}/wp-json/wp/v2/posts`, {
            auth,
            timeout,
            logLabel: `fetch posts page ${page}`,
            params: listParams(combinedStatus, page),
          });
          ingestBatch(Array.isArray(res.data) ? res.data : []);
        }
      }
    } catch {
      statusFilterBroken = true;
    }

    if (statusFilterBroken) {
      merged.length = 0;
      seen.clear();
      for (const status of uniqueStatuses) {
        try {
          await fetchStatusPages(status);
        } catch (error) {
          throw formatWordpressError(error, `Fetching WordPress posts (${status})`);
        }
      }
    }
  }

  for (const post of merged) {
    const status = String(post?.status || "unknown");
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }

  merged.sort((a, b) => {
    const am = new Date(a?.modified_gmt || a?.modified || 0).getTime();
    const bm = new Date(b?.modified_gmt || b?.modified || 0).getTime();
    return bm - am;
  });

  const scheduledDraftCount = merged.filter(
    (post) => String(post?.status || "") === "draft" && isWordpressScheduledPost(post)
  ).length;

  return { posts: merged, statusCounts, scheduledDraftCount, statusFilterBroken };
}

export async function fetchWordpressMediaUrl(config, mediaId) {
  if (!mediaId) return null;
  const { base, auth } = getWordpressConfig(config);
  const res = await axios.get(`${base}/wp-json/wp/v2/media/${mediaId}`, { auth, timeout: 15000 });
  return res.data?.source_url || res.data?.guid?.rendered || null;
}

export function extractFeaturedFromPost(wpPost) {
  const embedded = wpPost?._embedded?.["wp:featuredmedia"];
  const media = Array.isArray(embedded) ? embedded[0] : null;
  return {
    url: media?.source_url || null,
    alt: media?.alt_text || "",
    id: media?.id || wpPost?.featured_media || null,
  };
}

/**
 * Pull SEO fields from Yoast (yoast_head_json / _yoast_wpseo_*) or Rank Math
 * into the internal meta keys used by the Crossway SEO fields UI.
 */
function extractWordpressSeoMeta(wpPost) {
  const meta = wpPost?.meta && typeof wpPost.meta === "object" ? wpPost.meta : {};
  const yoast = wpPost?.yoast_head_json && typeof wpPost.yoast_head_json === "object" ? wpPost.yoast_head_json : {};

  const seoTitle = stripHtml(yoast.title || meta._yoast_wpseo_title || meta.rank_math_title || "");
  const metaDescription = stripHtml(
    yoast.description || meta._yoast_wpseo_metadesc || meta.rank_math_description || ""
  );
  // Focus keyword lives in protected plugin meta; only available when the site exposes it via REST.
  const focusKeyword = stripHtml(meta._yoast_wpseo_focuskw || meta.rank_math_focus_keyword || "");

  const out = {};
  if (seoTitle) out.seo_title = seoTitle;
  if (metaDescription) out.meta_description = metaDescription;
  if (focusKeyword) out.focus_keyword = focusKeyword;
  return out;
}

export function wpPostToCanonical(wpPost, featured = {}, { siteTimezone = null } = {}) {
  const title = wpPost?.title?.rendered || wpPost?.title || "";
  const content = wpPost?.content?.rendered || wpPost?.content || "";
  const excerpt = wpPost?.excerpt?.rendered || wpPost?.excerpt || "";
  const scheduled = getWordpressScheduledDate(wpPost, { siteTimezone });
  const rawStatus = wpPost?.status || "draft";
  const wpStatus =
    rawStatus === "future" || (rawStatus === "draft" && isWordpressScheduledPost(wpPost, new Date(), { siteTimezone }))
      ? "future"
      : rawStatus;
  const strippedTitle = stripHtml(title);
  const finalTitle =
    strippedTitle ||
    (wpPost?.slug ? String(wpPost.slug).replace(/-/g, " ") : "") ||
    `Draft #${wpPost?.id || "unknown"}`;
  const mergedMeta = { ...(wpPost?.meta || {}), ...extractWordpressSeoMeta(wpPost) };

  return {
    title: finalTitle,
    content,
    excerpt: stripHtml(excerpt),
    slug: wpPost?.slug || "",
    wpStatus,
    scheduledFor: scheduled,
    externalId: wpPost?.id != null ? String(wpPost.id) : "",
    categories: wpPost?.categories || [],
    tags: wpPost?.tags || [],
    meta: mergedMeta,
    featuredImageUrl: featured.url || null,
    featuredImageAlt: featured.alt || "",
    payload: {
      title: finalTitle,
      content,
      excerpt: stripHtml(excerpt),
      slug: wpPost?.slug || "",
      status: wpStatus,
      date: scheduled ? scheduled.toISOString() : null,
      featured_media: {
        url: featured.url || null,
        alt: featured.alt || "",
        id: featured.id || null,
      },
      categories: wpPost?.categories || [],
      tags: wpPost?.tags || [],
      meta: mergedMeta,
      wordpress: {
        id: wpPost?.id,
        link: wpPost?.link,
        modified: wpPost?.modified_gmt || wpPost?.modified,
      },
    },
  };
}

function stripHtml(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

/** Resolve category/tag labels or numeric strings to WP term IDs. */
export async function resolveTaxonomyIds(config, { categories = [], tags = [] } = {}) {
  const { base, auth } = getWordpressConfig(config);
  const catIds = [];
  const tagIds = [];

  for (const item of categories) {
    if (typeof item === "number" || /^\d+$/.test(String(item))) {
      catIds.push(Number(item));
      continue;
    }
    const name = String(item).trim();
    if (!name) continue;
    const res = await axios.get(`${base}/wp-json/wp/v2/categories`, {
      auth,
      params: { search: name, per_page: 5 },
    });
    const match = (res.data || []).find((c) => c.name?.toLowerCase() === name.toLowerCase()) || res.data?.[0];
    if (match?.id) catIds.push(match.id);
  }

  for (const item of tags) {
    if (typeof item === "number" || /^\d+$/.test(String(item))) {
      tagIds.push(Number(item));
      continue;
    }
    const name = String(item).trim();
    if (!name) continue;
    const res = await axios.get(`${base}/wp-json/wp/v2/tags`, {
      auth,
      params: { search: name, per_page: 5 },
    });
    const match = (res.data || []).find((t) => t.name?.toLowerCase() === name.toLowerCase()) || res.data?.[0];
    if (match?.id) tagIds.push(match.id);
  }

  return { categories: catIds, tags: tagIds };
}

export async function uploadFeaturedMediaToWordpress(config, payload) {
  const { base, auth } = getWordpressConfig(config);
  const existingId =
    payload.featured_media?.id && /^\d+$/.test(String(payload.featured_media.id))
      ? Number(payload.featured_media.id)
      : null;
  const imageUrl = payload.featured_media?.url;
  if (!imageUrl) return existingId;

  const { absoluteMediaUrl } = await import("./blogPayload.js");
  const absolute = absoluteMediaUrl(imageUrl);
  if (!absolute) return existingId;

  // Only re-upload Crossway-hosted files; otherwise reuse the existing WP media id.
  const isLocalUpload =
    absolute.includes("/api/uploads/") ||
    String(imageUrl).startsWith("/api/uploads/") ||
    String(imageUrl).startsWith("/uploads/");
  if (!isLocalUpload && existingId) return existingId;
  if (!isLocalUpload && !existingId) return null;

  const imgRes = await axios.get(absolute, { responseType: "arraybuffer", timeout: 30000 });
  const contentType = imgRes.headers["content-type"] || "image/jpeg";
  const fileName = absolute.split("/").pop()?.split("?")[0] || "featured.jpg";

  const mediaRes = await axios.post(`${base}/wp-json/wp/v2/media`, Buffer.from(imgRes.data), {
    auth,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
    maxBodyLength: Infinity,
    timeout: 60000,
  });

  return mediaRes.data?.id || null;
}

/** Update only the status of an existing WordPress post (e.g. revert to draft). */
export async function setWordpressPostStatus(config, postId, status) {
  const { base, auth } = getWordpressConfig(config);
  const res = await axios.post(
    `${base}/wp-json/wp/v2/posts/${postId}`,
    { status },
    { auth, timeout: getWordpressHttpTimeout() }
  );
  return res.data?.status || null;
}

/**
 * Upsert a WP post.
 * @param {object} [options]
 * @param {"publish"|"future"|"draft"|"schedule"} [options.mode]
 *   - publish: live publish now (ignores future-dated status)
 *   - schedule / future: set date + status future
 *   - draft: keep as draft (optional date)
 * @param {boolean} [options.datesOnly] — only PATCH date/status (for syncing Crossway schedule onto WP)
 */
export async function upsertWordpressPost(config, payload, existingWpId = null, options = {}) {
  const { base, auth } = getWordpressConfig(config);
  const mode = String(options.mode || "").toLowerCase();
  const forcePublish = mode === "publish" || options.forcePublish === true;
  const forceSchedule = mode === "schedule" || mode === "future" || options.forceSchedule === true;
  const datesOnly = options.datesOnly === true;

  let categoryIds = Array.isArray(payload.categories) ? payload.categories : [];
  let tagIds = Array.isArray(payload.tags) ? payload.tags : [];
  if (!datesOnly) {
    const hasStrings = [...categoryIds, ...tagIds].some((x) => typeof x === "string" && !/^\d+$/.test(x));
    if (hasStrings) {
      const resolved = await resolveTaxonomyIds(config, { categories: categoryIds, tags: tagIds });
      categoryIds = resolved.categories;
      tagIds = resolved.tags;
    }
  }

  let featuredMediaId = null;
  if (!datesOnly) {
    try {
      featuredMediaId = await uploadFeaturedMediaToWordpress(config, payload);
    } catch (err) {
      console.warn("[wordpress] featured media upload failed:", err.message);
    }
  }

  const desiredStatus = String(payload.status || "publish").toLowerCase();
  const whenRaw = payload.date ? new Date(payload.date) : null;
  const when = whenRaw && !Number.isNaN(whenRaw.getTime()) ? whenRaw : null;
  const now = Date.now();

  let siteTimezone = getAppTimezone();
  try {
    const { resolveWordpressTimezone } = await import("./wordpressTimezone.js");
    siteTimezone = await resolveWordpressTimezone(config);
  } catch {
    /* keep APP_TIMEZONE */
  }

  const body = datesOnly
    ? {}
    : {
        title: payload.title,
        content: payload.content,
        excerpt: payload.excerpt || "",
        slug: payload.slug || undefined,
        categories: categoryIds.length ? categoryIds : undefined,
        tags: tagIds.length ? tagIds : undefined,
      };

  if (!datesOnly && payload.meta && typeof payload.meta === "object" && Object.keys(payload.meta).length) {
    body.meta = payload.meta;
  }

  // Live publish: use a slightly past instant so clock skew cannot bounce WP to "future".
  let effectiveWhen = when;
  if (forcePublish) {
    effectiveWhen = new Date(Date.now() - 120_000);
  }

  if (effectiveWhen) {
    body.date_gmt = formatWordpressGmtDate(effectiveWhen);
    body.date = formatWordpressLocalDate(effectiveWhen, siteTimezone);
  }

  // Status resolution:
  // - forcePublish → always "publish" (live)
  // - forceSchedule / future date ahead → "future"
  // - draft desired → "draft"
  // - otherwise publish
  if (forcePublish || (effectiveWhen && effectiveWhen.getTime() <= now && !forceSchedule && desiredStatus !== "draft")) {
    body.status = "publish";
  } else if (desiredStatus === "draft" && !forceSchedule && !forcePublish) {
    body.status = "draft";
  } else if (forceSchedule || (effectiveWhen && effectiveWhen.getTime() > now)) {
    body.status = "future";
  } else {
    body.status = desiredStatus === "draft" ? "draft" : "publish";
  }

  if (featuredMediaId) body.featured_media = featuredMediaId;

  const wpId = existingWpId || payload?.wordpress?.id || null;

  const writePost = async (payloadBody) => {
    try {
      if (wpId) {
        // WP REST prefers POST for updates; more compatible with hosts that reject PUT.
        return await axios.post(`${base}/wp-json/wp/v2/posts/${wpId}`, payloadBody, {
          auth,
          timeout: 45000,
        });
      }
      if (datesOnly) {
        const err = new Error("Cannot sync schedule: WordPress post id missing.");
        err.skippable = true;
        throw err;
      }
      return await axios.post(`${base}/wp-json/wp/v2/posts`, payloadBody, {
        auth,
        timeout: 45000,
      });
    } catch (error) {
      throw formatWordpressError(error, wpId ? "Updating WordPress post" : "Creating WordPress post");
    }
  };

  let res;
  try {
    res = await writePost(body);
  } catch (err) {
    // Meta / taxonomy often 403 on publish — retry a clean content body.
    if (datesOnly || !body.title) throw err;
    const slim = {
      title: body.title,
      content: body.content,
      excerpt: body.excerpt,
      slug: body.slug,
      status: body.status,
      date: body.date,
      date_gmt: body.date_gmt,
    };
    if (featuredMediaId) slim.featured_media = featuredMediaId;
    console.warn(`[wordpress] upsert retry without meta/tax: ${err.message}`);
    res = await writePost(slim);
  }

  // If WP still returned future/draft on a live publish, force status+date only.
  if (
    forcePublish &&
    wpId &&
    res.data?.status &&
    !["publish", "private"].includes(String(res.data.status))
  ) {
    const past = new Date(Date.now() - 120_000);
    const forceBody = {
      status: "publish",
      date_gmt: formatWordpressGmtDate(past),
      date: formatWordpressLocalDate(past, siteTimezone),
    };
    console.warn(
      `[wordpress] status was "${res.data.status}" after publish upsert — forcing status=publish`
    );
    res = await writePost(forceBody);
  }

  return {
    externalId: res.data?.id ? String(res.data.id) : wpId ? String(wpId) : null,
    link: res.data?.link || null,
    status: res.data?.status || null,
    responseBody: JSON.stringify({
      id: res.data?.id,
      link: res.data?.link,
      status: res.data?.status,
      date: res.data?.date,
      date_gmt: res.data?.date_gmt,
    }).slice(0, 4000),
  };
}

/** Sync Crossway scheduledFor onto an existing WP post as status=future (or draft). */
export async function syncWordpressSchedule(config, wpPostId, scheduledFor, { asDraft = false } = {}) {
  if (!wpPostId || !scheduledFor) return null;
  return upsertWordpressPost(
    config,
    {
      date: scheduledFor instanceof Date ? scheduledFor.toISOString() : new Date(scheduledFor).toISOString(),
      status: asDraft ? "draft" : "future",
    },
    wpPostId,
    { mode: asDraft ? "draft" : "schedule", datesOnly: true, forceSchedule: !asDraft }
  );
}
