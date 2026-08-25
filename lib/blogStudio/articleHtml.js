/**
 * Deterministic cleanup for writer/humanizer HTML.
 * JSON-mode models often copy the two-character sequence \n into article_html
 * (and drop tags) because they saw pretty-printed JSON. Never leave that visible.
 */

function unescapeLiteralBreaks(value) {
  let s = String(value || "");
  for (let i = 0; i < 4; i += 1) {
    if (!/\\[nrt]/.test(s)) break;
    s = s
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\n")
      .replace(/\\t/g, " ");
  }
  return s.replace(/^\s*\\n\s*$/gm, "");
}

function looksLikeHtml(value) {
  return /<(p|h[1-6]|ul|ol|li|div|article|section|br)\b/i.test(String(value || ""));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isHeadingLine(line, usedH1) {
  const t = String(line || "").trim();
  if (!t || t.length > 90) return false;
  if (/[.?!]$/.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  if (!usedH1) return true;
  const capped = words.filter((w) => /^[A-Z0-9]/.test(w)).length;
  return words.length <= 12 && capped >= Math.max(1, Math.ceil(words.length * 0.45));
}

export function plaintextToArticleHtml(text) {
  const lines = unescapeLiteralBreaks(text)
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^\\n$/.test(l));
  if (!lines.length) return "";
  const out = [];
  let usedH1 = false;
  let list = [];
  const flushList = () => {
    if (!list.length) return;
    out.push(`<ul>${list.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`);
    list = [];
  };
  for (const line of lines) {
    const bullet = line.replace(/^[-*•]\s+/, "");
    const isBullet = bullet !== line;
    if (isHeadingLine(line, usedH1) && !isBullet) {
      flushList();
      const tag = usedH1 ? "h2" : "h1";
      usedH1 = true;
      out.push(`<${tag}>${escapeHtml(line)}</${tag}>`);
      continue;
    }
    if (isBullet || (list.length && line.length < 180 && /[.]$/.test(line))) {
      list.push(isBullet ? bullet : line);
      continue;
    }
    flushList();
    out.push(`<p>${escapeHtml(line)}</p>`);
  }
  flushList();
  return out.join("");
}

/**
 * Turn model HTML (or leaked plaintext-with-\n) into publication HTML.
 */
export function normalizeArticleHtml(html) {
  let s = unescapeLiteralBreaks(String(html || "")).trim();
  if (!s) return "";
  s = s.replace(/>\s*\\n+\s*</g, "><");
  s = unescapeLiteralBreaks(s).trim();
  if (!looksLikeHtml(s)) s = plaintextToArticleHtml(s);
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}
