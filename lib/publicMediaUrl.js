/**
 * Normalize stored media paths for <img>/<video> src across browsers (esp. Chrome).
 * Always prefer same-origin relative `/api/uploads/...` to avoid mixed-content / host drift.
 */

function stripToUploadPath(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";

  // Absolute URL → keep path if it points at our upload routes
  if (/^https?:\/\//i.test(value)) {
    try {
      const u = new URL(value);
      const path = `${u.pathname || ""}${u.search || ""}`;
      if (/\/api\/uploads\//i.test(path) || /\/uploads\//i.test(path)) {
        return path;
      }
      // Foreign absolute URL (e.g. WP CDN) — leave absolute
      return value;
    } catch {
      /* fall through */
    }
  }

  if (/^(data:|blob:)/i.test(value)) return value;

  let path = value.split("#")[0];
  // `/uploads/approvals/x.jpg` or `/uploads/blogs/x.jpg` → API basename route
  if (/^\/uploads\//i.test(path)) {
    const base = path.split("?")[0].split("/").pop();
    if (base) {
      const q = path.includes("?") ? path.slice(path.indexOf("?")) : "";
      return `/api/uploads/${base}${q}`;
    }
  }

  if (!path.startsWith("/")) {
    path = `/api/uploads/${path.replace(/^.*[\\/]/, "")}`;
  }

  // Collapse accidental double prefixes
  path = path
    .replace(/^\/api\/uploads\/api\/uploads\//i, "/api/uploads/")
    .replace(/^\/api\/uploads\/\/+/i, "/api/uploads/");

  return path;
}

export function publicMediaUrl(pathOrUrl, { bust = null } = {}) {
  let path = stripToUploadPath(pathOrUrl);
  if (!path) return "";
  if (/^(https?:|data:|blob:)/i.test(path)) {
    if (bust == null || bust === "") return path;
    try {
      const u = new URL(path);
      u.searchParams.set("v", String(bust));
      return u.toString();
    } catch {
      return path;
    }
  }

  if (bust == null || bust === "") return path;
  // Replace existing v= so promote/switch always refreshes Chrome disk cache
  if (/[?&]v=/.test(path)) {
    return path.replace(/([?&])v=[^&]*/, `$1v=${encodeURIComponent(String(bust))}`);
  }
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}v=${encodeURIComponent(String(bust))}`;
}
