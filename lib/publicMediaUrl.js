/**
 * Normalize stored media paths for <img>/<video> src across browsers.
 */
export function publicMediaUrl(pathOrUrl, { bust = null } = {}) {
  const raw = String(pathOrUrl || "").trim();
  if (!raw) return "";
  if (/^(https?:|data:|blob:)/i.test(raw)) {
    if (bust == null) return raw;
    try {
      const u = new URL(raw, "http://local.invalid");
      if (u.protocol === "http:" || u.protocol === "https:") {
        u.searchParams.set("v", String(bust));
        // Absolute remote URL — return as-is with query
        if (/^https?:/i.test(raw)) return u.toString();
      }
    } catch {
      /* fall through */
    }
    return raw;
  }
  let path = raw;
  if (!path.startsWith("/")) {
    path = `/api/uploads/${path.replace(/^.*[\\/]/, "")}`;
  }
  // Strip accidental double prefixes
  path = path.replace(/^\/api\/uploads\/api\/uploads\//i, "/api/uploads/");
  if (bust == null || bust === "") return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}v=${encodeURIComponent(String(bust))}`;
}
