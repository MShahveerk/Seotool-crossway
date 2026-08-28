function isMetaPageId(value) {
  return /^\d+$/.test(String(value || "").trim());
}

function isBadGreetingName(value) {
  const t = String(value || "").trim();
  if (!t || isMetaPageId(t)) return true;
  return /^(unnamed page|facebook\s*page|meta\s*page|your account|social account|client account)\b/i.test(
    t
  );
}

function hostFromUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  try {
    if (s.startsWith("sc-domain:")) return s.slice("sc-domain:".length).replace(/^www\./i, "");
    if (/^https?:\/\//i.test(s)) return new URL(s).hostname.replace(/^www\./i, "");
    if (s.includes(".") && !s.includes(" ") && !isMetaPageId(s)) {
      return s.replace(/^www\./i, "").split("/")[0];
    }
  } catch {
    /* fall through */
  }
  return "";
}

/**
 * Human label for studio greetings. Numeric Meta page IDs are omitted so we
 * never say "What should we post for 394580917081045 today?"
 */
export function studioGreetingName(site, resolvedName = "") {
  const resolved = String(resolvedName || "").trim();
  if (resolved && !isBadGreetingName(resolved)) {
    if (resolved.startsWith("http") || resolved.startsWith("sc-domain:")) {
      return hostFromUrl(resolved) || resolved;
    }
    if (resolved.length > 48) return `${resolved.slice(0, 46)}…`;
    return resolved;
  }
  const raw = String(site || "").trim();
  if (!raw || isMetaPageId(raw)) return "";
  return hostFromUrl(raw) || (raw.length > 48 ? `${raw.slice(0, 46)}…` : raw);
}

export function studioGreetingHeadline(kind, name) {
  const verb = kind === "post" ? "post" : "write";
  const brand = String(name || "").trim();
  if (brand) return `What should we ${verb} for ${brand} today?`;
  return `What should we ${verb} today?`;
}

export function isLocalStudioUploadPath(path) {
  const s = String(path || "").trim();
  if (!s || s.includes("..")) return false;
  if (/^https?:\/\//i.test(s)) return /\/api\/uploads\//i.test(s) || /\/uploads\//i.test(s);
  return /\/api\/uploads\//i.test(s) || /^\/uploads\//i.test(s) || /^\/api\/uploads\//i.test(`/${s}`);
}
