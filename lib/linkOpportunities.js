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
import { qualifyPitchProspects, KNOWN_PAID_HOSTS, KNOWN_FREE_HOSTS } from "./prospectProbe.js";

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
  // Not sites you can pitch — they're plumbing that shows up in link exports:
  //  • Outlook "Safe Links" rewrites every URL in corporate email, so
  //    nam02.safelinks.protection.outlook.com is an email tracker, not a page.
  //  • *.force.com is a Salesforce app instance (firsttee.force.com), not a
  //    site with a contact form.
  //  • home.blog / homestead.com are free site builders; libguides.com is
  //    Springshare library-guide hosting (effectively academic).
  "protection.outlook.com",
  "force.com",
  "home.blog",
  "homestead.com",
  "libguides.com",
  "translate.goog",
  "cache.google.com",
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

/**
 * Sites that are never a niche rival, whatever a competitor API says.
 *
 * `/domain/competitors` works on overall organic keyword overlap, so asking it
 * for the competitors of a directory returns *other directories* — bbb.org,
 * zillow, realtor, ziprecruiter, dnb. Analysing those as if they were smoke
 * shops pulls their backlinks (nytimes, shopify, godaddy, icann) into the
 * prospect list, which is how a link report ends up recommending ICANN.
 */
const NOT_A_NICHE_RIVAL = new Set([
  "bbb.org", "yellowpages.com", "superpages.com", "yelp.com", "nextdoor.com",
  "zillow.com", "realtor.com", "trulia.com", "redfin.com", "apartments.com",
  "ziprecruiter.com", "indeed.com", "glassdoor.com", "monster.com", "careerbuilder.com",
  "dnb.com", "zoominfo.com", "crunchbase.com", "usnews.com", "expedia.com",
  "tripadvisor.com", "booking.com", "waze.com", "moovitapp.com", "mapquest.com",
  "maps.apple.com", "google.com", "apple.com", "microsoft.com", "amazon.com",
  "shopify.com", "godaddy.com", "wix.com", "squarespace.com", "icann.org",
  "nytimes.com", "washingtonpost.com", "forbes.com", "cnn.com", "bbc.com",
  "wikipedia.org", "trustpilot.com", "angi.com", "thumbtack.com", "houzz.com",
  "wheree.com", "d7leadfinder.com", "linkcentre.com", "trustmary.com",
  "webflow.com", "figma.com", "dribbble.com", "awwwards.com", "behance.net",
  "99designs.com", "designcrowd.com", "design.com", "adobe.com", "framer.com",
  "fiverr.com", "upwork.com", "freelancer.com", "themeforest.net", "envato.com",
  "mailchimp.com", "pagecloud.com", "website.com", "coursera.org", "udemy.com",
  "skillshare.com", "edx.org", "interaction-design.org", "ixdf.org",
  "w3schools.com", "freecodecamp.org", "codecademy.com", "pluralsight.com",
]);

/**
 * Places you cannot pitch, however legitimately they appear in a link profile.
 *
 * Google, Forbes, The Guardian, Apple, Yahoo and GoDaddy do link to small
 * businesses — via maps surfaces, syndicated articles and platform pages — but
 * there is no submission form and no editor waiting for your email. Listing
 * them as "opportunities" wastes the reader's attention on work they cannot do.
 */
const UNPITCHABLE = new Set([
  "google.com", "maps.google.com", "business.google.com", "apple.com",
  "businessconnect.apple.com", "maps.apple.com", "yahoo.com", "maps.yahoo.com",
  "bing.com", "microsoft.com", "amazon.com", "ebay.com", "shopify.com",
  "godaddy.com", "wix.com", "squarespace.com", "weebly.com", "jotform.com",
  "mapbox.com", "openstreetmap.org", "wiki.openstreetmap.org", "help.openstreetmap.org",
  "libsyn.com", "podbean.com", "beehiiv.com", "webflow.com", "webflow.io",
  "wordpress.org", "adobe.com", "figma.com", "dribbble.com", "awwwards.com",
  "behance.net", "99designs.com", "designcrowd.com", "framer.com",
  "fiverr.com", "upwork.com", "freelancer.com",
  "forbes.com", "theguardian.com", "nytimes.com", "washingtonpost.com",
  "cnn.com", "bbc.com", "usnews.com", "icann.org", "wikipedia.org",
  // Mega-publishers and global SaaS: they appear in every big link profile
  // (syndication, "as featured in", pricing pages) but there is no realistic
  // pitch — you are not getting a link on Business Insider or Stripe by asking.
  "businessinsider.com", "businessinsider.de", "insider.com",
  "stripe.com", "bloomberg.com", "reuters.com", "wsj.com", "cnbc.com",
  "loc.gov", "berkeley.edu", "ucla.edu", "psu.edu", "utexas.edu", "usc.edu",
  "rutgers.edu", "arizona.edu", "dartmouth.edu", "unc.edu",
  "coursera.org", "udemy.com", "skillshare.com", "edx.org",
  "interaction-design.org", "ixdf.org", "mailchimp.com", "pagecloud.com",
  "indeed.com", "glassdoor.com", "ziprecruiter.com", "monster.com",
  "careerbuilder.com", "simplyhired.com", "dice.com",
]);

/**
 * Global platforms run a domain per country, so an exact-host list never
 * catches them: blocking google.com leaves google.de, google.co.uk and the
 * rest walking straight through. Match the brand on any TLD instead.
 */
const GLOBAL_PLATFORM_RE =
  /^(?:[a-z0-9-]+\.)*(google|youtube|blogger|amazon|yahoo|bing|msn|live|apple|icloud|facebook|instagram)\.[a-z.]{2,}$/i;

function isGlobalPlatform(domain) {
  if (!domain) return false;
  if (GLOBAL_PLATFORM_RE.test(domain)) return true;
  // google.de is caught above; withgoogle.com and the .google TLD are not.
  if (/(^|\.)(withgoogle\.com|googleusercontent\.com)$/.test(domain)) return true;
  if (/(^|\.)google$/.test(domain)) return true;
  return false;
}

/**
 * SaaS products, booking platforms and document hosts. They link to businesses
 * constantly — pricing comparisons, embedded documents, booking profiles — and
 * none of it is a link you can request.
 */
const PLATFORM_HOSTS = new Set([
  "hubspot.com", "calendly.com", "marriott.com", "issuu.com", "prezi.com",
  "studocu.com", "scribd.com", "slideshare.net", "fresha.com", "vagaro.com",
  "booksy.com", "square.site", "squareup.com", "patch.com", "birdeye.com",
  "restaurantguru.com", "loopnet.com", "agoda.com", "rome2rio.com",
  "travelweekly.com", "mapcarta.com", "wanderlog.com", "mindtrip.ai",
  "moovitapp.com", "waze.com", "expedia.com", "tripadvisor.com", "eventbrite.com",
  "medium.com", "substack.com", "notion.site", "canva.com", "figma.com",
  "webflow.com", "dribbble.com", "awwwards.com", "behance.net", "adobe.com",
  "99designs.com", "designcrowd.com", "framer.com", "fiverr.com", "upwork.com",
  "mailchimp.com", "constantcontact.com", "klaviyo.com", "pagecloud.com",
  "website.com", "coursera.org", "udemy.com", "skillshare.com", "edx.org",
  "interaction-design.org", "ixdf.org", "w3schools.com", "freecodecamp.org",
  "codecademy.com", "pluralsight.com", "canva.com",
]);

function isUnpitchable(domain) {
  if (!domain) return false;
  if (UNPITCHABLE.has(domain)) return true;
  if ([...UNPITCHABLE].some((h) => domain.endsWith(`.${h}`))) return true;
  if (isGlobalPlatform(domain)) return true;
  if (PLATFORM_HOSTS.has(domain)) return true;
  if ([...PLATFORM_HOSTS].some((h) => domain.endsWith(`.${h}`))) return true;
  // Academic and government hosts: their "directory" and "guides" pages match
  // every listing heuristic, and none of them take commercial submissions.
  return /\.(edu|gov|mil)(\.[a-z]{2})?$/.test(domain) || isJobBoard(domain);
}

/**
 * Household-name publishers and platforms. Not junk and not unpitchable in
 * principle — a link on Forbes or Stripe is real — but you get it through PR,
 * a customer story or paid placement, not a quick outreach email. Bucketed on
 * their own so they neither crowd the pitch list nor disappear entirely.
 */
const GIANT_HOSTS = new Set([
  "forbes.com", "businessinsider.com", "businessinsider.de", "insider.com",
  "bloomberg.com", "reuters.com", "wsj.com", "cnbc.com", "marketwatch.com",
  "nytimes.com", "washingtonpost.com", "theguardian.com", "cnn.com", "bbc.com",
  "usnews.com", "time.com", "fortune.com", "inc.com",
  "entrepreneur.com", "fastcompany.com", "wired.com", "techcrunch.com",
  "theverge.com", "mashable.com", "huffpost.com", "vox.com", "vice.com",
  "stripe.com", "salesforce.com", "hubspot.com", "oracle.com", "ibm.com",
  "microsoft.com", "adobe.com", "amazon.com", "shopify.com", "atlassian.com",
  "intuit.com", "paypal.com", "meta.com", "netflix.com", "spotify.com",
  "investopedia.com", "fool.com", "yahoo.com", "msn.com", "medium.com",
]);

function isGiant(domain) {
  if (!domain) return false;
  if (GIANT_HOSTS.has(domain)) return true;
  return [...GIANT_HOSTS].some((h) => domain.endsWith(`.${h}`));
}

function isJobBoard(domain) {
  if (!domain) return false;
  return /^(?:[a-z0-9-]+\.)*(indeed|glassdoor|ziprecruiter|monster|careerbuilder|simplyhired|dice)\.[a-z.]{2,}$/i.test(
    domain
  );
}

/**
 * Spam directory networks.
 *
 * One rival buying a directory blast drags a hundred near-identical domains
 * into the results — topbilliondirectory, linkhubdirectory, rankfastdirectory,
 * ahrefsdirectory, seo-anomaly-sitemap.website. They all "list businesses", so
 * every listing heuristic waves them through. They are worthless at best and
 * actively toxic at worst, and recommending them would be malpractice.
 *
 * The tell is the vocabulary: a directory whose name is about SEO rather than
 * about a subject. A real niche directory is named after its niche.
 */
const SEO_SPAM_TOKENS =
  /(seo|rank|ranking|ranked|rankify|backlink|linkbuild|linkhub|linkzone|linkflow|linkpoint|linkpitcher|guestpost|guest-post|traffic|viral|boost|semrush|ahrefs|moz|submit|indexing|dofollow|highauthority|toptier|primedirectory|solodirectory)/i;
const CHEAP_SPAM_TLD = /\.(website|space|online|click|link|xyz|top|icu|pages\.dev|shopsettings\.com|weebly\.com|godaddysites\.com)$/i;

function isLinkFarm(domain) {
  if (!domain) return false;
  const d = String(domain).toLowerCase();
  const isDirectoryish = /(directory|directories|listings?)/i.test(d);
  if (isDirectoryish && SEO_SPAM_TOKENS.test(d)) return true;
  if (isDirectoryish && CHEAP_SPAM_TLD.test(d)) return true;
  if (/sitemap/i.test(d) && CHEAP_SPAM_TLD.test(d)) return true;
  return false;
}

/** Traffic above this means a general-web giant, not a comparable rival. */
const RIVAL_TRAFFIC_CEILING = 2_000_000;

function isNotNicheRival(domain) {
  if (!domain) return true;
  if (NOT_A_NICHE_RIVAL.has(domain)) return true;
  return [...NOT_A_NICHE_RIVAL].some((h) => domain.endsWith(`.${h}`));
}

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

function looksLikeListing(domain, _title, _tag) {
  if (isClaimableListing(domain)) return true;
  // Domain shape only. The SERP "directory" tag is a competitor filter
  // (Indeed, Glassdoor, Clutch) — not proof you can get a link there.
  return LISTING_DOMAIN_RE.test(String(domain || ""));
}

function isClaimableListing(domain) {
  if (!domain) return false;
  if (KNOWN_FREE_HOSTS.has(domain)) return true;
  return [...KNOWN_FREE_HOSTS].some((h) => domain.endsWith(`.${h}`));
}

function isPaidDirectory(domain) {
  if (!domain) return false;
  if (KNOWN_PAID_HOSTS.has(domain)) return true;
  return [...KNOWN_PAID_HOSTS].some((h) => domain.endsWith(`.${h}`));
}

/**
 * Magazines and blogs that rank for the keyword are pitch targets (guest post /
 * resource mention), not businesses whose backlinks we should harvest.
 */
function looksLikePublication(domain) {
  const d = String(domain || "").toLowerCase();
  if (!d) return false;
  if (
    /(smashingmagazine|css-tricks|webdesignerdepot|alistapart|nngroup|uxdesign|uxcollective|sitepoint|csswizardry)/i.test(
      d
    )
  ) {
    return true;
  }
  return /(magazine|journal|gazette|insider|weekly|depot)([.-]|$)/i.test(d);
}

/** Ranking sites you can actually approach — locators, paid lists, publications. */
function isRankingProspect(domain, title, tag) {
  return looksLikeListing(domain, title, tag) || isPaidDirectory(domain) || looksLikePublication(domain);
}

/** Platforms, publishers and aggregators — never a business whose backlinks we should harvest. */
function isNotABusinessRival(domain) {
  return (
    isUnpitchable(domain) ||
    isNotNicheRival(domain) ||
    isScraper(domain) ||
    isPaidDirectory(domain) ||
    looksLikePublication(domain)
  );
}

/** Meaningful words from the keyword, for topical-relevance scoring. */
const STOP_WORDS = new Set([
  "the", "and", "for", "with", "near", "best", "top", "in", "on", "of", "a", "an",
  "to", "my", "me", "your", "service", "services",
]);

/**
 * Words that describe a *listing* rather than a *subject*.
 *
 * Without this, a SERP full of map sites teaches the vocabulary that "map" is
 * part of the niche — and mapquest.com starts getting a NICHE badge for a smoke
 * shop search. The niche is what the businesses sell, not how they're indexed.
 */
const NON_NICHE_TOKENS = new Set([
  "maps", "map", "directory", "directories", "listing", "listings", "finder",
  "find", "locator", "local", "near", "guide", "guides", "list", "sites",
  "site", "website", "websites", "business", "businesses", "biz", "online",
  "world", "usa", "america", "city", "place", "places", "search", "web",
  // Commerce words that are substrings of countless off-niche brands. "market"
  // lives inside marketbeat, coinmarketcap, cmcmarkets, companiesmarketcap —
  // all stock-market sites — so a "digital marketing" search was pulling in
  // finance rivals. The specific niche word ("marketing") still qualifies; the
  // bare "market" fragment must not.
  "market", "markets", "marketplace", "group", "media", "global",
  "company", "companies", "digital",
]);

function keywordTokens(keyword) {
  return String(keyword || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t) && !NON_NICHE_TOKENS.has(t));
}

/**
 * The niche's real vocabulary, learned from the sites that rank.
 *
 * Keyword tokens alone are too narrow: searching "smokeshop" would never mark
 * weedmaps.com or localheadshopfinder.com as on-niche, because neither contains
 * "smoke". Domains that rank for the term share the vocabulary of the industry
 * — head, vape, weed, cannabis, kratom — so any token appearing in two or more
 * ranking domains is treated as part of the niche.
 */
function nicheVocabulary(keyword, ladder) {
  const vocab = new Set(keywordTokens(keyword));
  const counts = new Map();

  for (const row of ladder || []) {
    const host = String(row?.domain || "").toLowerCase().replace(/^www\./, "");
    // Learn only from the actual businesses. Yelp ranking twice was teaching
    // the vocabulary that "yelp" belongs to the smoke-shop niche, which then
    // handed yelpdirectory.com a NICHE badge. The niche is what the businesses
    // sell — never what indexes them.
    if (!host || isUnpitchable(host) || isNotNicheRival(host) || isScraper(host)) continue;
    if (looksLikeListing(host, row?.title, row?.tag)) continue;
    // Split the registrable part into word-ish chunks: "localheadshopfinder"
    // won't segment, but "smoke-shop-locator" and "vapeshopmaps" partly will.
    const stem = host.split(".")[0];

    // Domains are written without separators — "mansfieldsmokeshop" splits into
    // exactly one token, so separator-splitting learned almost nothing and the
    // vocabulary collapsed to the keyword itself. Count every substring
    // instead: the industry words are the ones that recur across domains, so
    // "smoke" and "shop" rise out of the noise while "mansfield" does not.
    const seenInThisDomain = new Set();
    for (let len = 4; len <= 9; len += 1) {
      for (let i = 0; i + len <= stem.length; i += 1) {
        const piece = stem.slice(i, i + len);
        if (STOP_WORDS.has(piece) || NON_NICHE_TOKENS.has(piece)) continue;
        seenInThisDomain.add(piece);
      }
    }
    for (const piece of seenInThisDomain) {
      counts.set(piece, (counts.get(piece) || 0) + 1);
    }
  }
  // Three separate domains sharing a fragment is a real industry word; two is
  // often coincidence once every substring is in play.
  for (const [token, n] of counts) {
    if (n >= 3) vocab.add(token);
  }
  return [...vocab];
}

/** Substring match, so "weedmaps" matches the token "weed". */
function matchesVocabulary(domain, vocab) {
  const d = String(domain || "").toLowerCase();
  return vocab.some((t) => d.includes(t));
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
    type: "publication",
    label: "Industry publication",
    weight: 96,
    hint: "A magazine or blog that ranks for this keyword. Pitch a guest piece or a resource mention — this is a real editor, not a directory form.",
    re: /$a^/,
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
    re: /\/(best[-_]|top[-_]\d|\d+[-_]best|\d+[-_]top|alternatives?|vs[-_]|comparison)/i,
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
  {
    type: "off-niche",
    label: "Directory, wrong niche",
    weight: 8,
    hint: "A real directory, but for a different subject — a wedding-vendor list or a dive-photo guide will not take a smoke shop. Kept out of the pitchable list on purpose.",
    re: /$a^/,
  },
  {
    type: "giant",
    label: "Giants",
    weight: 20,
    hint: "Household-name publishers and platforms — Forbes, Business Insider, Stripe, Bloomberg and the like. They link to businesses, but a link usually comes through PR, a customer story or paid placement rather than a quick pitch. Grouped here so you can see them without them crowding the pitch list.",
    re: /$a^/,
  },
  {
    type: "unreachable",
    label: "No way in",
    weight: 1,
    hint: "A platform, major publisher or academic site. It links to businesses, but there is no submission route and no editor waiting for your email.",
    re: /$a^/,
  },
  {
    type: "no-route",
    label: "No live route in",
    weight: 4,
    hint: "We fetched the site and found no submit, listing or contribute page. Kept out of Can pitch on purpose.",
    re: /$a^/,
  },
  {
    type: "link-farm",
    label: "Spam directory network",
    weight: 0,
    hint: "Part of a bought directory blast — dozens of near-identical sites named after SEO rather than a subject. Worthless at best, toxic at worst. Never pitch these.",
    re: /$a^/,
  },
];

const UNKNOWN_TYPE = {
  type: "other",
  label: "Unclassified",
  weight: 40,
  hint: "Couldn't tell from the URL — worth eyeballing.",
};

const ACTIONABLE_TYPES = new Set([
  "serp-listing",
  "guest-post",
  "publication",
  "directory",
  "resource",
  "roundup",
]);

/**
 * Can pitch has to be a site someone can actually act on this week.
 *
 * Ranking locators are viable by definition (you open them and submit).
 * Guest posts need the contribute URL we matched. Directories already survived
 * the off-niche gate. Resource pages and roundups are a pitch to a *page* —
 * without a captured URL there is nothing to send.
 */
function isViablePitch(row, kind) {
  if (!ACTIONABLE_TYPES.has(kind.type)) return false;
  const pages = (row.examples || []).length;
  const urls = (row.sourceUrls || []).length;
  const hasPage = pages > 0 || urls > 0;

  if (kind.type === "serp-listing") return true;
  if (kind.type === "publication") return true;
  if (kind.type === "guest-post") return hasPage || row.alsoRanks;
  if (kind.type === "directory") return true;
  if (kind.type === "resource" || kind.type === "roundup") return pages > 0;
  return false;
}

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
  return `lo-v18:${geo}:${device}:${depth.rankers}x${depth.refdomains}:${h}`;
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

  // Real businesses only. Ranking for the keyword does not make Wix, Figma,
  // Dribbble or a university a rival whose backlinks we should harvest — those
  // profiles are platform ecosystems, not this industry's link graph. Walk
  // past them so the quota fills with agencies and shops, not tools.
  const ladder = Array.isArray(serp?.fullLadder) ? serp.fullLadder : [];
  const targets = [];
  const seen = new Set();
  for (const row of ladder) {
    const host = cleanHost(row?.domain);
    if (!host || host === yourHost) continue;
    if (row?.tag === "directory") continue;
    if (isLowValue(host) || isNotABusinessRival(host)) continue;
    if (looksLikeListing(host, row?.title, row?.tag)) continue;
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
  // The niche's vocabulary, learned from the businesses that rank. Needed here
  // (not just at scoring time) because competitor expansion has to obey the
  // same rule as everything else: on-niche or out.
  const tokens = nicheVocabulary(serp?.keyword || keyword, ladder);

  // Seed only from actual businesses. Seeding off mapquest or waze asks "what
  // competes with a map site" and returns travel aggregators — which is how
  // agoda, rome2rio and travelweekly ended up being analysed as smoke shops.
  const seeds = targets.slice(0, 4).map((t) => t.domain);
  const competitorPool = new Map();

  await Promise.all(
    seeds.map(async (seed) => {
      try {
        const res = await fetchDomainCompetitors(seed, seed, { allowManual: true });
        for (const c of normalizeDomainCompetitors(res?.data)) {
          const host = cleanHost(c.domain);
          if (!host || host === yourHost || isLowValue(host) || seen.has(host)) continue;
          if (isNotABusinessRival(host)) continue;
          if ((c.traffic ?? 0) > RIVAL_TRAFFIC_CEILING) continue;
          // The same law the prospects obey: a competitor has to belong to the
          // niche. /domain/competitors ranks on overall keyword overlap, which
          // for a local business returns booking platforms and document hosts
          // — fresha, booksy, vagaro, prezi, studocu — whose backlinks have
          // nothing to do with this industry.
          //
          // The `|| looksLikeListing` escape that used to sit here was a bug:
          // it admitted ANY finder/guide/map-shaped domain regardless of
          // subject, which is how petfinder, getyourguide, guidestar,
          // wikimapia and masseurfinder were analysed as rivals of a smoke
          // shop. A directory is never a competitor anyway — directories reach
          // the report through the SERP-listing path, not through here.
          if (looksLikeListing(host, "", null)) continue;
          if (!matchesVocabulary(host, tokens)) continue;
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
  const analysedHosts = new Set(targets.map((t) => t.domain));

  // 2. Each competitor's link profile. Sequential-ish via Promise.all is fine —
  //    the SE Ranking client already queues and rate-limits requests.
  //    Head terms can yield zero comparable businesses; we still surface
  //    ranking directories and publications as prospects.
  const details = targets.length
    ? await Promise.all(
        targets.map((t) =>
          fetchCompetitorBacklinkDetail(t.domain, { refLimit: refdomains, linkLimit: 100 })
            .then((d) => ({ target: t, detail: d, error: d?.error || null }))
            .catch((err) => {
              logger?.warn?.(`Link opportunities: ${t.domain} failed — ${err.message}`);
              return { target: t, detail: null, error: err.message };
            })
        )
      )
    : [];

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
  const serpListings = new Map();
  for (const row of ladder) {
    const host = cleanHost(row?.domain);
    if (!host || host === yourHost || isLowValue(host)) continue;
    if (!isRankingProspect(host, row?.title, row?.tag)) continue;
    if (serpListings.has(host)) continue;
    // A site we analysed as a rival is a competitor, not a listing to submit to.
    // Paid directories and publications are never analysed as rivals, so they
    // still reach this list even if the overlap API named them.
    if (analysedHosts.has(host) && !isPaidDirectory(host) && !looksLikePublication(host)) continue;
    if (isUnpitchable(host) && !isPaidDirectory(host)) continue;
    // Apple Maps and friends rank, but "get listed" is not a link-building
    // task you can act on. Genuinely claimable ones (Yelp, MapQuest) still
    // qualify via the scraper/claimable path below.
    if (/^(maps\.apple\.com|google\.[a-z.]+|bing\.com|duckduckgo\.com)$/.test(host)) continue;
    if (isGlobalPlatform(host)) continue;
    const kind = isPaidDirectory(host)
      ? "directory"
      : looksLikePublication(host)
        ? "publication"
        : "serp-listing";
    serpListings.set(host, {
      domain: host,
      position: row?.position ?? null,
      title: row?.title || "",
      kind,
    });
  }

  // 3a. Intersect — one row per referring domain, across all competitors.
  const byLinker = new Map();
  let failed = 0;
  const failReasons = new Map();

  for (const { target, detail, error } of details) {
    if (error || !detail) {
      failed += 1;
      const reason = String(error || "no backlink data returned").slice(0, 160);
      failReasons.set(reason, (failReasons.get(reason) || 0) + 1);
      continue;
    }
    for (const ref of detail.refdomains || []) {
      const domain = cleanHost(ref?.domain);
      if (!domain || domain === yourHost || isLowValue(domain)) continue;
      // Analysed rivals are the subjects of this report, not prospects on it.
      if (analysedHosts.has(domain)) continue;

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

  const successfulAnalyses = details.filter(
    (d) =>
      d.detail &&
      !d.error &&
      ((d.detail.refdomains || []).length > 0 || (d.detail.links || []).length > 0)
  ).length;

  const intersect = [...byLinker.values()]
    .map((row) => {
      const hits = row.linksTo.length;
      const listing = serpListings.get(row.domain);

      // Order matters: a ranking listing site outranks any URL-pattern guess,
      // and a known scraper is never anything else.
      // What a domain *is* beats whichever of its URLs we happened to capture.
      // weedmaps.com was being filed as "Blog / editorial" because the single
      // captured link sat under /blog — while the domain plainly names a
      // directory. Domain shape now wins over URL pattern.
      const onNiche = matchesVocabulary(row.domain, tokens);
      const byType = (t) => PROSPECT_TYPES.find((x) => x.type === t);

      let kind;
      if (isLinkFarm(row.domain)) {
        kind = byType("link-farm");
      } else if (isGiant(row.domain)) {
        kind = byType("giant");
      } else if (isUnpitchable(row.domain)) {
        kind = byType("unreachable");
      } else if (isScraper(row.domain)) {
        kind = byType("scraper");
      } else if (listing) {
        kind = byType(listing.kind || "serp-listing") || byType("serp-listing");
      } else if (isPaidDirectory(row.domain)) {
        kind = byType("directory");
      } else if (looksLikePublication(row.domain)) {
        kind = byType("publication");
      } else if (LISTING_DOMAIN_RE.test(row.domain)) {
        kind = byType("directory");
      } else {
        kind = classifyProspect(row.sourceUrls);
      }

      /*
       * A directory is only an opportunity if it's a directory for YOUR niche.
       * A wedding-vendor list or a dive-photo guide will never take a smoke
       * shop, however perfectly it matches the shape of a directory.
       *
       * But the name is not the only evidence of what a directory is *for*.
       * weedmaps.com shares no letters with "smokeshop", so no amount of
       * lexical matching will ever connect them — yet a directory that links
       * to several of the shops ranking for this term is demonstrably a
       * directory for this industry. Behaviour is the stronger signal, so
       * linking to two or more analysed rivals qualifies on its own.
       */
      const provenByLinks = hits >= 2 || (hits >= 1 && successfulAnalyses < 3);
      // A host we already recognise as a claimable/paid listing (weedmaps,
      // yelp, a known paid directory) is a real, reachable prospect by
      // definition — never demote it to off-niche just because its name shares
      // no letters with the keyword or it only linked to one analysed rival.
      const knownListingHost = isClaimableListing(row.domain) || isPaidDirectory(row.domain);
      if (
        !listing &&
        !onNiche &&
        !provenByLinks &&
        !knownListingHost &&
        (kind.type === "directory" || kind.type === "serp-listing")
      ) {
        kind = byType("off-niche");
      }
      if (ACTIONABLE_TYPES.has(kind.type) && !isViablePitch({ ...row, onNiche }, kind)) {
        kind = UNKNOWN_TYPE;
      }
      // "How gettable" first, then proof of willingness (how many rivals it
      // already links to), then authority as the tiebreak. A site you can
      // pitch beats a stronger one you can't.
      // A domain that reads as being in the same niche beats a generic one of
      // the same type — "vapeshopmaps" over "boston.com" for a smoke shop.
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
        cost: "unknown",
        costNote: "",
      };
    })
    .sort(
      (a, b) =>
        b.prospectScore - a.prospectScore ||
        b.hits - a.hits ||
        (b.authority ?? -1) - (a.authority ?? -1)
    )
    .slice(0, 1000);

  // Live check (and LLM if a key is saved): drop parked spam, attach paid vs
  // unpaid and any grounded route. A missing form is not a rejection — most
  // directories hide submit behind JavaScript, and throwing those out is how
  // Maximum ended with a single Yelp row. Unprobed rows stay in Can pitch.
  const pitchable = intersect.filter((r) => ACTIONABLE_TYPES.has(r.type) && !r.youHaveIt);
  let llmProbed = false;
  let liveChecked = 0;
  try {
    // Check every pitchable prospect — LLM included — not just a slice. The
    // 300s route budget plus per-domain snapshot caching keeps this affordable,
    // and a 500 ceiling only guards against pathological runs.
    const probeLimit = Math.min(500, pitchable.length);
    const qualified = await qualifyPitchProspects(
      pitchable.map((r) => ({
        domain: r.domain,
        type: r.type,
        sourceUrls: r.sourceUrls,
        keyword: serp?.keyword || keyword,
      })),
      { concurrency: 8, limit: probeLimit, llmLimit: probeLimit }
    );
    llmProbed = Boolean(qualified.llmReady);
    const dead = PROSPECT_TYPES.find((x) => x.type === "link-farm");
    for (const row of intersect) {
      if (!ACTIONABLE_TYPES.has(row.type) || row.youHaveIt) continue;
      const surveyed = qualified.get(row.domain);
      if (!surveyed) continue;
      liveChecked += 1;
      row.cost = surveyed.cost || row.cost;
      row.costNote = surveyed.costNote || row.costNote;
      row.probeVerdict = surveyed.verdict || "";
      row.routeUrl = surveyed.routeUrl || "";
      if (surveyed.alive === false && dead) {
        row.type = dead.type;
        row.typeLabel = dead.label;
        row.typeHint = "Parked, for sale, or selling backlinks — not a pitchable site.";
        row.prospectScore = 0;
      }
    }
    intersect.sort(
      (a, b) =>
        b.prospectScore - a.prospectScore ||
        b.hits - a.hits ||
        (b.authority ?? -1) - (a.authority ?? -1)
    );
  } catch (err) {
    logger?.warn?.(`Link opportunities: live qualify failed — ${err.message}`);
  }

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
  // Directories reach this set only when they're for the right niche — the
  // classifier already demoted off-niche ones to their own type.
  const prospects = intersect.filter((r) => ACTIONABLE_TYPES.has(r.type) && !r.youHaveIt);
  const unpaid = prospects.filter((r) => r.cost !== "paid").length;
  const paid = prospects.filter((r) => r.cost === "paid").length;

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
      prospects: prospects.length,
      unpaid,
      paid,
      failed,
      llmProbed,
      liveChecked,
      fromSerp: targets.filter((t) => t.source === "serp").length,
      fromCompetitors: targets.filter((t) => t.source === "competitor").length,
    },
    notes: [
      failed
        ? (() => {
            const top = [...failReasons.entries()].sort((a, b) => b[1] - a[1])[0];
            const reason = top ? top[0] : "no backlink data returned";
            const allFailed = targets.length > 0 && failed >= targets.length;
            const is402 = /\(402\)|payment required|credit/i.test(reason);
            if (allFailed && is402) {
              return "The SE Ranking backlinks API rejected every request with 402 Payment Required — the account is out of Data API credits (or the plan no longer includes the backlinks/competitors endpoints). No backlink data means nothing to intersect, so only ranking listings show. Top up or renew the SE Ranking plan, then Refresh — this is a billing limit, not a bug in the tool.";
            }
            if (allFailed) {
              return `Every one of the ${failed} rivals returned no backlink data (${reason}). This is a data-source problem, not a filtering one — the backlinks endpoint gave nothing back, so there was nothing to intersect. Check the SE Ranking account, then Refresh.`;
            }
            return `${failed} competitor${failed > 1 ? "s" : ""} returned no link data (${reason}) — their rows are missing from the totals.`;
          })()
        : null,
      !targets.length
        ? "This keyword's results are mostly platforms, courses and tools, so there were no comparable businesses to read backlinks from. Ranking directories and publications are still listed as prospects."
        : null,
      liveChecked
        ? `Live-checked ${liveChecked} of ${pitchable.length} Can pitch sites (paid vs free, parked spam). Missing a submit form does not remove a site.`
        : null,
      llmProbed
        ? "The saved LLM annotated cost and routes from fetched page text only — it cannot invent URLs, and it cannot veto a site that already has a live route."
        : "LLM probe is off. Save an OpenRouter, OpenAI or Anthropic key in this module to judge routes from live page text.",
    ].filter(Boolean),
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
        // Integrity check: a cached payload must be for the keyword actually
        // asked for. The key is a hash, and a hash collision or a stale row
        // written by an older key scheme would otherwise serve one keyword's
        // analysis under another's name — which is indistinguishable from the
        // tool being broken. Cheap to verify, so never assume.
        const cachedKeyword = String(cached.payload.keyword || "").toLowerCase().trim();
        const wanted = String(keyword || "").toLowerCase().trim();
        if (cachedKeyword && wanted && cachedKeyword !== wanted) {
          logger?.warn?.(
            `Link opportunities: cache mismatch for "${wanted}" (stored "${cachedKeyword}") — rebuilding.`
          );
        } else {
          return { ...cached.payload, cached: true, fetchedAt: cached.fetchedAt };
        }
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
