/**
 * Server-side WordPress logging for Render/production logs.
 * Never logs full application passwords.
 */

export function isWordpressVerbose() {
  return process.env.BLOG_WORDPRESS_DEBUG === "1";
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function logWordpress(event, payload = {}) {
  console.info(
    `[wordpress] ${safeJson({
      ts: new Date().toISOString(),
      event,
      ...payload,
    })}`
  );
}

export function logWordpressVerbose(event, payload = {}) {
  if (!isWordpressVerbose()) return;
  console.info(
    `[wordpress:verbose] ${safeJson({
      ts: new Date().toISOString(),
      event,
      ...payload,
    })}`
  );
}

export function logWordpressHttp(entry) {
  logWordpress("http", entry);
  logWordpressVerbose("http_verbose", entry);
}

export function logWordpressConfig(event, { siteLink, url, username, password, passwordSource, extra = {} } = {}) {
  const summary =
    typeof password === "object" && password !== null
      ? password
      : summarizePasswordForLog(password);

  logWordpress(event, {
    siteLink: siteLink || null,
    wordpressUrl: url || null,
    wordpressUsername: username || null,
    passwordSource: passwordSource || null,
    password: summary,
    ...extra,
  });
}

export function summarizePasswordForLog(password) {
  const raw = String(password || "");
  if (!raw) return { stored: false, length: 0, preview: null };
  if (raw === "••••••••") return { stored: "masked_in_ui", length: null, preview: null };
  const normalized = raw.replace(/\s+/g, "");
  return {
    stored: true,
    length: normalized.length,
    preview: normalized.length >= 4 ? `${normalized.slice(0, 2)}…${normalized.slice(-2)}` : "****",
  };
}

export function logWordpressTrace(trace = []) {
  if (!Array.isArray(trace) || !trace.length) return;
  for (const entry of trace) {
    logWordpressHttp({
      label: entry.label,
      method: entry.method,
      url: entry.url,
      params: entry.params,
      authenticated: entry.authenticated,
      authUsername: entry.authUsername,
      status: entry.status,
      durationMs: entry.durationMs,
      xWpTotal: entry.responseHeaders?.xWpTotal ?? entry.headers?.xWpTotal ?? null,
      error: entry.error || null,
      code: entry.code || null,
      response: entry.response || null,
    });
  }
}
