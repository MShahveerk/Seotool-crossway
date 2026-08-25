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
import { chatCompletion, hasProviderKey } from "./blogStudio/providers.js";
import { getLinkOpportunitiesLlmConfig } from "./linkOpportunitiesLlm.js";

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
  { path: "/pricing", kind: "paid", label: "Pricing", weight: 52 },
  { path: "/plans", kind: "paid", label: "Plans", weight: 50 },
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
 * Paid vs unpaid — from fetched page text, not the URL pattern.
 *
 * Roundups and resource pages are not assumed free. A "free listing" line next
 * to paid tiers is paid until a public free submit is the only door. Known
 * paid review-networks are classified without a fetch.
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

export const KNOWN_FREE_HOSTS = new Set([
  "yelp.com", "mapquest.com", "yellowpages.com", "bbb.org", "nextdoor.com",
  "superpages.com", "foursquare.com", "apple.com",
  // Vertical directories that dominate their niche and offer a claimable free
  // listing tier. They sit behind aggressive WAFs, so a live homepage probe
  // often 403s — which is exactly why they were being lost without an explicit
  // entry here. weedmaps/leafly = cannabis; a licensed business claims a
  // profile, so they are prospects, not competitors to harvest.
  "weedmaps.com", "leafly.com",
]);

const PAID_URL_RE =
  /(advertis|sponsor|paid[-_]?list|premium[-_]?list|featured[-_]?list|\/pricing|\/plans\/|submission[-_]?fee|buy[-_]?link)/i;

const PAID_TEXT_RE =
  /paid\s+(listing|submission|placement|inclusion|guest|post|article)|premium\s+listing|featured\s+listing|sponsored\s+(post|listing|content|article)|submission\s+fee|listing\s+fee|starting\s+at\s+\$|price:\s*\$\s*\d|buy\s+(a\s+)?(listing|backlink|guest\s+post)|paid\s+submit|from\s+\$\d|guest\s+post\s+(package|pricing|rate)|pay\s+to\s+(publish|post)|cost\s+of\s+(guest|posting)|do-?follow.{0,12}\$\s*\d|\$\s?\d{2,}/i;

const FREE_TEXT_RE =
  /add\s+(your\s+)?(business|listing)\s+(for\s+)?free|free\s+(basic\s+)?(listing|submission|profile)|submit\s+(for\s+)?free|no\s+(cost|fee|charge)|unpaid\s+(guest|contribut)|we\s+do\s+not\s+charge|claim\s+(your\s+)?(free\s+)?listing|get\s+listed\s+free|free\s+to\s+(submit|contribute|pitch)/i;

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
 * @param {string} [extraText]  text from linking/pricing pages
 */
export function classifyPitchCost(row, home = null, extraText = "") {
  const domain = cleanHost(row?.domain);
  const urls = row?.sourceUrls || [];

  if (hostMatchesSet(domain, KNOWN_PAID_HOSTS) || urlsLookPaid(urls)) {
    return { cost: "paid", costNote: "This site sells listings or sponsored placement." };
  }

  const html = home?.html || "";
  const text = `${textOf(html)} ${extraText || ""}`.replace(/\s+/g, " ").trim().slice(0, 20000);

  if (home?.ok && (DEAD_TEXT_RE.test(text) || BACKLINK_MILL_RE.test(text))) {
    return { cost: "unknown", costNote: "Site looks parked or is selling backlinks.", alive: false };
  }

  if (home?.ok || text) {
    const paidHit = PAID_TEXT_RE.test(text) || urlsLookPaid(urls);
    const freeHit = FREE_TEXT_RE.test(text);
    if (paidHit) {
      return {
        cost: "paid",
        costNote: freeHit
          ? "Page offers a free tier but also sells listings or sponsored placement."
          : "Page advertises paid listings, pricing, or sponsored posts.",
      };
    }
    if (freeHit) {
      return { cost: "unpaid", costNote: "Page offers a free submit or claim route." };
    }
    if (/\badvertis(e|ing)\b/i.test(text) && /(directory|listing|sponsor)/i.test(text)) {
      return { cost: "paid", costNote: "Advertising is the published route in." };
    }
  }

  if (hostMatchesSet(domain, KNOWN_FREE_HOSTS)) {
    return { cost: "unpaid", costNote: "A listing you can claim or submit without paying." };
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
    const decided = quick.cost === "paid" || quick.alive === false;
    if (decided) {
      results.set(domain, { ...quick, alive: quick.alive !== false });
    } else {
      needFetch.push(row);
    }
  }

  await mapLimit(needFetch, concurrency, async (row) => {
    const domain = cleanHost(row.domain);
    const cacheKey = `cost-v2:${domain}`;
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

/**
 * Live qualify — fetch real pages, then optionally ask an LLM to judge them.
 *
 * The model is not allowed to invent a route. A grounded qualify=true needs
 * fetched HTML, a known claimable/paid host, or a still-live captured page.
 * Invented URLs are stripped.
 *
 * The model MAY veto a heuristic "live route" when the fetched text shows a
 * paid checkout, a spam mill, a product, or a page off this keyword's niche.
 * Parked / backlink-mill pages fail closed.
 */

const QUALIFY_PATHS = [
  { path: "/write-for-us", kind: "contribute", weight: 100 },
  { path: "/guest-post", kind: "contribute", weight: 100 },
  { path: "/submit", kind: "submit", weight: 90 },
  { path: "/add-listing", kind: "listing", weight: 90 },
  { path: "/add-your-business", kind: "listing", weight: 88 },
  { path: "/advertise", kind: "paid", weight: 50 },
  { path: "/pricing", kind: "paid", weight: 52 },
  { path: "/plans", kind: "paid", weight: 50 },
];

const OPEN_KINDS = new Set(["contribute", "submit", "listing", "paid", "resource"]);
const PITCH_KINDS = new Set(["contribute", "submit", "listing"]);

function pageTitle(html) {
  const m = String(html || "").match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i);
  return m ? textOf(m[1]).slice(0, 160) : "";
}

function inferSiteKind(row, evidence) {
  const hay = [
    pageTitle(evidence.home?.html),
    (evidence.urls || []).map((u) => u.excerpt || "").join(" "),
    (evidence.openNav || []).map((n) => n.label || "").join(" "),
  ]
    .join(" ")
    .toLowerCase();
  if ((evidence.openKinds || []).some((k) => PITCH_KINDS.has(k))) return "other";
  const productSignals = [
    /\bpricing\b/,
    /\bplans\b/,
    /\bstart for free\b/,
    /\bstart free\b/,
    /\bget started free\b/,
    /\bsign up\b/,
    /\blog in\b/,
    /\bfeatures\b/,
    /\bintegrations\b/,
    /\bchrome extension\b/,
  ];
  const pubSignals = [
    /\bwrite for us\b/,
    /\bguest post\b/,
    /\bsubscribe\b/,
    /\bmagazine\b/,
    /\bnewsletter\b/,
    /\beditorial\b/,
    /\blatest posts\b/,
    /\blatest articles\b/,
  ];
  const productHits = productSignals.filter((re) => re.test(hay)).length;
  const pubHits = pubSignals.filter((re) => re.test(hay)).length;
  if (productHits >= 2 && productHits > pubHits) return "product";
  if (/\bpricing\b/.test(hay) && /\b(sign up|log in|features)\b/.test(hay)) return "product";
  if (pubHits >= 1 && productHits === 0) return "publisher";
  const host = String(row?.domain || evidence.domain || "").toLowerCase();
  if (
    /\.(io|ai)$/i.test(host) &&
    (row.type === "resource" || row.type === "roundup") &&
    productHits >= 1
  ) {
    return "product";
  }
  return "other";
}

const LLM_SYSTEM = `You classify whether a website is a realistic link-building pitch for a business ranking for a keyword.

You may ONLY use the evidence JSON. Do not use training knowledge about the brand.
Do not invent URLs, emails, prices, forms, or pages.
routeUrl must be copied EXACTLY from evidence.urls[].url, or be an empty string.
siteKind must be one of: product, publisher, community, directory, other.
A product is software with Pricing, Sign up, Features, Integrations, or Get started. A publisher is a magazine, newsletter, or editorial site. A product blog that happened to mention the keyword is still a product.
cost "unpaid" only if excerpts show a free submit, claim, write-for-us, or guest-post path with no required fee. If pricing, sponsored inclusion, premium listing, or paid guest post appears, cost is "paid" even when a free tier is also mentioned.
If the site is a backlink mill, SEO directory farm, email-security wrapper, form host, people-finder, court-records scraper, government court, or clearly off this keyword's niche, set qualify false and verdict "unreachable".
You MAY veto a submit URL that is a paid checkout.
If siteKind is product and there is no contribute/submit/listing/write-for-us URL in evidence, set qualify to false.
Job boards, website builders, course platforms, social networks and search engines: qualify false, verdict "unreachable".
Parked or backlink-selling pages: qualify false, verdict "unreachable".
Return a JSON object with keys: qualify (boolean), cost ("paid"|"unpaid"|"unknown"), verdict ("open"|"paid"|"maybe"|"unknown"|"unreachable"), siteKind (string), routeUrl (string), reason (one sentence citing the evidence).`;

function excerptText(html, n = 1600) {
  return textOf(html).slice(0, n);
}

function normalizeUrl(value) {
  try {
    const u = new URL(String(value || "").startsWith("http") ? value : `https://${value}`);
    u.hash = "";
    return u.href.replace(/\/$/, "").toLowerCase();
  } catch {
    return String(value || "").replace(/\/$/, "").toLowerCase();
  }
}

async function gatherEvidence(row) {
  const domain = cleanHost(row.domain);
  const origin = `https://${domain}`;
  const urls = [];
  const captured = [...new Set((row.sourceUrls || []).filter(Boolean))].slice(0, 2);
  const pathChecks = [
    { path: "/write-for-us", kind: "contribute", url: `${origin}/write-for-us` },
    { path: "/submit", kind: "submit", url: `${origin}/submit` },
    { path: "/pricing", kind: "paid", url: `${origin}/pricing` },
  ];

  const [home, ...rest] = await Promise.all([
    fetchPage(origin, 5000),
    ...captured.map((src) => fetchPage(src, 4500)),
    ...pathChecks.map((r) => fetchPage(r.url, 3500)),
  ]);

  const aliveText = home.ok ? textOf(home.html).slice(0, 12000) : "";
  const parked = home.ok && (DEAD_TEXT_RE.test(aliveText) || BACKLINK_MILL_RE.test(aliveText));
  const nav = home.ok ? routesFromHomepage(home.html, origin) : [];
  const openNav = nav.filter((r) => OPEN_KINDS.has(r.kind));

  if (home.ok) {
    urls.push({
      url: home.finalUrl || origin,
      status: home.status,
      kind: "homepage",
      excerpt: excerptText(home.html),
    });
  }

  let pageLive = false;
  captured.forEach((src, i) => {
    const page = rest[i];
    if (!page?.ok) return;
    pageLive = true;
    if (normalizeUrl(src) === normalizeUrl(origin)) return;
    urls.push({
      url: page.finalUrl || src,
      status: page.status,
      kind: "captured",
      excerpt: excerptText(page.html),
    });
  });

  const pathResults = rest.slice(captured.length);
  pathResults.forEach((res, i) => {
    if (!res?.ok) return;
    const spec = pathChecks[i];
    urls.push({
      url: res.finalUrl || spec.url,
      status: 200,
      kind: spec.kind,
      excerpt: excerptText(res.html, 900),
    });
  });

  const extraText = urls.map((u) => u.excerpt || "").join(" ");
  const openKinds = [
    ...openNav.map((r) => r.kind),
    ...urls.map((u) => u.kind).filter((k) => OPEN_KINDS.has(k)),
  ];

  return {
    domain,
    homepageOk: Boolean(home.ok),
    alive: Boolean(home.ok) && !parked,
    parked,
    pageLive,
    openKinds,
    openNav,
    urls,
    home,
    extraText,
    knownPaid: hostMatchesSet(domain, KNOWN_PAID_HOSTS),
    knownFree: hostMatchesSet(domain, KNOWN_FREE_HOSTS),
  };
}

function heuristicFromEvidence(row, evidence) {
  const costInfo = classifyPitchCost(row, evidence.home, evidence.extraText || "");
  const siteKind = inferSiteKind(row, evidence);
  if (evidence.parked || costInfo.alive === false) {
    return {
      qualify: false,
      alive: false,
      cost: "unknown",
      verdict: "unreachable",
      siteKind,
      costNote: costInfo.costNote || "Parked or selling backlinks.",
      probed: true,
    };
  }
  if (evidence.knownPaid || costInfo.cost === "paid") {
    const route =
      evidence.openNav.find((r) => r.kind === "paid")?.url ||
      evidence.urls.find((u) => u.kind === "paid")?.url ||
      "";
    return {
      qualify: true,
      alive: true,
      cost: "paid",
      verdict: "paid",
      siteKind: siteKind === "other" ? "directory" : siteKind,
      routeUrl: route,
      costNote: costInfo.costNote || "Known paid listing network.",
      probed: true,
    };
  }
  if (siteKind === "product" && !(evidence.openKinds || []).some((k) => PITCH_KINDS.has(k))) {
    return {
      qualify: false,
      alive: true,
      cost: costInfo.cost || "unknown",
      verdict: "unreachable",
      siteKind: "product",
      costNote: "Software product, not an editor to pitch.",
      probed: true,
    };
  }
  const paidOnly =
    evidence.openKinds.includes("paid") &&
    !evidence.openKinds.some((k) => PITCH_KINDS.has(k));
  const hasPitch = evidence.openKinds.some((k) => PITCH_KINDS.has(k));
  if (hasPitch || paidOnly) {
    const route =
      evidence.openNav.find((r) => PITCH_KINDS.has(r.kind) || r.kind === "paid")?.url ||
      evidence.urls.find((u) => PITCH_KINDS.has(u.kind) || u.kind === "paid")?.url ||
      "";
    return {
      qualify: true,
      alive: true,
      cost: paidOnly ? "paid" : costInfo.cost === "unpaid" ? "unpaid" : costInfo.cost || "unknown",
      verdict: paidOnly ? "paid" : costInfo.cost === "unpaid" ? "open" : "maybe",
      siteKind,
      routeUrl: route,
      costNote: paidOnly
        ? "Advertise/sponsored route found."
        : costInfo.cost === "unpaid"
          ? "Free submit or listing route found."
          : "A submit route exists; cost not confirmed from page text.",
      probed: true,
    };
  }
  if (evidence.pageLive && (row.type === "roundup" || row.type === "resource" || row.type === "publication")) {
    return {
      qualify: true,
      alive: true,
      cost: costInfo.cost || "unknown",
      verdict: "maybe",
      siteKind: row.type === "publication" ? "publisher" : siteKind,
      routeUrl: (row.sourceUrls || [])[0] || "",
      costNote: costInfo.costNote || "Linking page is live — cost not confirmed; needs an editorial pitch.",
      probed: true,
    };
  }
  if (evidence.homepageOk && row.type === "serp-listing") {
    return {
      qualify: true,
      alive: true,
      cost: costInfo.cost || "unknown",
      verdict: "maybe",
      siteKind: "directory",
      costNote: costInfo.costNote || "Ranking locator/directory — homepage is live, cost not confirmed.",
      probed: true,
    };
  }
  if (evidence.knownFree && row.type !== "resource" && row.type !== "roundup") {
    return {
      qualify: true,
      alive: true,
      cost: "unpaid",
      verdict: "open",
      siteKind: "directory",
      costNote: "Known free claimable listing.",
      probed: true,
    };
  }
  return {
    qualify: false,
    alive: true,
    cost: costInfo.cost || "unknown",
    verdict: "unknown",
    siteKind,
    costNote: "No live submit, listing or contribute route found.",
    probed: true,
  };
}

function groundLlmVerdict(raw, evidence, fallback) {
  if (!raw || typeof raw !== "object") return { ...fallback, llm: "invalid" };
  const urlSet = new Set(evidence.urls.map((u) => normalizeUrl(u.url)));
  const costs = new Set(["paid", "unpaid", "unknown"]);
  const verdicts = new Set(["open", "paid", "maybe", "unknown", "unreachable"]);
  const kinds = new Set(["product", "publisher", "community", "directory", "other"]);

  let qualify = raw.qualify === true;
  let cost = costs.has(raw.cost) ? raw.cost : fallback.cost || "unknown";
  let verdict = verdicts.has(raw.verdict) ? raw.verdict : "unknown";
  let siteKind = kinds.has(raw.siteKind) ? raw.siteKind : fallback.siteKind || "other";
  let routeUrl = String(raw.routeUrl || "").trim();
  if (routeUrl && !urlSet.has(normalizeUrl(routeUrl))) {
    routeUrl = "";
  }
  if (verdict === "unreachable") qualify = false;

  const hasPitch = (evidence.openKinds || []).some((k) => PITCH_KINDS.has(k));
  if (siteKind === "product" && !hasPitch) {
    qualify = false;
    verdict = "unreachable";
  }

  const knownOk = evidence.knownPaid || evidence.knownFree;
  const rankingOk =
    evidence.homepageOk &&
    (fallback.verdict === "maybe" || evidence.pageLive) &&
    ["serp-listing", "publication"].includes(String(evidence.rowType || ""));
  if (qualify && !routeUrl && !knownOk && !rankingOk) qualify = false;
  if (qualify && verdict === "unknown" && !knownOk && !routeUrl) qualify = false;

  return {
    qualify,
    alive: evidence.alive,
    cost: evidence.knownPaid ? "paid" : cost === "paid" ? "paid" : evidence.knownFree && cost !== "paid" ? "unpaid" : cost,
    verdict,
    siteKind,
    routeUrl,
    costNote: String(raw.reason || fallback.costNote || "").slice(0, 240),
    probed: true,
    llm: "grounded",
  };
}

async function classifyWithLlm(row, evidence, llmConfig, fallback) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 12000);
  try {
    const result = await chatCompletion({
      provider: llmConfig.provider,
      model: llmConfig.model,
      siteConfig: llmConfig,
      temperature: 0,
      maxTokens: 350,
      jsonMode: true,
      signal: ac.signal,
      system: LLM_SYSTEM,
      user: JSON.stringify({
        keyword: row.keyword || "",
        domain: evidence.domain,
        typeGuess: row.type || "",
        evidence: {
          homepageOk: evidence.homepageOk,
          parked: evidence.parked,
          knownPaid: evidence.knownPaid,
          knownFree: evidence.knownFree,
          navLabels: evidence.openNav.map((r) => r.label),
          urls: evidence.urls.map((u) => ({
            url: u.url,
            kind: u.kind,
            excerpt: u.excerpt,
          })),
        },
      }),
    });
    return groundLlmVerdict(result.json, { ...evidence, rowType: row.type }, fallback);
  } catch {
    return { ...fallback, llm: "error" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {Array<{ domain: string, type?: string, sourceUrls?: string[], keyword?: string }>} rows
 */
async function resolveProbeLlmConfig() {
  let llmConfig = null;
  try {
    llmConfig = await getLinkOpportunitiesLlmConfig();
  } catch {
    llmConfig = null;
  }
  if (llmConfig && llmConfig.enabled !== false && hasProviderKey(llmConfig.provider, llmConfig)) {
    return llmConfig;
  }
  return llmConfig;
}

export async function qualifyPitchProspects(
  rows,
  { concurrency = 10, limit = 80, llmLimit = 80, onResult = null } = {}
) {
  const results = new Map();
  const llmConfig = await resolveProbeLlmConfig();
  const llmReady =
    llmConfig &&
    llmConfig.enabled !== false &&
    hasProviderKey(llmConfig.provider, llmConfig);

  const remember = async (domain, payload) => {
    results.set(domain, payload);
    try {
      await onResult?.(domain, payload);
    } catch {
      /* UI progress is best-effort */
    }
  };

  const slice = rows.slice(0, limit);
  await mapLimit(slice, concurrency, async (row, idx) => {
    const domain = cleanHost(row?.domain);
    if (!domain) return;
    if (hostMatchesSet(domain, KNOWN_PAID_HOSTS)) {
      await remember(domain, {
        qualify: true,
        alive: true,
        cost: "paid",
        verdict: "paid",
        costNote: "Known paid listing network.",
        probed: true,
      });
      return;
    }
    const cacheKey = `qualify-v6:${domain}:${String(row.keyword || "").toLowerCase().slice(0, 48)}:${String(row.type || "")}`;
    try {
      const cached = await getCachedSnapshot(domain, DATA_TYPES.PROSPECT_PROBE, cacheKey);
      if (cached?.payload && !cached.expired && cached.payload.probed) {
        await remember(domain, cached.payload);
        return;
      }
    } catch {
      /* best-effort */
    }

    const evidence = await gatherEvidence(row);
    const fallback = heuristicFromEvidence(row, evidence);
    let payload = fallback;
    if (llmReady && evidence.alive !== false && idx < llmLimit) {
      const llm = await classifyWithLlm(row, evidence, llmConfig, fallback);
      if (llm.llm === "grounded") {
        payload = {
          qualify: llm.qualify,
          alive: evidence.alive,
          cost: evidence.knownPaid ? "paid" : llm.cost || fallback.cost,
          verdict: llm.verdict || fallback.verdict,
          siteKind: llm.siteKind || fallback.siteKind || "other",
          routeUrl: llm.routeUrl || fallback.routeUrl || "",
          costNote: llm.costNote || fallback.costNote,
          probed: true,
          llm: "grounded",
        };
      } else {
        payload = { ...fallback, llm: llm.llm || "heuristic" };
      }
    }
    if (payload.alive === false) payload.qualify = false;

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
    await remember(domain, payload);
  });

  results.llmReady = llmReady;
  return results;
}
