/**
 * Shared timezone helpers.
 * Crossway stores instants in UTC; display/edit uses APP_TIMEZONE
 * (default Asia/Karachi) so schedules match WordPress site time.
 */

export const DEFAULT_APP_TIMEZONE = "Asia/Karachi";

export function getAppTimezone() {
  // NEXT_PUBLIC_ so browser UI (datetime-local) matches server cron/emails.
  const raw = String(
    (typeof process !== "undefined" &&
      process.env &&
      (process.env.NEXT_PUBLIC_APP_TIMEZONE || process.env.APP_TIMEZONE || process.env.TZ)) ||
      DEFAULT_APP_TIMEZONE
  ).trim();
  return raw || DEFAULT_APP_TIMEZONE;
}

/** Short label for UI/emails (e.g. PKT). */
export function timezoneShortLabel(timeZone = getAppTimezone()) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
      hour: "numeric",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value || timeZone;
  } catch {
    return timeZone;
  }
}

function pad(n) {
  return String(n).padStart(2, "0");
}

/**
 * Offset in ms such that: utcMs + offset ≈ wall-clock components in `timeZone`
 * (as if those components were UTC).
 */
export function getTimeZoneOffsetMs(date, timeZone) {
  const d = date instanceof Date ? date : new Date(date);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    dtf
      .formatToParts(d)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - d.getTime();
}

/** Format an instant for <input type="datetime-local"> in a fixed timezone. */
export function toDatetimeLocalInTimezone(date, timeZone = getAppTimezone()) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    dtf
      .formatToParts(d)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/**
 * Parse datetime-local value as wall time in `timeZone` → UTC ISO string.
 * "2026-07-22T15:00" in Asia/Karachi → the matching UTC instant.
 */
export function datetimeLocalToUtcIso(localValue, timeZone = getAppTimezone()) {
  const raw = String(localValue || "").trim();
  if (!raw) return null;
  const [datePart, timePart = "00:00"] = raw.split("T");
  const [y, m, day] = datePart.split("-").map(Number);
  const [hh, mm = 0, ss = 0] = timePart.split(":").map(Number);
  if (![y, m, day, hh, mm].every((n) => Number.isFinite(n))) return null;

  // Desired wall clock as a UTC-ms stand-in, then subtract TZ offset (iterate for DST).
  let guess = Date.UTC(y, m - 1, day, hh, mm, ss || 0);
  for (let i = 0; i < 2; i += 1) {
    const offset = getTimeZoneOffsetMs(new Date(guess), timeZone);
    guess = Date.UTC(y, m - 1, day, hh, mm, ss || 0) - offset;
  }
  return new Date(guess).toISOString();
}

/** Human-readable schedule in app timezone (+ UTC for clarity). */
export function formatScheduleLabel(dateValue, timeZone = getAppTimezone()) {
  if (!dateValue) return null;
  const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  const local = d.toLocaleString("en-US", {
    timeZone,
    dateStyle: "full",
    timeStyle: "short",
  });
  const utc = d.toLocaleString("en-US", {
    timeZone: "UTC",
    dateStyle: "full",
    timeStyle: "short",
  });
  const short = timezoneShortLabel(timeZone);
  return `${local} ${short} (${utc} UTC)`;
}

/** Compact display for lists/calendar. */
export function formatScheduleShort(dateValue, timeZone = getAppTimezone()) {
  if (!dateValue) return "";
  const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Time-only (HH:MM) in app timezone — calendar chips. */
export function formatScheduleTime(dateValue, timeZone = getAppTimezone()) {
  if (!dateValue) return "";
  const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Calendar Y/M/D (and optional time) for an instant in `timeZone`. Month is 1–12. */
export function getZonedParts(date, timeZone = getAppTimezone()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    dtf
      .formatToParts(d)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/** Wall-clock datetime-local for a calendar cell (already in app TZ). */
export function calendarDayDatetimeLocal(year, monthIndex0, day, hour = 10, minute = 0) {
  return `${year}-${pad(monthIndex0 + 1)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

/** Add calendar days to a Y-M-D triple (month is 1–12). */
export function addZonedCalendarDays(year, month, day, deltaDays) {
  const utc = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + Number(deltaDays || 0)));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

/**
 * Default publish slots for unscheduled WordPress drafts in a cron batch:
 * 1st → 11:59 on the next available day (today if 11:59 is still ahead)
 * 2nd+ → 12:59 on successive following days
 */
export function defaultUnscheduledDraftTimes(count, { timeZone = getAppTimezone(), now = new Date() } = {}) {
  const n = Math.max(0, Number(count) || 0);
  const parts = getZonedParts(now, timeZone);
  if (!parts || n <= 0) return [];

  let { year: y, month: m, day: d } = parts;
  const today1159 = datetimeLocalToUtcIso(`${y}-${pad(m)}-${pad(d)}T11:59`, timeZone);
  if (!today1159 || new Date(today1159).getTime() <= now.getTime()) {
    ({ year: y, month: m, day: d } = addZonedCalendarDays(y, m, d, 1));
  }

  const out = [];
  for (let i = 0; i < n; i += 1) {
    if (i === 0) {
      const iso = datetimeLocalToUtcIso(`${y}-${pad(m)}-${pad(d)}T11:59`, timeZone);
      out.push(iso ? new Date(iso) : null);
    } else {
      const next = addZonedCalendarDays(y, m, d, i);
      const iso = datetimeLocalToUtcIso(`${next.year}-${pad(next.month)}-${pad(next.day)}T12:59`, timeZone);
      out.push(iso ? new Date(iso) : null);
    }
  }
  return out;
}

/**
 * Format a UTC Date as WordPress `date` (site-local, no timezone suffix).
 * e.g. 2026-07-22T10:00:00
 */
export function formatWordpressLocalDate(dateValue, timeZone = getAppTimezone()) {
  if (!dateValue) return null;
  const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    dtf
      .formatToParts(d)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

/**
 * Format a UTC Date as WordPress `date_gmt` (UTC, no Z suffix — WP style).
 */
export function formatWordpressGmtDate(dateValue) {
  if (!dateValue) return null;
  const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/**
 * Interpret a WordPress `date` string (site-local, no offset) as UTC Date.
 */
export function parseWordpressLocalDate(raw, timeZone = getAppTimezone()) {
  const s = String(raw || "")
    .trim()
    .replace(" ", "T")
    .replace(/\.\d+/, "");
  if (!s) return null;
  // Already has offset / Z — parse absolute.
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const iso = datetimeLocalToUtcIso(s.slice(0, 16), timeZone);
  return iso ? new Date(iso) : null;
}
