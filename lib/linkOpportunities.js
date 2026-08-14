/**
 * Link Opportunities — "who links to the sites that rank for this keyword?"
 *
 * The question this answers is not "who has the strongest backlinks" (that just
 * returns unreachable mega-sites). It's **link intersect**: which referring
 * domains link to *several* of the top rankers at once. A site that already
 * linked to four of the top ten for this topic has demonstrated it will link to
 * a site like yours — that's an outreach list, not trivia.
 *
 * Data flow (no new vendors, no new SERP calls):
 *   1. `getSerpAnalysis` gives the ranked ladder — already cached 3 days, so a
 *      keyword you've analysed costs nothing here.
 *   2. `fetchCompetitorBacklinkDetail(domain)` gives that domain's referring
 *      domains (with their own authority) and the exact linking pages/anchors.
 *      Cached 30 days *per domain*, which is what makes this affordable: local
 *      SERPs reuse the same competitors, so the second keyword in a niche is
 *      mostly cache hits.
 *   3. Aggregate into two views: intersect (shared linkers) and strongest
 *      (individual links by source authority).
 *
 * Cost: the backlinks endpoint bills ~1 credit per referring domain and per
 * individual link returned, so depth is the credit dial. The default of 10
 * rankers x 200 refdomains + 100 links ≈ 3,000 credits on a cold keyword, and
 * close to nothing on the next keyword in the same niche.
 */

import crypto from "crypto";
import { getSerpAnalysis, fetchCompetitorBacklinkDetail } from "./serpAnalysis.js";
import { getAuthorityScores } from "./authority.js";
import { fetchDomainCompetitors } from "./seranking/api.js";
import { normalizeDomainCompetitors } from "./seranking/normalize.js";
import { getCachedSnapshot, saveSnapshot } from "./seranking/cache.js";
import { DATA_TYPES } from "./seranking/config.js";
import { logger } from "./logger.js";

/** Social, UGC and hosting — links you can't pitch for and wouldn't want. */
const LOW_VALUE_LINKERS = new Set([
  "facebook.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "instagram.com",
  "pinterest.com",
  "youtube.com",
  "reddit.com",
  "t.co",
  "blogspot.com",
  "wordpress.com",
  "wixsite.com",
  "medium.com",
  "tumblr.com",
  "amazonaws.com",
  "googleusercontent.com",
]);

/**
 * Business-data scrapers and lead-gen aggregators.
 *
 * These auto-generate a page for every business they can find, so they flood
 * the backlink profile of any small local business — which is exactly the kind
 * of site that ranks for local service keywords. They are real links and they
 * are never gettable: there is nobody to pitch, and being added means nothing.
 * Kept in the data but classified so they can't crowd out the pitchable list.
 */
const SCRAPER_HOSTS = new Set([
  "enigma.com",
  "visualvisitor.com",
  "flokii.com",
  "accio.com",
  "developmentmi.com",
  "zoominfo.com",
  "dnb.com",
  "bizapedia.com",
  "opencorporates.com",
  "crunchbase.com",
  "apollo.io",
  "rocketreach.co",
  "leadiq.com",
  "signalhire.com",
  "lusha.com",
  "buzzfile.com",
  "corporationwiki.com",
  "manta.com",
  "cybo.com",
  "tuugo.us",
  "hotfrog.com",
  "brownbook.net",
  "storeboard.com",
  "callupcontact.com",
  "elocal.com",
  "trustoria.com",
  "kompass.com",
  "yellowpages.com",
  "superpages.com",
  "citysquares.com",
  "chamberofcommerce.com",
]);

/** Domain patterns that betray an auto-generated business listing farm. */
const SCRAPER_PATTERNS = /(b2b|leadgen|lead-gen|companylist|company-list|bizdir|biz-dir|findcompan|companyprofil)/i;

function isScraper(domain) {
  if (!domain) return false;
  if (SCRAPER_HOSTS.has(domain)) return true;
  if ([...SCRAPER_HOSTS].some((h) => domain.endsWith(`.${h}`))) return true;
  return SCRAPER_PATTERNS.test(domain);
}

/**
 * Does a ranking result look like a place that *lists* businesses?
 *
 * This is the fix for the biggest gap in the first version: niche directories
 * (a smoke-shop locator, a vape-shop map) rank for the very keyword you're
 * researching, and being listed on them is usually the single best link you
 * can get. They were being treated as ordinary competitors and analysed for
 * *their* backlinks, instead of being surfaced as prospects in their own right.
 */
const LISTING_DOMAIN_RE =
  /(locator|directory|directories|finder|findlocal|maps?|listings?|guide|near-?me|yellow|places|spots|shops?finder)/i;
const LISTING_TITLE_RE =
  /(directory|near you|near me|\bbest\b|\btop\s*\d|listings?|find (a|the|your)|locator|map of|guide to|places to)/i;

function looksLikeListing(domain, title, tag) {
  if (tag === "directory") return true;
  if (LISTING_DOMAIN_RE.test(String(domain || ""))) return true;
  return LISTING_TITLE_RE.test(String(title || ""));
}

/** Meaningful words from the keyword, for topical-relevance scoring. */
const STOP_WORDS = new Set([
  "the", "and", "for", "with", "near", "best", "top", "in", "on", "of", "a", "an",
  "to", "my", "me", "your", "shop", "shops", "store", "stores", "service", "services",
]);

function keywordTokens(keyword) {
  return String(keyword || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

/** Does this linker's domain read as being in the same niche? */
function nicheMatch(domain, tokens) {
  if (!tokens.length) return false;
  const d = String(domain || "").toLowerCase();
  return tokens.some((t) => d.includes(t));
}

/**
 * Prospect classification.
 *
 * A referring domain is only an *opportunity* if there's a plausible way for you
 * to get a link there. A newswire pickup or a scraped profile is a link, but you
 * can't act on it. These patterns read the linking page's URL and sort the list
 * into things you can pitch versus things you can only envy.
 *
 * Weight is "how gettable", not "how valuable" — deliberately. Authority is
 * already a separate column; this column answers "can I actually do something".
 */
const PROSPECT_TYPES = [
  {
    type: "serp-listing",
    label: "Listing site that ranks",
    weight: 120,
    hint: "A directory or locator that ranks for this keyword itself. Getting listed here puts you on a page Google already sends this traffic to - usually the single best link available.",
    // Assigned directly from the SERP, never inferred from a URL pattern.
    re: /$a^/,
  },
  {
    type: "guest-post",
    label: "Accepts contributions",
    weight: 100,
    hint: "Has a write-for-us / contribute / submit page — the most direct route in.",
    re: /(write[-_]for[-_]us|guest[-_]post|guest[-_]blog|contribut(e|or)|become[-_]an?[-_]author|submit[-_](a[-_])?(post|article|story|guest|tip))/i,
  },
  {
    type: "directory",
    label: "Directory / listing",
    weight: 92,
    hint: "A listing you can usually claim or submit to.",
    re: /\/(directory|directories|listings?|companies|agenc(y|ies)|providers?|vendors?|suppliers?|find[-_]a|member[-_]?directory|businesses)(\/|$)/i,
  },
  {
    type: "resource",
    label: "Resource page",
    weight: 86,
    hint: "A curated links page — classic outreach target.",
    re: /\/(resources?|useful[-_]links?|helpful[-_]links?|recommended|partners?|links)(\/|$)/i,
  },
  {
    type: "roundup",
    label: "Roundup / listicle",
    weight: 78,
    hint: "A 'best of' post you can pitch to be added to.",
    re: /\/(best[-_]|top[-_]\d|\d+[-_]best|\d+[-_]top|alternatives?|vs[-_]|comparison|reviews?)/i,
  },
  {
    type: "blog",
    label: "Blog / editorial",
    weight: 58,
    hint: "Editorial content — reachable, but needs a real pitch.",
    re: /\/(blog|articles?|insights?|posts?|guides?|learn|magazine)(\/|$)/i,
  },
  {
    type: "press",
    label: "News / PR",
    weight: 18,
    hint: "Newswire or press pickup — rarely repeatable on demand.",
    re: /(press[-_]release|prnewswire|businesswire|globenewswire|einpresswire|\/press(\/|$)|\/news(room)?(\/|$))/i,
  },
  {
    type: "profile",
    label: "Profile / forum",
    weight: 12,
    hint: "User-generated profile or thread — low value, easily spammed.",
    re: /\/(users?|profiles?|members?|forums?|threads?|topic|comments?|authors?|tag|category)(\/|$)/i,
  },
  {
    type: "scraper",
    label: "Auto-listing / data scraper",
    weight: 2,
    hint: "A business-data site that scraped this listing automatically. There is nobody to pitch and being added means nothing — shown so you know where the link came from.",
    re: /$a^/,
  },
];

const UNKNOWN_TYPE = {
  type: "other",
  label: "Unclassified",
  weight: 40,
  hint: "Couldn't tell from the URL — worth eyeballing.",
};

/** Best-matching prospect type across every known linking page for a domain. */
function classifyProspect(sourceUrls = []) {
  let best = null;
  for (const url of sourceUrls) {
    if (!url) continue;
    let path;
    try {
      const u = new URL(String(url).startsWith("http") ? url : `https://${url}`);
      path = `${u.pathname}${u.search}`;
    } catch {
      path = String(url);
    }
    for (const candidate of PROSPECT_TYPES) {
      if (candidate.re.test(path) && (!best || candidate.weight > best.weight)) {
        best = candidate;
      }
    }
  }
  return best || UNKNOWN_TYPE;
}

function cleanHost(value) {
  if (!value) return "";
  try {
    const url = String(value).startsWith("http") ? String(value) : `https://${value}`;
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return String(value)
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .toLowerCase();
  }
}

function isLowValue(domain) {
  if (!domain) return true;
  if (LOW_VALUE_LINKERS.has(domain)) return true;
  return [...LOW_VALUE_LINKERS].some((bad) => domain.endsWith(`.${bad}`));
}

function cacheKey(keyword, geo, device, location, depth) {
  const h = crypto
    .createHash("sha256")
    .update(`${String(keyword || "").toLowerCase().trim()}|${String(location || "").toLowerCase().trim()}`)
    .digest("hex")
    .slice(0, 24);
  // Bump the version whenever the aggregate's shape or scoring changes.
  return `lo-v4:${geo}:${device}:${depth.rankers}x${depth.refdomains}:${h}`;
}

/**
 * @param {string} siteUrl        your site — used to mark linkers you already have
 * @param {string} keyword
 * @param {object} [opts]         { location, device, geo, rankers, refdomains }
 */
export async function buildLinkOpportunities(siteUrl, keyword, opts = {}) {
  const {
    location = "",
    device = "desktop",
    geo = "us",
    rankers = 10,
    refdomains = 200,
  } = opts;

  const yourHost = cleanHost(siteUrl);

  // 1. The ladder. Cached — this is normally free.
  const serp = await getSerpAnalysis(siteUrl, keyword, { location, device, geo });

  // Real competitors only: the ladder already tags directories/aggregators, and
  // your own site isn't a link target for you.
  const ladder = Array.isArray(serp?.fullLadder) ? serp.fullLadder : [];
  const targets = [];
  const seen = new Set();
  for (const row of ladder) {
    const host = cleanHost(row?.domain);
    if (!host || host === yourHost) continue;
    if (row?.tag === "directory") continue;
    if (seen.has(host)) continue;
    seen.add(host);
    targets.push({ domain: host, position: row?.position ?? null, title: row?.title || "" });
    if (targets.length >= rankers) break;
  }

  /*
   * Two corrections to "who do we read the backlinks of".
   *
   * 1. Ranking for one keyword does not make a site a competitor. A search for
   *    "smokeshop" surfaced a BBQ restaurant, whose backlinks are restaurant
   *    press, not smoke-shop directories. `/domain/competitors` returns sites
   *    with genuine organic keyword overlap — their link profiles ARE the
   *    niche's link graph.
   *
   * 2. The refdomains endpoint returns the top 200 *by authority*, so for a
   *    site with thousands of backlinks a DA-15 niche locator can never
   *    surface. But a small local rival often has fewer than 200 referring
   *    domains in total — meaning we see its entire profile, niche directories
   *    included. So smaller, genuinely comparable rivals are worth more here
   *    than bigger ones, and we sort the pool accordingly.
   */
  const seeds = targets.slice(0, 4).map((t) => t.domain);
  const competitorPool = new Map();

  await Promise.all(
    seeds.map(async (seed) => {
      try {
        const res = await fetchDomainCompetitors(seed, seed, { allowManual: true });
        for (const c of normalizeDomainCompetitors(res?.data)) {
          const host = cleanHost(c.domain);
          if (!host || host === yourHost || isLowValue(host) || seen.has(host)) continue;
          const prev = competitorPool.get(host);
          // Keep the strongest overlap reading if several seeds share a rival.
          if (!prev || (c.commonKeywords ?? 0) > (prev.commonKeywords ?? 0)) {
            competitorPool.set(host, {
              domain: host,
              commonKeywords: c.commonKeywords ?? null,
              traffic: c.traffic ?? null,
              source: "competitor",
            });
          }
        }
      } catch (err) {
        logger?.warn?.(`Link opportunities: competitors for ${seed} failed — ${err.message}`);
      }
    })
  );

  // Overlap first (relevance), then smaller traffic first — a smaller site is
  // more likely to fit inside the 200-domain window we can actually see.
  const ranked = [...competitorPool.values()].sort(
    (a, b) =>
      (b.commonKeywords ?? 0) - (a.commonKeywords ?? 0) ||
      (a.traffic ?? Infinity) - (b.traffic ?? Infinity)
  );

  // Reserve roughly 40% of the budget for true competitors, so SERP results
  // can't crowd them out — and backfill either way if one side runs short.
  const serpSlots = Math.max(1, Math.ceil(rankers * 0.6));
  const merged = targets.slice(0, serpSlots).map((t) => ({ ...t, source: "serp" }));
  for (const c of ranked) {
    if (merged.length >= rankers) break;
    if (merged.some((m) => m.domain === c.domain)) continue;
    merged.push({ domain: c.domain, position: null, title: "", ...c });
  }
  for (const t of targets.slice(serpSlots)) {
    if (merged.length >= rankers) break;
    if (merged.some((m) => m.domain === t.domain)) continue;
    merged.push({ ...t, source: "serp" });
  }

  targets.length = 0;
  targets.push(...merged);

  if (!targets.length) {
    return {
      keyword: serp?.keyword || keyword,
      location: serp?.location || location,
      locationSource: serp?.locationSource || "none",
      device,
      geo,
      yourHost,
      depth: { rankers, refdomains },
      targets: [],
      intersect: [],
      strongest: [],
      byType: [],
      summary: { analysed: 0, uniqueLinkers: 0, sharedLinkers: 0, alreadyYours: 0, prospects: 0, failed: 0 },
      notes: ["No rankable competitor domains were found for this keyword."],
    };
  }

  // 2. Each competitor's link profile. Sequential-ish via Promise.all is fine —
  //    the SE Ranking client already queues and rate-limits requests.
  const details = await Promise.all(
    targets.map((t) =>
      fetchCompetitorBacklinkDetail(t.domain, { refLimit: refdomains, linkLimit: 100 })
        .then((d) => ({ target: t, detail: d, error: d?.error || null }))
        .catch((err) => {
          logger?.warn?.(`Link opportunities: ${t.domain} failed — ${err.message}`);
          return { target: t, detail: null, error: err.message };
        })
    )
  );

  // Which linkers you already have, so the list can say "you don't have this".
  let yoursSet = new Set();
  if (yourHost) {
    try {
      const mine = await fetchCompetitorBacklinkDetail(yourHost, {
        refLimit: refdomains,
        linkLimit: 25,
      });
      yoursSet = new Set((mine?.refdomains || []).map((r) => cleanHost(r.domain)).filter(Boolean));
    } catch {
      /* knowing your own profile is a bonus, not a requirement */
    }
  }

  // Everything on page 1 — used to flag a linker that also ranks. Those are the
  // best prospects of all: a roundup that ranks AND links out to five rivals.
  const rankingHosts = new Set(ladder.map((r) => cleanHost(r?.domain)).filter(Boolean));

  // Listing sites that rank for this keyword are prospects in their own right,
  // whether or not they happen to link to one of the analysed rivals. This is
  // where the niche directories live — the smoke-shop locators and vape maps
  // that the first version silently discarded as "not a real competitor".
  const tokens = keywordTokens(serp?.keyword || keyword);
  const serpListings = new Map();
  for (const row of ladder) {
    const host = cleanHost(row?.domain);
    if (!host || host === yourHost || isLowValue(host)) continue;
    if (!looksLikeListing(host, row?.title, row?.tag)) continue;
    if (serpListings.has(host)) continue;
    serpListings.set(host, {
      domain: host,
      position: row?.position ?? null,
      title: row?.title || "",
    });
  }

  // 3a. Intersect — one row per referring domain, across all competitors.
  const byLinker = new Map();
  let failed = 0;

  for (const { target, detail, error } of details) {
    if (error || !detail) {
      failed += 1;
      continue;
    }
    for (const ref of detail.refdomains || []) {
      const domain = cleanHost(ref?.domain);
      if (!domain || domain === yourHost || isLowValue(domain)) continue;

      let row = byLinker.get(domain);
      if (!row) {
        row = {
          domain,
          authority: ref?.inlinkRank ?? null,
          linksTo: [],
          anchors: [],
          examples: [],
          sourceUrls: [],
          dofollow: null,
          youHaveIt: yoursSet.has(domain),
          alsoRanks: rankingHosts.has(domain),
        };
        byLinker.set(domain, row);
      }
      // Keep the highest authority reading we've seen for this linker.
      if (ref?.inlinkRank != null && (row.authority == null || ref.inlinkRank > row.authority)) {
        row.authority = ref.inlinkRank;
      }
      if (!row.linksTo.includes(target.domain)) {
        row.linksTo.push(target.domain);
      }
    }

    // Attach real anchors/pages from the link list where we can.
    for (const link of detail.links || []) {
      const domain = cleanHost(link?.sourceUrl);
      const row = byLinker.get(domain);
      if (!row) continue;
      const anchor = String(link?.anchor || "").trim();
      if (anchor && !row.anchors.includes(anchor) && row.anchors.length < 5) {
        row.anchors.push(anchor);
      }
      if (link?.sourceUrl && row.sourceUrls.length < 25) {
        row.sourceUrls.push(link.sourceUrl);
      }
      // One dofollow anywhere is enough to call the domain dofollow-capable.
      if (link?.dofollow === true) row.dofollow = true;
      else if (link?.dofollow === false && row.dofollow == null) row.dofollow = false;

      // The exact pages are the point — this is what you open to find a
      // contact form, a submission page, or the editor to pitch.
      if (link?.sourceUrl && row.examples.length < 15) {
        row.examples.push({
          sourceUrl: link.sourceUrl,
          targetDomain: target.domain,
          targetUrl: link?.targetUrl || "",
          anchor,
          dofollow: link?.dofollow ?? null,
        });
      }
    }
  }

  // Listing sites that rank but never linked to an analysed rival still belong
  // in the list — they're reachable and relevant by definition.
  //
  // Their authority has to be looked up separately: the usual source is a
  // rival's referring-domain list, and by definition these aren't in one.
  // Open PageRank is day-cached and costs no vendor credits.
  let listingAuthority = new Map();
  const listingHosts = [...serpListings.keys()].filter((h) => !byLinker.has(h));
  if (listingHosts.length) {
    try {
      listingAuthority = await getAuthorityScores(listingHosts);
    } catch (err) {
      logger?.warn?.(`Link opportunities: authority lookup failed — ${err.message}`);
    }
  }

  for (const [host, listing] of serpListings) {
    if (byLinker.has(host)) continue;
    byLinker.set(host, {
      domain: host,
      // toScore100 elsewhere in the app scales Open PageRank 0-10 to 0-100,
      // which is the scale the refdomain inlinkRank uses — keep them comparable.
      authority:
        listingAuthority.get(host)?.score != null
          ? Math.round(listingAuthority.get(host).score * 10)
          : null,
      linksTo: [],
      anchors: [],
      examples: [],
      sourceUrls: [],
      dofollow: null,
      youHaveIt: yoursSet.has(host),
      alsoRanks: true,
      serpPosition: listing.position,
      serpTitle: listing.title,
    });
  }

  const intersect = [...byLinker.values()]
    .map((row) => {
      const hits = row.linksTo.length;
      const listing = serpListings.get(row.domain);

      // Order matters: a ranking listing site outranks any URL-pattern guess,
      // and a known scraper is never anything else.
      const kind = isScraper(row.domain)
        ? PROSPECT_TYPES.find((t) => t.type === "scraper")
        : listing
          ? PROSPECT_TYPES.find((t) => t.type === "serp-listing")
          : classifyProspect(row.sourceUrls);
      // "How gettable" first, then proof of willingness (how many rivals it
      // already links to), then authority as the tiebreak. A site you can
      // pitch beats a stronger one you can't.
      // A domain that reads as being in the same niche beats a generic one of
      // the same type — "vapeshopmaps" over "boston.com" for a smoke shop.
      const onNiche = nicheMatch(row.domain, tokens);

      const prospectScore = Math.round(
        kind.weight +
          Math.max(0, Math.min(hits - 1, 5)) * 14 +
          (listing ? Math.max(0, 30 - (listing.position ?? 30)) : 0) +
          (onNiche ? 25 : 0) +
          (row.dofollow === true ? 8 : 0) +
          Math.min((row.authority ?? 0) / 10, 8) -
          (row.youHaveIt ? 60 : 0)
      );
      return {
        ...row,
        hits,
        onNiche,
        // How many exact linking pages we captured. Prospects found only via
        // the referring-domain list have 0 — you get the site, not the page.
        pageCount: row.examples.length,
        type: kind.type,
        typeLabel: kind.label,
        typeHint: kind.hint,
        prospectScore,
      };
    })
    .sort(
      (a, b) =>
        b.prospectScore - a.prospectScore ||
        b.hits - a.hits ||
        (b.authority ?? -1) - (a.authority ?? -1)
    )
    .slice(0, 1000);

  // 3b. Strongest — individual links, by the authority of the linking domain.
  const strongest = [];
  for (const { target, detail } of details) {
    if (!detail) continue;
    const authByDomain = new Map(
      (detail.refdomains || []).map((r) => [cleanHost(r.domain), r?.inlinkRank ?? null])
    );
    for (const link of detail.links || []) {
      const sourceDomain = cleanHost(link?.sourceUrl);
      if (!sourceDomain || isLowValue(sourceDomain)) continue;
      strongest.push({
        sourceDomain,
        sourceUrl: link?.sourceUrl || "",
        targetDomain: target.domain,
        targetUrl: link?.targetUrl || "",
        anchor: String(link?.anchor || "").trim(),
        authority: authByDomain.get(sourceDomain) ?? null,
        youHaveIt: yoursSet.has(sourceDomain),
      });
    }
  }
  strongest.sort((a, b) => (b.authority ?? -1) - (a.authority ?? -1));

  const sharedLinkers = intersect.filter((r) => r.hits > 1).length;
  const alreadyYours = intersect.filter((r) => r.youHaveIt).length;

  // Prospects = places you could plausibly get a link, minus what you have.
  // Scrapers are deliberately absent: there is nobody to pitch.
  const ACTIONABLE = new Set(["serp-listing", "guest-post", "directory", "resource", "roundup"]);
  const prospects = intersect.filter((r) => ACTIONABLE.has(r.type) && !r.youHaveIt).length;

  const byType = PROSPECT_TYPES.concat(UNKNOWN_TYPE).map((t) => ({
    type: t.type,
    label: t.label,
    hint: t.hint,
    count: intersect.filter((r) => r.type === t.type).length,
  }));

  return {
    keyword: serp?.keyword || keyword,
    location: serp?.location || location,
    locationSource: serp?.locationSource || "none",
    device,
    geo,
    yourHost,
    depth: { rankers, refdomains },
    targets,
    intersect,
    strongest: strongest.slice(0, 1000),
    byType,
    summary: {
      analysed: targets.length - failed,
      uniqueLinkers: byLinker.size,
      sharedLinkers,
      alreadyYours,
      prospects,
      failed,
      fromSerp: targets.filter((t) => t.source === "serp").length,
      fromCompetitors: targets.filter((t) => t.source === "competitor").length,
    },
    notes: failed
      ? [`${failed} competitor${failed > 1 ? "s" : ""} returned no link data — their rows are missing from the totals.`]
      : [],
  };
}

/** Cached entry point. Mirrors getSerpAnalysis: best-effort cache, force to bypass. */
export async function getLinkOpportunities(siteUrl, keyword, opts = {}, { force = false } = {}) {
  const { geo = "us", device = "desktop", location = "", rankers = 10, refdomains = 200 } = opts;
  const depth = { rankers, refdomains };
  const cacheSite = cleanHost(siteUrl) || "__no_site__";
  const sourceKey = cacheKey(keyword, geo, device, location, depth);

  if (!force) {
    try {
      const cached = await getCachedSnapshot(cacheSite, DATA_TYPES.LINK_OPPORTUNITIES, sourceKey);
      if (cached?.payload && !cached.expired) {
        return { ...cached.payload, cached: true, fetchedAt: cached.fetchedAt };
      }
    } catch {
      /* cache read is best-effort */
    }
  }

  const data = await buildLinkOpportunities(siteUrl, keyword, opts);

  try {
    await saveSnapshot({
      siteUrl: cacheSite,
      dataType: DATA_TYPES.LINK_OPPORTUNITIES,
      sourceKey,
      payload: data,
      creditsSpent: 0,
    });
  } catch {
    /* cache write is best-effort */
  }

  return { ...data, cached: false, fetchedAt: new Date() };
}
