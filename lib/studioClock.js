/**
 * Calendar lock for studio agents.
 *
 * Models (especially OpenRouter :free) write "in 2024" / "in 2025" as if that
 * is now. Every chat call gets today's date, and finished drafts get a
 * deterministic scrub so leftover years cannot ship.
 */

export function studioCalendar(now = new Date()) {
  const year = now.getUTCFullYear();
  const dateLabel = now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return {
    year,
    dateLabel,
    isoDate: now.toISOString().slice(0, 10),
  };
}

/** Recent years models treat as "now" even though they are not. */
export function stalePresentYears(year = studioCalendar().year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return [];
  return [y - 2, y - 1].filter((n) => n >= 2020);
}

export function studioClockFields(now) {
  const clock = studioCalendar(now);
  const stale = stalePresentYears(clock.year);
  return {
    today: clock.dateLabel,
    current_year: clock.year,
    HARD_CALENDAR:
      `Today is ${clock.dateLabel}. Current year ${clock.year}. ` +
      `Never describe the present as ${stale.join(" or ")}. ` +
      `Do not put a year in a title, H1, caption, or meta unless the supplied topic or keyword already contains that year.`,
  };
}

export function studioClockSystemPreamble(system = "", now) {
  const clock = studioCalendar(now);
  const stale = stalePresentYears(clock.year);
  const block =
    `Today is ${clock.dateLabel}. The current year is ${clock.year}. ` +
    `Never write ${stale.join(" or ")} as if that is now. ` +
    `Do not put a year in a title, H1, caption, or meta unless the supplied topic or keyword already contains that year. ` +
    `If you must date current advice, use ${clock.year}.`;
  const raw = String(system || "");
  if (/The current year is \d{4}/.test(raw)) return raw;
  return raw ? `${block}\n\n${raw}` : block;
}

function keepHasYear(keepText, year) {
  return String(keepText || "").includes(String(year));
}

function tidySpaces(text) {
  return String(text || "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/\(\s+\)/g, "")
    .replace(/\s+\)/g, ")")
    .replace(/\(\s+/g, "(")
    .replace(/ ,/g, ",")
    .trim();
}

/**
 * @param {string} text
 * @param {{ year?: number, keepText?: string, mode?: "title"|"body" }} [opts]
 */
export function rewriteStalePresentYears(text, opts = {}) {
  const clock = studioCalendar(opts.now);
  const year = Number(opts.year) || clock.year;
  const keepText = String(opts.keepText || "");
  const mode = opts.mode === "title" ? "title" : "body";
  let out = String(text || "");
  if (!out) return out;

  for (const stale of stalePresentYears(year)) {
    if (keepHasYear(keepText, stale)) continue;
    const y = String(stale);
    if (mode === "title") {
      out = out.replace(new RegExp(`\\s+(?:in|for|during)\\s+${y}\\b`, "gi"), "");
      out = out.replace(new RegExp(`\\(\\s*${y}\\s*\\)`, "g"), "");
      out = out.replace(new RegExp(`[-–—/]\\s*${y}\\s*$`, "g"), "");
      out = out.replace(new RegExp(`\\s+${y}\\s*$`, "g"), "");
    } else {
      out = out.replace(new RegExp(`\\b[Aa]s of\\s+${y}\\b`, "g"), `as of ${year}`);
      out = out.replace(new RegExp(`\\bIn\\s+${y}\\b`, "g"), `In ${year}`);
      out = out.replace(new RegExp(`\\bin\\s+${y}\\b`, "g"), `in ${year}`);
      out = out.replace(new RegExp(`\\bfor\\s+${y}\\b`, "g"), `for ${year}`);
      out = out.replace(new RegExp(`\\bduring\\s+${y}\\b`, "g"), `during ${year}`);
    }
  }
  return tidySpaces(out);
}

export function rewriteStalePresentYearsHtml(html, opts = {}) {
  return String(html || "").replace(/(<[^>]+>)|([^<]+)/g, (all, tag, text) => {
    if (tag) return tag;
    return rewriteStalePresentYears(text, { ...opts, mode: "body" });
  });
}

const TITLE_KEYS = ["title", "slug", "meta_title", "alt_text", "recommended_title", "recommended_h1", "hook"];
const BODY_KEYS = [
  "excerpt",
  "meta_description",
  "article_html",
  "caption",
  "body_text",
  "assignee_instructions",
];

export function applyStudioCalendarToDraft(obj, { keepText = "", now } = {}) {
  if (!obj || typeof obj !== "object") return obj;
  const clock = studioCalendar(now);
  const next = { ...obj };
  const opts = { year: clock.year, keepText, now };
  for (const key of TITLE_KEYS) {
    if (typeof next[key] === "string") {
      next[key] = rewriteStalePresentYears(next[key], { ...opts, mode: "title" });
    }
  }
  for (const key of BODY_KEYS) {
    if (typeof next[key] !== "string") continue;
    next[key] = key.includes("html")
      ? rewriteStalePresentYearsHtml(next[key], opts)
      : rewriteStalePresentYears(next[key], { ...opts, mode: "body" });
  }
  if (next.seo_metadata && typeof next.seo_metadata === "object") {
    next.seo_metadata = applyStudioCalendarToDraft(next.seo_metadata, { keepText, now });
  }
  return next;
}
