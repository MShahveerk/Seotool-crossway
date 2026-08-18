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

/**
 * Live qualify — fetch real pages, then optionally ask an LLM to judge them.
 *
 * The model is not allowed to invent a route. A grounded qualify=true needs
 * fetched HTML, a known claimable/paid host, or a still-live captured page.
 * Invented URLs are stripped.
 *
 * A miss is not a rejection: JS-rendered and WAF-blocked sites often look
 * empty even when they take listings. The LLM may add a grounded route or
 * a paid/unpaid call; it must not veto a heuristic that already found one.
 * Only parked / backlink-mill pages fail closed.
 */

const QUALIFY_PATHS = [
  { path: "/write-for-us", kind: "contribute", weight: 100 },
  { path: "/guest-post", kind: "contribute", weight: 100 },
  { path: "/submit", kind: "submit", weight: 90 },
  { path: "/add-listing", kind: "listing", weight: 90 },
  { path: "/add-your-business", kind: "listing", weight: 88 },
  { path: "/advertise", kind: "paid", weight: 50 },
];

const OPEN_KINDS = new Set(["contribute", "submit", "listing", "paid", "resource"]);

const LLM_SYSTEM = `You classify whether a website is a realistic link-building pitch for a business ranking for a keyword.

You may ONLY use the evidence JSON. Do not use training knowledge about the brand.
Do not invent URLs, emails, prices, forms, or pages.
routeUrl must be copied EXACTLY from evidence.urls[].url, or be an empty string.
If the excerpts do not show a submit, claim, listing, contribute, write-for-us, or advertise route, set qualify to false and verdict to "unknown".
Job boards, website builders, course platforms, social networks and search engines: qualify false, verdict "unreachable".
Parked or backlink-selling pages: qualify false, verdict "unreachable".
Return a JSON object with keys: qualify (boolean), cost ("paid"|"unpaid"|"unknown"), verdict ("open"|"paid"|"maybe"|"unknown"|"unreachable"), routeUrl (string), reason (one sentence citing the evidence).`;

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
  const home = await fetchPage(origin, 5000);
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

  const captured = (row.sourceUrls || []).filter(Boolean)[0];
  let pageLive = false;
  if (captured && normalizeUrl(captured) !== normalizeUrl(origin)) {
    const page = await fetchPage(captured, 4500);
    pageLive = page.ok;
    if (page.ok) {
      urls.push({
        url: page.finalUrl || captured,
        status: page.status,
        kind: "captured",
        excerpt: excerptText(page.html),
      });
    }
  }

  if (!openNav.length && home.ok && !parked) {
    const hits = await Promise.all(
      QUALIFY_PATHS.slice(0, 4).map(async (r) => {
        const res = await fetchPage(`${origin}${r.path}`, 3500);
        return res.ok ? { ...r, url: res.finalUrl || `${origin}${r.path}`, html: res.html } : null;
      })
    );
    for (const hit of hits.filter(Boolean)) {
      urls.push({
        url: hit.url,
        status: 200,
        kind: hit.kind,
        excerpt: excerptText(hit.html, 900),
      });
    }
  }

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
    knownPaid: hostMatchesSet(domain, KNOWN_PAID_HOSTS),
    knownFree: hostMatchesSet(domain, KNOWN_FREE_HOSTS),
  };
}

function heuristicFromEvidence(row, evidence) {
  const costInfo = classifyPitchCost(row, evidence.home);
  if (evidence.parked || costInfo.alive === false) {
    return {
      qualify: false,
      alive: false,
      cost: "unknown",
      verdict: "unreachable",
      costNote: costInfo.costNote || "Parked or selling backlinks.",
      probed: true,
    };
  }
  if (evidence.knownPaid) {
    return {
      qualify: true,
      alive: true,
      cost: "paid",
      verdict: "paid",
      costNote: "Known paid listing network.",
      probed: true,
    };
  }
  if (evidence.knownFree) {
    return {
      qualify: true,
      alive: true,
      cost: "unpaid",
      verdict: "open",
      costNote: "Known free claimable listing.",
      probed: true,
    };
  }
  const paidOnly =
    evidence.openKinds.includes("paid") &&
    !evidence.openKinds.some((k) => k === "contribute" || k === "submit" || k === "listing");
  if (evidence.openKinds.some((k) => OPEN_KINDS.has(k))) {
    const route = evidence.openNav[0]?.url || evidence.urls.find((u) => OPEN_KINDS.has(u.kind))?.url || "";
    return {
      qualify: true,
      alive: true,
      cost: paidOnly || costInfo.cost === "paid" ? "paid" : "unpaid",
      verdict: paidOnly ? "paid" : "open",
      routeUrl: route,
      costNote: paidOnly ? "Advertise/sponsored route found." : "Live submit or listing route found.",
      probed: true,
    };
  }
  if (evidence.pageLive && (row.type === "roundup" || row.type === "resource")) {
    return {
      qualify: true,
      alive: true,
      cost: "unpaid",
      verdict: "maybe",
      routeUrl: (row.sourceUrls || [])[0] || "",
      costNote: "The linking page is still live — pitch to be added.",
      probed: true,
    };
  }
  if (evidence.homepageOk && (row.type === "serp-listing" || row.type === "publication")) {
    return {
      qualify: true,
      alive: true,
      cost: costInfo.cost === "paid" ? "paid" : "unpaid",
      verdict: "maybe",
      costNote:
        row.type === "publication"
          ? "Industry publication that ranks — pitch the editor."
          : "Ranking locator/directory — homepage is live.",
      probed: true,
    };
  }
  return {
    qualify: false,
    alive: true,
    cost: costInfo.cost || "unknown",
    verdict: "unknown",
    costNote: "No live submit, listing or contribute route found.",
    probed: true,
  };
}

function groundLlmVerdict(raw, evidence, fallback) {
  if (!raw || typeof raw !== "object") return { ...fallback, llm: "invalid" };
  const urlSet = new Set(evidence.urls.map((u) => normalizeUrl(u.url)));
  const costs = new Set(["paid", "unpaid", "unknown"]);
  const verdicts = new Set(["open", "paid", "maybe", "unknown", "unreachable"]);

  let qualify = raw.qualify === true;
  let cost = costs.has(raw.cost) ? raw.cost : fallback.cost || "unknown";
  let verdict = verdicts.has(raw.verdict) ? raw.verdict : "unknown";
  let routeUrl = String(raw.routeUrl || "").trim();
  if (routeUrl && !urlSet.has(normalizeUrl(routeUrl))) {
    routeUrl = "";
  }
  if (verdict === "unreachable") qualify = false;

  const knownOk = evidence.knownPaid || evidence.knownFree;
  const rankingOk =
    evidence.homepageOk &&
    (fallback.verdict === "maybe" || evidence.pageLive) &&
    ["serp-listing", "publication", "roundup", "resource"].includes(String(evidence.rowType || ""));
  if (qualify && !routeUrl && !knownOk && !rankingOk) qualify = false;
  if (qualify && verdict === "unknown" && !knownOk && !routeUrl) qualify = false;

  return {
    qualify,
    alive: evidence.alive,
    cost: evidence.knownPaid ? "paid" : evidence.knownFree ? "unpaid" : cost,
    verdict,
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
export async function qualifyPitchProspects(
  rows,
  { concurrency = 6, limit = 80, llmLimit = 20 } = {}
) {
  const results = new Map();
  let llmConfig = null;
  try {
    llmConfig = await getLinkOpportunitiesLlmConfig();
  } catch {
    llmConfig = null;
  }
  const llmReady =
    llmConfig &&
    llmConfig.enabled !== false &&
    hasProviderKey(llmConfig.provider, llmConfig);

  const slice = rows.slice(0, limit);
  await mapLimit(slice, concurrency, async (row, idx) => {
    const domain = cleanHost(row?.domain);
    if (!domain) return;
    if (hostMatchesSet(domain, KNOWN_PAID_HOSTS)) {
      results.set(domain, {
        qualify: true,
        alive: true,
        cost: "paid",
        verdict: "paid",
        costNote: "Known paid listing network.",
        probed: true,
      });
      return;
    }
    if (hostMatchesSet(domain, KNOWN_FREE_HOSTS)) {
      results.set(domain, {
        qualify: true,
        alive: true,
        cost: "unpaid",
        verdict: "open",
        costNote: "Known free claimable listing.",
        probed: true,
      });
      return;
    }
    const cacheKey = `qualify-v3:${domain}:${String(row.keyword || "").toLowerCase().slice(0, 48)}`;
    try {
      const cached = await getCachedSnapshot(domain, DATA_TYPES.PROSPECT_PROBE, cacheKey);
      if (cached?.payload && !cached.expired && cached.payload.probed) {
        results.set(domain, cached.payload);
        return;
      }
    } catch {
      /* best-effort */
    }

    const evidence = await gatherEvidence(row);
    const fallback = heuristicFromEvidence(row, evidence);
    let payload = fallback;
    // LLM annotates up to llmLimit prospects (callers pass the full count when
    // they want every live site checked); HTTP heuristics cover any remainder.
    if (llmReady && evidence.alive !== false && idx < llmLimit) {
      const llm = await classifyWithLlm(row, evidence, llmConfig, fallback);
      payload = {
        qualify: Boolean(fallback.qualify || llm.qualify),
        alive: evidence.alive,
        cost: evidence.knownPaid
          ? "paid"
          : evidence.knownFree
            ? "unpaid"
            : llm.cost || fallback.cost,
        verdict: fallback.qualify ? fallback.verdict : llm.verdict || fallback.verdict,
        routeUrl: llm.routeUrl || fallback.routeUrl || "",
        costNote:
          llm.llm === "error" ? fallback.costNote : llm.costNote || fallback.costNote,
        probed: true,
        llm: llm.llm || "heuristic",
      };
    }
    if (payload.alive === false) payload.qualify = false;

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

  results.llmReady = llmReady;
  return results;
}
