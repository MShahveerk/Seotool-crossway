/**
 * Caption-side Humanizer helpers. Keep this file free of provider imports
 * so unit tests can run without axios/sharp.
 */
import { scrubAiTics } from "../studioAiScrub.js";

const POST_SCRUB_KEYS = [
  "title",
  "caption",
  "body_text",
  "bodyText",
  "alt_text",
  "assignee_instructions",
  "image_prompt",
];

function firstNonEmpty(...candidates) {
  for (const c of candidates) {
    const s = typeof c === "string" ? c.trim() : "";
    if (s) return s;
  }
  return "";
}

/** Models sometimes dump the two characters backslash-n into a caption. */
export function normalizeCaption(value) {
  if (value == null) return "";
  return String(value)
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n");
}

export function pickCaption(obj) {
  if (!obj || typeof obj !== "object") return "";
  return firstNonEmpty(obj.caption, obj.body_text, obj.bodyText);
}

export function scrubPostJson(post) {
  const next = post && typeof post === "object" ? { ...post } : {};
  for (const key of POST_SCRUB_KEYS) {
    if (typeof next[key] === "string") {
      const raw = key === "caption" || key === "body_text" || key === "bodyText" ? normalizeCaption(next[key]) : next[key];
      next[key] = scrubAiTics(raw);
    }
  }
  if (Array.isArray(next.hashtags)) {
    next.hashtags = next.hashtags.map((h) => (typeof h === "string" ? scrubAiTics(h) : h));
  }
  if (typeof next.title === "string") next.title = next.title.slice(0, 255);
  if (typeof next.caption === "string") next.caption = next.caption.slice(0, 2000);
  return next;
}

export function mergeHumanizedPost(source, data) {
  const src = source && typeof source === "object" ? source : {};
  const extra = data && typeof data === "object" ? data : {};
  const caption = firstNonEmpty(pickCaption(extra), pickCaption(src));
  const title = firstNonEmpty(extra.title, src.title);
  return scrubPostJson({
    ...src,
    ...extra,
    title,
    caption,
  });
}

export function appendHashtagsIfMissing(caption, hashtags) {
  let next = String(caption || "").trim();
  if (!next) return next;
  if (/#\w/.test(next)) return next.slice(0, 2000);
  const tags = (Array.isArray(hashtags) ? hashtags : [])
    .map((h) => String(h || "").trim())
    .filter(Boolean)
    .map((h) => (h.startsWith("#") ? h : `#${h.replace(/^#+/, "")}`));
  if (!tags.length) return next.slice(0, 2000);
  return `${next}\n\n${tags.join(" ")}`.slice(0, 2000);
}
