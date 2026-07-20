/**
 * WordPress connection diagnostics — config audit + HTTP request trace (no full secrets).
 */
import axios from "axios";
import { getWordpressConfig, formatWordpressError } from "./wordpressClient.js";
import { logWordpress, logWordpressTrace, logWordpressVerbose } from "./wordpressLogger.js";

const WP_NO_CACHE_HEADERS = {
  "Cache-Control": "no-cache, no-store, must-revalidate",
  Pragma: "no-cache",
};

export function summarizePassword(password) {
  const raw = String(password || "");
  if (!raw) {
    return { stored: false, length: 0, preview: null, note: "No password available" };
  }
  if (raw === "••••••••") {
    return { stored: "masked_in_ui", length: null, preview: null, note: "Form shows placeholder only — using saved DB value for test if saved" };
  }
  const normalized = raw.replace(/\s+/g, "");
  return {
    stored: true,
    length: normalized.length,
    preview: normalized.length >= 4 ? `${normalized.slice(0, 2)}…${normalized.slice(-2)}` : "****",
    note: normalized.length >= 20 ? "Looks like a WordPress application password length" : "Password looks short — confirm you pasted the full app password",
  };
}

export function resolveEffectiveWordpressCredentials({ savedConfig, body = {} } = {}) {
  const rawFormPassword = String(body.wordpressAppPassword || "").trim();
  const passwordFromForm = rawFormPassword && rawFormPassword !== "••••••••" ? rawFormPassword.replace(/\s+/g, "") : "";
  const passwordFromDb = String(savedConfig?.wordpressAppPassword || "").replace(/\s+/g, "");
  const effectivePassword = passwordFromForm || passwordFromDb || "";

  let passwordSource = "missing";
  if (passwordFromForm) passwordSource = "form_field";
  else if (passwordFromDb) passwordSource = "database";

  return {
    wordpressUrl: String(body.wordpressUrl || savedConfig?.wordpressUrl || "").trim().replace(/\/+$/, ""),
    wordpressUsername: String(body.wordpressUsername || savedConfig?.wordpressUsername || "").trim(),
    wordpressAppPassword: effectivePassword,
    passwordSource,
    formPassword: summarizePassword(rawFormPassword),
    databasePassword: summarizePassword(savedConfig?.wordpressAppPassword),
    effectivePassword: summarizePassword(effectivePassword),
  };
}

export function buildConfigAudit({ selectedSite, savedConfig, body = {}, effective }) {
  return {
    selectedSite,
    savedInDatabase: {
      siteLink: savedConfig?.siteLink || null,
      wordpressUrl: savedConfig?.wordpressUrl || null,
      wordpressUsername: savedConfig?.wordpressUsername || null,
      password: summarizePassword(savedConfig?.wordpressAppPassword),
      wordpressPullEnabled: Boolean(savedConfig?.wordpressPullEnabled),
      lastWordpressPullAt: savedConfig?.lastWordpressPullAt || null,
    },
    formFields: {
      wordpressUrl: body.wordpressUrl || null,
      wordpressUsername: body.wordpressUsername || null,
      password: summarizePassword(body.wordpressAppPassword),
    },
    effectiveForRequest: {
      wordpressUrl: effective.wordpressUrl || null,
      wordpressUsername: effective.wordpressUsername || null,
      password: effective.effectivePassword,
      passwordSource: effective.passwordSource,
    },
    pullUsesDatabaseOnly: true,
    testUsesFormOrDatabase: true,
  };
}

function previewResponse(data) {
  if (data == null) return null;
  if (Array.isArray(data)) {
    return {
      type: "array",
      length: data.length,
      sample: data.slice(0, 3).map((item) => ({
        id: item?.id,
        status: item?.status,
        title: item?.title?.rendered || item?.title || item?.name || item?.slug,
        roles: item?.roles,
      })),
    };
  }
  if (typeof data === "object") {
    return {
      type: "object",
      keys: Object.keys(data).slice(0, 12),
      id: data.id,
      name: data.name,
      slug: data.slug,
      roles: data.roles,
      url: data.url,
      message: data.message,
      code: data.code,
    };
  }
  return { type: typeof data, value: String(data).slice(0, 200) };
}

async function tracedGet(trace, label, url, { auth, params = {}, timeout = 30000 } = {}) {
  const started = Date.now();
  const entry = {
    label,
    method: "GET",
    url,
    params: { ...params },
    authenticated: Boolean(auth?.username),
    authUsername: auth?.username || null,
  };

  try {
    const res = await axios.get(url, {
      auth,
      timeout,
      headers: WP_NO_CACHE_HEADERS,
      params: { ...params, _nc: Date.now() },
    });
    entry.status = res.status;
    entry.durationMs = Date.now() - started;
    entry.responseHeaders = {
      xWpTotal: res.headers["x-wp-total"] ?? null,
      xWpTotalPages: res.headers["x-wp-totalpages"] ?? null,
      contentType: res.headers["content-type"] ?? null,
    };
    entry.response = previewResponse(res.data);
    trace.push(entry);
    return res;
  } catch (error) {
    const data = error?.response?.data;
    entry.status = error?.response?.status || null;
    entry.durationMs = Date.now() - started;
    entry.error = data?.message || error.message;
    entry.code = data?.code || null;
    entry.response = previewResponse(data);
    trace.push(entry);
    throw error;
  }
}

export async function runWordpressDiagnostics(config, meta = {}) {
  const trace = [];
  const effective = meta.effective || resolveEffectiveWordpressCredentials(meta);
  const audit = buildConfigAudit({
    selectedSite: meta.selectedSite,
    savedConfig: meta.savedConfig,
    body: meta.body,
    effective,
  });

  let canonicalSiteUrl = null;
  let summary = [];
  let access = { user: null, probes: [], diagnosis: null };

  if (!effective.wordpressUrl || !effective.wordpressUsername || !effective.wordpressAppPassword) {
    return {
      ok: false,
      audit,
      trace,
      canonicalSiteUrl,
      access,
      summary: [
        "Missing WordPress URL, username, or password.",
        effective.passwordSource === "missing"
          ? "No password in form or database — paste the app password and click Save publish settings."
          : null,
      ].filter(Boolean),
    };
  }

  let wpConfig;
  try {
    wpConfig = getWordpressConfig({
      wordpressUrl: effective.wordpressUrl,
      wordpressUsername: effective.wordpressUsername,
      wordpressAppPassword: effective.wordpressAppPassword,
    });
  } catch (error) {
    return {
      ok: false,
      audit,
      trace,
      canonicalSiteUrl,
      access,
      summary: [error.message],
    };
  }

  const { base, auth } = wpConfig;

  try {
    const rootRes = await tracedGet(trace, "Discover site (wp-json)", `${base}/wp-json/`, {});
    canonicalSiteUrl = rootRes.data?.url || null;
    if (canonicalSiteUrl && canonicalSiteUrl.replace(/\/+$/, "") !== base) {
      summary.push(`WordPress canonical URL is ${canonicalSiteUrl} — consider using that exact URL in settings (currently ${base}).`);
    }
  } catch (error) {
    summary.push(`Could not load ${base}/wp-json/ — ${error.message}`);
  }

  try {
    const meRes = await tracedGet(trace, "Authenticated user (users/me)", `${base}/wp-json/wp/v2/users/me`, {
      auth,
      params: { context: "edit", _fields: "id,name,slug,roles" },
    });
    access.user = {
      id: meRes.data?.id,
      name: meRes.data?.name || meRes.data?.slug,
      roles: meRes.data?.roles || [],
    };
  } catch (error) {
    access.diagnosis = formatWordpressError(error, "WordPress user lookup").message;
    summary.push(access.diagnosis);
    return { ok: false, audit, trace, canonicalSiteUrl, access, summary };
  }

  const probeDefs = [
    ["Public published posts", { status: "publish", context: "view" }, false],
    ["Auth publish (view)", { status: "publish", context: "view" }, true],
    ["Auth drafts (edit)", { status: "draft", context: "edit" }, true],
    ["Auth scheduled (edit)", { status: "future", context: "edit" }, true],
    ["Auth pending (edit)", { status: "pending", context: "edit" }, true],
    ["Auth trash (edit)", { status: "trash", context: "edit" }, true],
    ["Auth all statuses (edit)", { status: "any", context: "edit" }, true],
  ];

  for (const [label, params, authenticated] of probeDefs) {
    try {
      const res = await tracedGet(trace, label, `${base}/wp-json/wp/v2/posts`, {
        auth: authenticated ? auth : undefined,
        params: { per_page: 5, page: 1, _fields: "id,status,title,author,modified", ...params },
        timeout: 15000,
      });
      const batch = Array.isArray(res.data) ? res.data : [];
      access.probes.push({
        label,
        ok: true,
        total: Number(res.headers["x-wp-total"] || batch.length),
        sample: batch.slice(0, 3).map((post) => ({
          id: post.id,
          status: post.status,
          author: post.author,
          title: post.title?.rendered || post.title,
        })),
      });
    } catch (error) {
      const data = error?.response?.data;
      access.probes.push({
        label,
        ok: false,
        status: error?.response?.status || null,
        error: data?.message || error.message,
        code: data?.code || null,
      });
    }
  }

  const publicPublish = access.probes[0]?.ok ? access.probes[0].total : 0;
  const authAny = access.probes[6]?.ok ? access.probes[6].total : 0;
  const roles = access.user?.roles || [];
  const roleLabel = roles.length ? roles.join(", ") : "unknown";

  if (publicPublish > 0 && authAny === 0) {
    access.diagnosis = `Logged in as "${access.user?.name}" (${roleLabel}) but WordPress returned 0 editable posts while ${publicPublish} published posts are public. Use an Administrator/Editor application password.`;
  } else if (publicPublish === 0 && authAny === 0) {
    const publicFailed = access.probes[0]?.ok === false;
    access.diagnosis = publicFailed
      ? "Could not read public posts from the REST API — check site URL, firewall/CDN, or REST API restrictions."
      : "Authenticated user can see 0 posts. Confirm role is administrator/editor and the post is a standard Post (draft/future/pending/trash).";
  } else if (authAny > 0) {
    access.diagnosis = `API access looks OK (${authAny} editable post(s) visible to this user).`;
  }

  if (effective.passwordSource === "missing") {
    summary.unshift("No usable password — save settings after pasting the application password.");
  } else if (effective.passwordSource === "database") {
    summary.push("Test/pull used the password saved in the database (form field was empty or masked).");
  } else {
    summary.push("Test used the password currently in the form field (not necessarily saved yet — Pull still uses DB only).");
  }

  if (access.diagnosis) summary.push(access.diagnosis);

  logWordpress("diagnostics_complete", {
    siteLink: meta.selectedSite || null,
    canonicalSiteUrl,
    passwordSource: effective.passwordSource,
    user: access.user,
    probes: access.probes,
    diagnosis: access.diagnosis,
    summary,
  });
  logWordpressTrace(trace);
  logWordpressVerbose("diagnostics_dump", { audit, trace, access });

  return {
    ok: true,
    audit,
    trace,
    canonicalSiteUrl,
    access,
    summary,
  };
}
