/**
 * Prospect probe — "how do I actually get a link on this site?"
 *
 * Classification in `linkOpportunities.js` infers opportunity type from the URL
 * of a page that already links out. That's a good guess made for free, but it
 * can't tell you whether a site *accepts* anything today. This probe answers
 * that by visiting the site: it looks for the pages that represent a real route
 * in — contribute, submit, directory, resources, contact — and pulls the
 * contact details off whatever it finds.
 *
 * It costs no vendor credits (it's plain HTTP), so it runs **on demand** from
 * the prospect detail view rather than for every row of every analysis.
 *
 * Caveat inherited from the SERP scraper: JS-rendered and Cloudflare-fronted
 * sites can return near-empty HTML. A miss is reported as "couldn't confirm",
 * never as "doesn't accept" — absence of evidence isn't evidence of absence.
 */

import { getCachedSnapshot, saveSnapshot } from "./seranking/cache.js";
import { DATA_TYPES } from "./seranking/config.js";

/** Routes worth checking, best-first. `weight` mirrors how direct the route is. */
const ROUTES = [
  { path: "/write-for-us", kind: "contribute", label: "Write for us", weight: 100 },
  { path: "/guest-post", kind: "contribute", label: "Guest post", weight: 100 },
  { path: "/contribute", kind: "contribute", label: "Contribute", weight: 95 },
  { path: "/submit", kind: "submit", label: "Submit", weight: 90 },
  { path: "/submit-article", kind: "submit", label: "Submit an article", weight: 92 },
  { path: "/become-a-contributor", kind: "contribute", label: "Become a contributor", weight: 92 },
  { path: "/add-listing", kind: "listing", label: "Add a listing", weight: 90 },
  { path: "/add-your-business", kind: "listing", label: "Add your business", weight: 90 },
  { path: "/list-your-business", kind: "listing", label: "List your business", weight: 88 },
  { path: "/directory", kind: "listing", label: "Directory", weight: 74 },
  { path: "/resources", kind: "resource", label: "Resources", weight: 70 },
  { path: "/links", kind: "resource", label: "Links page", weight: 66 },
  { path: "/partners", kind: "resource", label: "Partners", weight: 62 },
  { path: "/advertise", kind: "paid", label: "Advertise", weight: 50 },
  { path: "/sponsored", kind: "paid", label: "Sponsored posts", weight: 48 },
  { path: "/contact", kind: "contact", label: "Contact", weight: 40 },
  { path: "/contact-us", kind: "contact", label: "Contact us", weight: 40 },
  { path: "/about", kind: "contact", label: "About", weight: 20 },
];

/** Anchor text on the homepage that betrays a route even at an odd URL. */
const LINK_HINTS = [
  { re: /write\s*for\s*us/i, kind: "contribute", label: "Write for us", weight: 100 },
  { re: /guest\s*post/i, kind: "contribute", label: "Guest post", weight: 100 },
  { re: /contribut/i, kind: "contribute", label: "Contribute", weight: 92 },
  { re: /submit\s*(a|an|your)?\s*(article|post|story|listing|site|tool)/i, kind: "submit", label: "Submit", weight: 90 },
  { re: /add\s*(your)?\s*(business|listing|company|site)/i, kind: "listing", label: "Add a listing", weight: 90 },
  { re: /get\s*listed/i, kind: "listing", label: "Get listed", weight: 88 },
  { re: /advertis/i, kind: "paid", label: "Advertise", weight: 50 },
  { re: /contact/i, kind: "contact", label: "Contact", weight: 40 },
];

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const JUNK_EMAIL = /(example|sentry|wixpress|\.png|\.jpg|\.gif|\.svg|@2x|domain\.com|yourdomain)/i;

function cleanHost(value) {
  if (!value) return "";
  try {
    const url = String(value).startsWith("http") ? String(value) : `https://${value}`;
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return String(value).replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
  }
}

async function fetchPage(url, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        // Googlebot first: most WAFs whitelist it, which unblocks 403s.
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return { ok: false, status: res.status, html: "", finalUrl: res.url || url };
    const html = await res.text();
    return { ok: true, status: res.status, html, finalUrl: res.url || url };
  } catch {
    return { ok: false, status: 0, html: "", finalUrl: url };
  } finally {
    clearTimeout(timer);
  }
}

function textOf(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractEmails(html) {
  const found = new Set();
  for (const raw of String(html || "").match(EMAIL_RE) || []) {
    const email = raw.toLowerCase();
    if (JUNK_EMAIL.test(email)) continue;
    found.add(email);
    if (found.size >= 6) break;
  }
  return [...found];
}

/** Anchors on the homepage that look like a route in. */
function routesFromHomepage(html, origin) {
  const out = [];
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi;
  let match;
  while ((match = anchorRe.exec(html)) !== null) {
    const href = match[1];
    const label = textOf(match[2]);
    if (!href || !label) continue;
    for (const hint of LINK_HINTS) {
      if (!hint.re.test(label)) continue;
      let url;
      try {
        url = new URL(href, origin).href;
      } catch {
        continue;
      }
      if (cleanHost(url) !== cleanHost(origin)) continue; // off-site nav isn't a route
      out.push({ url, kind: hint.kind, label: hint.label, weight: hint.weight, via: "homepage link" });
      break;
    }
    if (out.length >= 12) break;
  }
  return out;
}

const VERDICTS = {
  contribute: { verdict: "open", label: "Accepts contributions", note: "Has a live contribute or guest-post page — pitch directly." },
  submit: { verdict: "open", label: "Accepts submissions", note: "Has a submission route you can use." },
  listing: { verdict: "open", label: "Accepts listings", note: "You can add or claim a listing here." },
  resource: { verdict: "maybe", label: "Curated resource page", note: "No open form, but a curated list you can pitch to be added to." },
  paid: { verdict: "paid", label: "Paid placement", note: "Advertises sponsored placement — a link is likely purchasable, not earned." },
  contact: { verdict: "maybe", label: "Contact only", note: "No submission route found, but there's a way to reach a human." },
};

/**
 * @param {string} domain
 * @param {{ force?: boolean, maxRoutes?: number }} [opts]
 */
export async function probeProspect(domain, { force = false, maxRoutes = 6 } = {}) {
  const host = cleanHost(domain);
  if (!host) return { host: "", checked: [], routes: [], emails: [], verdict: "unknown", error: "Invalid domain" };

  const cacheKey = `probe-v1:${host}`;
  if (!force) {
    try {
      const cached = await getCachedSnapshot(host, DATA_TYPES.PROSPECT_PROBE, cacheKey);
      if (cached?.payload && !cached.expired) {
        return { ...cached.payload, cached: true, fetchedAt: cached.fetchedAt };
      }
    } catch {
      /* best-effort */
    }
  }

  const origin = `https://${host}`;
  const home = await fetchPage(origin);

  // Homepage anchors first — they find routes at URLs we'd never guess.
  const candidates = home.ok ? routesFromHomepage(home.html, origin) : [];

  // Then the conventional paths, skipping any the homepage already gave us.
  const seen = new Set(candidates.map((c) => c.url.replace(/\/$/, "")));
  const toCheck = ROUTES.filter((r) => !seen.has(`${origin}${r.path}`)).slice(0, 14);

  const checked = await Promise.all(
    toCheck.map(async (route) => {
      const res = await fetchPage(`${origin}${route.path}`, 7000);
      return { ...route, url: `${origin}${route.path}`, ok: res.ok, status: res.status, html: res.ok ? res.html : "" };
    })
  );

  const live = checked
    .filter((r) => r.ok)
    .map((r) => ({ url: r.url, kind: r.kind, label: r.label, weight: r.weight, via: "known path", html: r.html }));

  const routes = [...candidates.map((c) => ({ ...c, html: "" })), ...live]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, maxRoutes);

  // Emails: homepage plus anything a discovered page exposed.
  const emails = new Set(extractEmails(home.html));
  for (const route of live) {
    for (const email of extractEmails(route.html)) emails.add(email);
    if (emails.size >= 6) break;
  }

  const best = routes[0];
  const meta = best ? VERDICTS[best.kind] : null;

  const result = {
    host,
    reachable: home.ok,
    verdict: meta?.verdict || (home.ok ? "unknown" : "unreachable"),
    verdictLabel:
      meta?.label ||
      (home.ok ? "No route found" : "Couldn't reach the site"),
    verdictNote:
      meta?.note ||
      (home.ok
        ? "Nothing on the site advertises a way in. It may still accept a direct pitch — or it may render its navigation with JavaScript, which this check can't see."
        : "The site blocked or timed out on our request. That's a limit of the check, not a verdict on the site."),
    // Drop the fetched HTML — it was only ever needed to mine emails.
    routes: routes.map((route) => ({
      url: route.url,
      kind: route.kind,
      label: route.label,
      weight: route.weight,
      via: route.via,
    })),
    emails: [...emails].slice(0, 6),
    checkedCount: toCheck.length + 1,
  };

  try {
    await saveSnapshot({
      siteUrl: host,
      dataType: DATA_TYPES.PROSPECT_PROBE,
      sourceKey: cacheKey,
      payload: result,
      creditsSpent: 0,
    });
  } catch {
    /* best-effort */
  }

  return { ...result, cached: false, fetchedAt: new Date() };
}

/**
 * Paid vs unpaid — a cheap homepage read, not the full 15-path probe.
 *
 * Guest posts, roundups and resource pages are earned media: you pitch, you
 * don't buy. Directories are the ones that actually charge, so those (plus
 * ranking listing sites) get a homepage look for pricing / "add free" copy.
 * Known paid review-networks are classified without a fetch.
 *
 * `alive: false` means the site is parked, for sale, or a backlink mill —
 * those must never sit in Can pitch.
 */

export const KNOWN_PAID_HOSTS = new Set([
  "clutch.co", "designrush.com", "sortlist.com", "upcity.com", "themanifest.com",
  "goodfirms.co", "goodfirms.com", "bark.com", "expertise.com", "angi.com",
  "thumbtack.com", "homeadvisor.com", "houzz.com", "g2.com", "capterra.com",
  "getapp.com", "softwareadvice.com", "sitejabber.com", "trepup.com",
  "hotfrog.com", "brownbook.net", "cylex.us", "chamberofcommerce.com",
]);

const KNOWN_FREE_HOSTS = new Set([
  "yelp.com", "mapquest.com", "yellowpages.com", "bbb.org", "nextdoor.com",
  "superpages.com", "foursquare.com", "apple.com",
]);

const PAID_URL_RE =
  /(advertis|sponsor|paid[-_]?list|premium[-_]?list|featured[-_]?list|\/pricing|\/plans\/|submission[-_]?fee|buy[-_]?link)/i;

const PAID_TEXT_RE =
  /paid\s+(listing|submission|placement|inclusion|submission)|premium\s+listing|featured\s+listing|sponsored\s+(post|listing|content|article)|submission\s+fee|listing\s+fee|starting\s+at\s+\$|price:\s*\$\s*\d|buy\s+(a\s+)?(listing|backlink)|paid\s+submit|from\s+\$\d/i;

const FREE_TEXT_RE =
  /add\s+(your\s+)?(business|listing)\s+(for\s+)?free|free\s+(basic\s+)?(listing|submission)|submit\s+(for\s+)?free|write\s+for\s+us|guest\s+post|no\s+(cost|fee|charge)|claim\s+(your\s+)?(free\s+)?listing|get\s+listed\s+free/i;

const DEAD_TEXT_RE =
  /domain\s+(is\s+)?for\s+sale|buy\s+this\s+domain|this\s+domain\s+is\s+(for\s+sale|expired|parked)|parked\s+(free|domain)|website\s+coming\s+soon|this\s+site\s+(can'?t|cannot)\s+be\s+reached/i;

const BACKLINK_MILL_RE =
  /buy\s+backlinks|cheap\s+backlinks|seo\s+backlink|high\s+da\s+backlinks|sale\s+backlinks|permanent\s+dofollow/i;

function hostMatchesSet(domain, set) {
  if (!domain) return false;
  if (set.has(domain)) return true;
  return [...set].some((h) => domain.endsWith(`.${h}`));
}

function urlsLookPaid(urls = []) {
  return urls.some((u) => PAID_URL_RE.test(String(u || "")));
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) || 0 }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * @param {{ domain: string, type?: string, sourceUrls?: string[] }} row
 * @param {{ html?: string, ok?: boolean }} [home]
 */
export function classifyPitchCost(row, home = null) {
  const domain = cleanHost(row?.domain);
  const urls = row?.sourceUrls || [];
  const type = row?.type || "";

  if (hostMatchesSet(domain, KNOWN_PAID_HOSTS) || urlsLookPaid(urls)) {
    return { cost: "paid", costNote: "This site sells listings or sponsored placement." };
  }
  if (hostMatchesSet(domain, KNOWN_FREE_HOSTS)) {
    return { cost: "unpaid", costNote: "A listing you can claim or submit without paying." };
  }

  const html = home?.html || "";
  const text = textOf(html).slice(0, 12000);

  if (home?.ok && (DEAD_TEXT_RE.test(text) || BACKLINK_MILL_RE.test(text))) {
    return { cost: "unknown", costNote: "Site looks parked or is selling backlinks.", alive: false };
  }

  if (home?.ok) {
    const paidHit = PAID_TEXT_RE.test(text);
    const freeHit = FREE_TEXT_RE.test(text);
    if (paidHit && !freeHit) {
      return { cost: "paid", costNote: "Homepage advertises paid listings or sponsored posts." };
    }
    if (freeHit) {
      return { cost: "unpaid", costNote: "Homepage offers a free submit or claim route." };
    }
    // Advertise-only nav without a listing form is still a paid door.
    if (/\badvertis(e|ing)\b/i.test(text) && /(directory|listing|sponsor)/i.test(text) && !freeHit) {
      return { cost: "paid", costNote: "Advertising is the published route in." };
    }
  }

  // Earned media: you email an editor, you don't buy a slot.
  if (type === "guest-post" || type === "publication" || type === "roundup" || type === "resource") {
    return { cost: "unpaid", costNote: "Earned placement — pitch the page, don't buy it." };
  }

  return { cost: "unknown", costNote: "Couldn't confirm whether a listing is free." };
}

/**
 * Survey cost for a batch of pitchable prospects. Homepage only, cached,
 * concurrency-capped. Does not spend vendor credits.
 *
 * @param {Array<{ domain: string, type?: string, sourceUrls?: string[] }>} rows
 */
export async function surveyPitchCosts(rows, { concurrency = 6, limit = 50 } = {}) {
  const needFetch = [];
  const results = new Map();

  for (const row of rows.slice(0, limit)) {
    const domain = cleanHost(row?.domain);
    if (!domain) continue;
    const quick = classifyPitchCost(row);
    // Directories and ranking listings are the ones where homepage copy
    // actually changes the answer. Skip the fetch when a host list already
    // decided, or when the type is earned media.
    const decided =
      quick.cost === "paid" ||
      hostMatchesSet(domain, KNOWN_FREE_HOSTS) ||
      row.type === "guest-post" ||
      row.type === "publication" ||
      row.type === "roundup" ||
      row.type === "resource";
    if (decided) {
      results.set(domain, { ...quick, alive: quick.alive !== false });
    } else {
      needFetch.push(row);
    }
  }

  await mapLimit(needFetch, concurrency, async (row) => {
    const domain = cleanHost(row.domain);
    const cacheKey = `cost-v1:${domain}`;
    try {
      const cached = await getCachedSnapshot(domain, DATA_TYPES.PROSPECT_PROBE, cacheKey);
      if (cached?.payload && !cached.expired) {
        results.set(domain, cached.payload);
        return;
      }
    } catch {
      /* best-effort */
    }

    const home = await fetchPage(`https://${domain}`, 6000);
    const classified = classifyPitchCost(row, home);
    const payload = { ...classified, alive: classified.alive !== false };
    results.set(domain, payload);
    try {
      await saveSnapshot({
        siteUrl: domain,
        dataType: DATA_TYPES.PROSPECT_PROBE,
        sourceKey: cacheKey,
        payload,
        creditsSpent: 0,
      });
    } catch {
      /* best-effort */
    }
  });

  return results;
}
