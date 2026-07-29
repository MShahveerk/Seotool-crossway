/**
 * Resolve WordPress site timezone for a configured site.
 * Prefers WP settings timezone_string; falls back to APP_TIMEZONE.
 */
import { getWordpressConfig, wordpressRawGet } from "./wordpressClient.js";
import { getAppTimezone, DEFAULT_APP_TIMEZONE } from "./timezone.js";

const cache = new Map();

/**
 * @param {{ wordpressUrl?: string, wordpressUsername?: string, wordpressAppPassword?: string }} config
 * @returns {Promise<string>} IANA timezone, e.g. Asia/Karachi
 */
export async function resolveWordpressTimezone(config) {
  let base;
  try {
    ({ base } = getWordpressConfig(config));
  } catch {
    return getAppTimezone();
  }

  if (cache.has(base)) return cache.get(base);

  try {
    const res = await wordpressRawGet(`${base}/wp-json/wp/v2/settings`, {
      auth: getWordpressConfig(config).auth,
      timeout: 15000,
      logLabel: "wordpress timezone settings",
      params: {},
    });
    const tz = String(res.data?.timezone_string || "").trim();
    if (tz) {
      cache.set(base, tz);
      return tz;
    }
    // Numeric gmt_offset (e.g. 5 or 5.5) — map common zones used by clients.
    const offset = Number(res.data?.gmt_offset);
    if (Number.isFinite(offset)) {
      const OFFSET_MAP = {
        0: "UTC",
        1: "Europe/Paris",
        2: "Europe/Athens",
        3: "Europe/Moscow",
        4: "Asia/Dubai",
        5: "Asia/Karachi",
        5.5: "Asia/Kolkata",
        5.75: "Asia/Kathmandu",
        6: "Asia/Dhaka",
        7: "Asia/Bangkok",
        8: "Asia/Singapore",
        9: "Asia/Tokyo",
        "-5": "America/New_York",
        "-4": "America/Santiago",
        "-6": "America/Chicago",
        "-7": "America/Denver",
        "-8": "America/Los_Angeles",
      };
      const mapped = OFFSET_MAP[offset] || OFFSET_MAP[String(offset)] || null;
      if (mapped) {
        cache.set(base, mapped);
        return mapped;
      }
    }
  } catch {
    /* settings may be forbidden for some app passwords — fall through */
  }

  // Public root sometimes exposes timezone_string on newer WP installs.
  try {
    const root = await wordpressRawGet(`${base}/wp-json/`, {
      timeout: 8000,
      logLabel: "wordpress timezone root",
    });
    const tz = String(root.data?.timezone_string || "").trim();
    if (tz) {
      cache.set(base, tz);
      return tz;
    }
  } catch {
    /* ignore */
  }

  const fallback = getAppTimezone() || DEFAULT_APP_TIMEZONE;
  cache.set(base, fallback);
  return fallback;
}
