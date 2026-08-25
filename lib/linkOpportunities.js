/**
 * Link Opportunities — "who links to the sites that rank for this keyword?"
 *
 * The question this answers is not "who has the strongest backlinks" (that just
 * returns unreachable mega-sites). It's **link intersect**: which referring
 * domains link to *several* of the top rankers at once. A site that already
 * linked to four of the top ten for this topic has demonstrated it will link to
 * a site like yours — that's an outreach list, not trivia.
 *
 * Data flow:
 *   1. Keyword SERP (cached) — ranking listings appear first.
 *   2. Each rival's backlinks land one at a time (streamed to the UI).
 *   3. Extra Google searches find directories, resource pages and write-for-us
 *      that rivals may not already have.
 *   4. Live page checks confirm paid vs free and drop mills / off-niche rows.
 *
 * Cost: the backlinks endpoint bills ~1 credit per referring domain and per
 * individual link returned, so depth is the credit dial. The default of 10
 * rankers x 200 refdomains + 100 links ≈ 3,000 credits on a cold keyword, and
 * close to nothing on the next keyword in the same niche.
 */

import crypto from "crypto";
import { getSerpAnalysis, fetchCompetitorBacklinkDetail } from "./serpAnalysis.js";
import { fetchGoogleSerp } from "./serpapi.js";
import { placeFromKeyword } from "./serpLocations.js";
import { getAuthorityScores } from "./authority.js";
import { fetchDomainCompetitors } from "./seranking/api.js";
import { originLocationFromHost, originMatchesCountry, originApiUrlFilter, parseOriginCountry } from "./linkOriginLocation.js";
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
  "tripod.com",
  "wpengine.com",
  "hs-sites.com",
  "kinsta.cloud",
  "ipaddress.com",
  "translate.goog",
  "cache.google.com",
  "cudasvc.com",
  "tfaforms.net",
  "typeform.com",
  "docs.google.com",
  "drive.google.com",
  "dropbox.com",
  "bit.ly",
  "tinyurl.com",
  "ow.ly",
  "formstack.com",
  "wufoo.com",
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
  "springboard.com", "institutedata.com", "thinkific.com", "teachable.com",
  "udacity.com", "simplilearn.com", "corporatefinanceinstitute.com",
  "cfainstitute.org", "accountingcoach.com", "visualcapitalist.com",
  "marketbeat.com", "cmcmarkets.com", "capital.com",
  "ibcscorp.com", "wscubetech.com", "digitalmarketingskill.com", "educba.com",
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
  "trustpilot.com",
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
  "sprinklr.com", "aha.io", "yellow.ai", "thinkific.com", "teachable.com",
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
  if (/\.(edu|gov|mil)(\.[a-z]{2})?$/.test(domain) || isJobBoard(domain)) return true;
  if (/\.(gc\.ca|gov\.uk|gov\.au|govt\.nz|gov\.ie)$/i.test(domain)) return true;
  return false;
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
  "digitalocean.com", "cloudflare.com", "github.com", "gitlab.com",
]);

function isGiant(domain) {
  if (!domain) return false;
  if (GIANT_HOSTS.has(domain)) return true;
  return [...GIANT_HOSTS].some((h) => domain.endsWith(`.${h}`));
}

function isJobBoard(domain) {
  if (!domain) return false;
  if (
    /^(?:[a-z0-9-]+\.)*(indeed|glassdoor|ziprecruiter|monster|careerbuilder|simplyhired|dice)\.[a-z.]{2,}$/i.test(
      domain
    )
  ) {
    return true;
  }
  // disneyCAREERS.com, jobs.example.com — a hiring portal, not a business to harvest.
  if (/(^|\.)jobs\./i.test(domain) || /careers\.[a-z.]{2,}$/i.test(domain) || /careers\.com$/i.test(domain)) {
    return true;
  }
  return false;
}

const COURSE_HUB_RE =
  /(bootcamp|udacity|simplilearn|coursera|udemy|skillshare|codecademy|pluralsight|khanacademy|teachable|thinkific|springboard|wscubetech|digitalmarketingskill|educba|exceedlms|guvi)/i;

function looksLikeCourseHub(domain, title = "") {
  if (!domain) return false;
  if (COURSE_HUB_RE.test(domain)) return true;
  return /\b(online bootcamp|career track|certification course|online course|degree program)\b/i.test(
    String(title || "")
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
const DIRECTORY_FILLER =
  /^(social|web|www|world|top|best|post|posts|class|steel|clicks|clicksor|media|zone|brand|article|articles|business|busniess|cool|one|all|mail|smart|superb|pegasus|medi|site|sites|search|abc|home|bed|free|news|hub|link|links|reviews|review|yellow|open|jasmine|jasmin|king|mapo|bestbusniess|webreviews|socialweb|mediazone|webzone|worldzone|worldwebsites|websiteworld|topworld|besttop|topdomain|toparticles|postlink|postfree|onecooldir|mediapost|mapolist|pegasusdir|classdir|yelp|power|click|buy|us|ai|cloud|stack|virtual)$/i;

function isGenericDirectoryName(domain, vocab = []) {
  const host = String(domain || "")
    .toLowerCase()
    .replace(/^www\./, "");
  if (!host) return false;
  if (!/directory|directories|listing/.test(host)) return false;
  if (vocab.length && matchesVocabulary(host, vocab)) return false;
  const labels = host.split(".").filter((p) => p && !["com", "net", "org", "biz", "co", "uk", "us", "info"].includes(p));
  for (const label of labels) {
    const stripped = label.replace(/directories|directory|listings|listing/g, "");
    if (!stripped) return true;
    if (DIRECTORY_FILLER.test(stripped)) return true;
    if (
      stripped.length <= 24 &&
      /(business|website|websites|hub|zone|cloud|power|click|buy|search|stack|virtual|media|yelp|super|superb)/i.test(
        stripped
      )
    ) {
      return true;
    }
  }
  const stem = labels[0] || "";
  const stripped = stem.replace(/directories|directory|listings|listing/g, "");
  return (
    stripped.length <= 14 &&
    /^(social|web|world|top|best|post|media|zone|brand|free|all|mail|smart|class|steel|clicks|news)/.test(stripped)
  );
}

function isLinkFarm(domain, vocab = []) {
  if (!domain) return false;
  const d = String(domain).toLowerCase();
  if (isClaimableListing(d) || isPaidDirectory(d)) return false;
  if (SEO_SPAM_TOKENS.test(d) && !looksLikePublication(d)) return true;
  if (/(courtcasefinder|recordsfinder|peoplefinder|beenverified|spokeo)/i.test(d)) return true;
  const isDirectoryish = /(directory|directories|listings?)/i.test(d);
  if (isDirectoryish && CHEAP_SPAM_TLD.test(d)) return true;
  if (/sitemap/i.test(d) && CHEAP_SPAM_TLD.test(d)) return true;
  if (isGenericDirectoryName(d, vocab)) return true;
  if (isDirectoryish && vocab.length && !matchesVocabulary(d, vocab)) return true;
  return false;
}

/** Generic directory blasts — including ones that hit many rivals on purpose. */
function directoryFarmHosts(byLinker, vocab = []) {
  const byRival = new Map();
  const out = new Set();
  for (const [domain, row] of byLinker) {
    if (isClaimableListing(domain) || isPaidDirectory(domain)) continue;
    if (isLinkFarm(domain, vocab)) {
      out.add(domain);
      continue;
    }
    const listingish = looksLikeListing(domain, "", null) || /directory/i.test(domain);
    if (!listingish) continue;
    if (isGenericDirectoryName(domain, vocab) && (row.linksTo || []).length >= 2) {
      out.add(domain);
      continue;
    }
    if ((row.linksTo || []).length !== 1) continue;
    const rival = row.linksTo[0];
    if (!byRival.has(rival)) byRival.set(rival, []);
    byRival.get(rival).push(domain);
  }
  for (const hosts of byRival.values()) {
    if (hosts.length >= 8) hosts.forEach((h) => out.add(h));
  }
  return out;
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

const GENERIC_CLAIMABLE = new Set([
  "yelp.com",
  "mapquest.com",
  "yellowpages.com",
  "superpages.com",
  "foursquare.com",
  "nextdoor.com",
  "bbb.org",
]);

function isGenericClaimable(domain) {
  if (!domain) return false;
  if (GENERIC_CLAIMABLE.has(domain)) return true;
  return [...GENERIC_CLAIMABLE].some((h) => domain.endsWith(`.${h}`));
}

function hasLocalIntent(keyword, serpLocation = "") {
  if (placeFromKeyword(keyword, serpLocation)) return true;
  return /\b(near me|dentist|plumber|hvac|salon|restaurant|gym|roofer|electrician|chiropractor|barber|spa|locksmith)\b/i.test(
    String(keyword || "")
  );
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
const KNOWN_PUBLISHERS = new Set([
  "contentmarketinginstitute.com",
  "marketingprofs.com",
  "emarketer.com",
  "influencermarketinghub.com",
  "marketingdive.com",
  "adweek.com",
  "searchengineland.com",
  "searchenginejournal.com",
  "socialmediatoday.com",
  "martech.org",
  "chiefmartec.com",
  "convinceandconvert.com",
  "copyblogger.com",
  "marketingland.com",
  "clickz.com",
  "productmarketingalliance.com",
  "marketermilk.com",
]);

const PRODUCT_HOSTS = new Set([
  "buffer.com",
  "ghost.org",
  "drip.com",
  "paddle.com",
  "mailmodo.com",
  "surveymonkey.com",
  "elegantthemes.com",
  "pixpa.com",
  "frase.io",
  "landbot.io",
  "gumloop.com",
  "recraft.ai",
  "latenode.com",
  "predis.ai",
  "highspot.com",
  "duda.co",
  "thinkific.com",
  "landbot.io",
  "codeless.io",
  "frase.io",
  "siit.co",
  "guvi.in",
  "salescaptain.io",
  "landerlab.io",
  "pixpa.com",
]);

function looksLikePublication(domain, title = "", keyTokens = []) {
  const d = String(domain || "").toLowerCase();
  if (!d) return false;
  if (KNOWN_PUBLISHERS.has(d) || [...KNOWN_PUBLISHERS].some((h) => d.endsWith(`.${h}`))) return true;
  if (
    /(smashingmagazine|css-tricks|webdesignerdepot|alistapart|nngroup|uxdesign|uxcollective|sitepoint|csswizardry)/i.test(
      d
    )
  ) {
    return true;
  }
  if (/(magazine|journal|gazette|insider|weekly|depot|profs)([.-]|$)/i.test(d)) return true;
  if (/(contentmarketing|searchengine|socialmedia)/i.test(d) && /(institute|hub|land|journal|today)/i.test(d)) {
    return true;
  }
  const t = String(title || "");
  if (
    keyTokens.length &&
    hayMatchesTokens(t, keyTokens) &&
    /\b(magazine|journal|newsletter|industry news|research report)\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

function looksLikeProductHost(domain, sourceUrls = []) {
  const d = String(domain || "").toLowerCase();
  if (!d) return false;
  if (PRODUCT_HOSTS.has(d) || [...PRODUCT_HOSTS].some((h) => d.endsWith(`.${h}`))) return true;
  const urls = (sourceUrls || []).join(" ");
  if (/\/(pricing|signup|sign-up|register|features|integrations)(\/|$|\?)/i.test(urls)) return true;
  return false;
}

function looksLikeProductProspect(domain, sourceUrls = []) {
  if (looksLikeProductHost(domain, sourceUrls)) return true;
  const d = String(domain || "").toLowerCase();
  const urls = (sourceUrls || []).join(" ");
  if (/\.(io|ai)$/i.test(d) && !/write-for-us|guest-post|contribute/i.test(urls)) return true;
  return false;
}

/** Ranking sites you can actually approach — locators, paid lists, publications. */
function isRankingProspect(domain, title, tag, keyTokens = []) {
  return (
    looksLikeListing(domain, title, tag) ||
    isPaidDirectory(domain) ||
    looksLikePublication(domain, title, keyTokens)
  );
}

/** Platforms, publishers and aggregators — never a business whose backlinks we should harvest. */
function isNotABusinessRival(domain, title = "", keyTokens = []) {
  return (
    isUnpitchable(domain) ||
    isNotNicheRival(domain) ||
    isScraper(domain) ||
    isPaidDirectory(domain) ||
    looksLikePublication(domain, title, keyTokens) ||
    looksLikeCourseHub(domain, title) ||
    looksLikeProductHost(domain)
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
 * "digit" is not an industry word — it is a shard of the blocked token "digital".
 * Learning those shards is how digitalocean.com got a NICHE badge for a
 * marketing search.
 */
function isBlockedFragment(piece) {
  if (!piece) return true;
  if (STOP_WORDS.has(piece) || NON_NICHE_TOKENS.has(piece)) return true;
  for (const blocked of NON_NICHE_TOKENS) {
    if (blocked.length >= 4 && (blocked.includes(piece) || piece.includes(blocked))) return true;
  }
  return false;
}

/** plumber → plumb, shops → shop. Never stem marketing → market (blocked). */
function tokenStems(token) {
  const t = String(token || "").toLowerCase();
  const out = [t];
  if (t.endsWith("ing") && t.length > 7) {
    const stem = t.slice(0, -3);
    if (stem.length >= 5 && !NON_NICHE_TOKENS.has(stem)) out.push(stem);
  }
  if (t.endsWith("ers") && t.length > 6) {
    const stem = t.slice(0, -3);
    if (stem.length >= 4 && !NON_NICHE_TOKENS.has(stem)) out.push(stem);
  } else if (t.endsWith("er") && t.length > 5) {
    const stem = t.slice(0, -2);
    if (stem.length >= 4 && !NON_NICHE_TOKENS.has(stem)) out.push(stem);
  }
  if (t.endsWith("s") && !t.endsWith("ss") && t.length > 4) {
    const stem = t.slice(0, -1);
    if (!NON_NICHE_TOKENS.has(stem)) out.push(stem);
  }
  return [...new Set(out)];
}

function hayMatchesTokens(hay, tokens) {
  const h = String(hay || "").toLowerCase();
  if (!h || !tokens?.length) return false;
  return tokens.some((t) => tokenStems(t).some((s) => h.includes(s)));
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
  const keyTokens = keywordTokens(keyword);
  const vocab = new Set(keyTokens);
  const counts = new Map();

  const learnable = [];
  for (const row of ladder || []) {
    const host = String(row?.domain || "")
      .toLowerCase()
      .replace(/^www\./, "");
    // Learn only from the actual businesses. Yelp ranking twice was teaching
    // the vocabulary that "yelp" belongs to the smoke-shop niche, which then
    // handed yelpdirectory.com a NICHE badge. The niche is what the businesses
    // sell — never what indexes them.
    if (!host || isUnpitchable(host) || isNotNicheRival(host) || isScraper(host)) continue;
    if (looksLikeListing(host, row?.title, row?.tag)) continue;
    if (looksLikeCourseHub(host, row?.title)) continue;
    if (looksLikePublication(host, row?.title, keyTokens)) continue;
    if (looksLikeProductHost(host)) continue;
    learnable.push({ host, title: row?.title || "" });
  }
  const touching = keyTokens.length
    ? learnable.filter((row) => hayMatchesTokens(`${row.host} ${row.title}`, keyTokens))
    : learnable;
  const source = touching.length >= 2 ? touching : learnable;

  for (const row of source) {
    const stem = row.host.split(".")[0];

    // Domains are written without separators — "mansfieldsmokeshop" splits into
    // exactly one token, so separator-splitting learned almost nothing and the
    // vocabulary collapsed to the keyword itself. Count every substring
    // instead: the industry words are the ones that recur across domains, so
    // "smoke" and "shop" rise out of the noise while "mansfield" does not.
    const seenInThisDomain = new Set();
    for (let len = 4; len <= 9; len += 1) {
      for (let i = 0; i + len <= stem.length; i += 1) {
        const piece = stem.slice(i, i + len);
        if (isBlockedFragment(piece)) continue;
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
  return hayMatchesTokens(String(domain || "").toLowerCase(), vocab);
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
    type: "product",
    label: "Product / SaaS",
    weight: 6,
    hint: "A software company with a blog or resource page. Not an editor you pitch for a link.",
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
  if ([...LOW_VALUE_LINKERS].some((bad) => domain.endsWith(`.${bad}`))) return true;
  if (/^libguides\./i.test(domain) || /\.libguides\./i.test(domain)) return true;
  if (/^marketplace\./i.test(domain)) return true;
  if (/^staging[-.]/i.test(domain)) return true;
  return false;
}

function cacheKey(keyword, geo, device, location, depth, originCountry = "") {
  const h = crypto
    .createHash("sha256")
    .update(
      `${String(keyword || "").toLowerCase().trim()}|${String(location || "").toLowerCase().trim()}|${String(originCountry || "").toLowerCase().trim()}`
    )
    .digest("hex")
    .slice(0, 24);
  // Bump the version whenever the aggregate's shape or scoring changes.
  return `lo-v25:${geo}:${device}:${depth.rankers}x${depth.refdomains}:${h}`;
}

const PERSIST_MS = 8000;

function compactProspect(row) {
  if (!row) return row;
  return {
    ...row,
    anchors: (row.anchors || []).slice(0, 5),
    linksTo: (row.linksTo || []).slice(0, 8),
    sourceUrls: (row.sourceUrls || []).slice(0, 6),
    examples: (row.examples || []).slice(0, 3),
  };
}

function sliceProspects(rows, limit) {
  const list = Array.isArray(rows) ? rows : [];
  const actionable = [];
  const rest = [];
  for (const row of list) {
    if (ACTIONABLE_TYPES.has(row?.type)) actionable.push(row);
    else rest.push(row);
  }
  return [...actionable, ...rest].slice(0, limit).map(compactProspect);
}

/** Keep live SSE events small enough that a Maximum hunt cannot OOM the process. */
function payloadForClient(payload, { running } = {}) {
  if (!payload) return payload;
  const cap = running ? 400 : 800;
  const strongCap = running ? 80 : 250;
  const intersect = sliceProspects(payload.intersect, cap);
  const strongest = (payload.strongest || []).slice(0, strongCap);
  const unique = payload.summary?.uniqueLinkers ?? (payload.intersect || []).length;
  const notes = Array.isArray(payload.notes) ? [...payload.notes] : [];
  if (unique > intersect.length) {
    const extra = `Showing the top ${intersect.length} of ${unique} linking sites so the hunt cannot take the server down.`;
    if (!notes.includes(extra)) notes.push(extra);
  }
  return { ...payload, intersect, strongest, notes };
}

/** DB checkpoints: tiny while running, capped when finished. */
function payloadForStore(payload, { running } = {}) {
  if (!payload) return payload;
  const cap = running ? 60 : 800;
  const strongCap = running ? 24 : 250;
  return {
    ...payload,
    intersect: sliceProspects(payload.intersect, cap),
    strongest: (payload.strongest || []).slice(0, strongCap),
  };
}

function byTypeId(id) {
  return PROSPECT_TYPES.find((x) => x.type === id) || UNKNOWN_TYPE;
}

function sortProspectRows(rows) {
  return rows.sort(
    (a, b) =>
      (b.prospectScore ?? 0) - (a.prospectScore ?? 0) ||
      (b.hits ?? 0) - (a.hits ?? 0) ||
      (b.authority ?? -1) - (a.authority ?? -1)
  );
}

function scoreProspect(row, kind) {
  const hits = row.hits || 0;
  const listingBonus =
    row.serpPosition != null ? Math.max(0, 30 - (row.serpPosition ?? 30)) : 0;
  const unpaidBoost = row.cost === "unpaid" ? 42 : 0;
  const discoverBoost = row.foundVia === "discover" && row.cost === "unpaid" ? 16 : 0;
  return Math.round(
    kind.weight +
      unpaidBoost +
      discoverBoost +
      Math.max(0, Math.min(hits - 1, 5)) * 6 +
      listingBonus +
      (row.onNiche ? 28 : 0) +
      (row.dofollow === true ? 8 : 0) +
      Math.min((row.authority ?? 0) / 10, 8) -
      (row.youHaveIt ? 60 : 0)
  );
}

function decorateLinker(row, ctx) {
  const {
    tokens,
    keyTokens,
    serpListings,
    farmHosts,
    successfulAnalyses,
    keyword,
    serpLocation,
  } = ctx;
  const local = hasLocalIntent(keyword, serpLocation);
  const hits = (row.linksTo || []).length;
  const listing = serpListings.get(row.domain);
  const onNiche = matchesVocabulary(row.domain, tokens);

  let kind;
  if (isLinkFarm(row.domain, tokens) || farmHosts.has(row.domain)) {
    kind = byTypeId("link-farm");
  } else if (isGiant(row.domain)) {
    kind = byTypeId("giant");
  } else if (isUnpitchable(row.domain)) {
    kind = byTypeId("unreachable");
  } else if (isScraper(row.domain)) {
    kind = byTypeId("scraper");
  } else if (row.forcedType && byTypeId(row.forcedType)) {
    kind = byTypeId(row.forcedType);
  } else if (listing) {
    kind = byTypeId(listing.kind || "serp-listing");
  } else if (isPaidDirectory(row.domain)) {
    kind = byTypeId("directory");
  } else if (looksLikePublication(row.domain, row.serpTitle || "", keyTokens)) {
    kind = byTypeId("publication");
  } else if (LISTING_DOMAIN_RE.test(row.domain)) {
    kind = byTypeId("directory");
  } else {
    kind = classifyProspect(row.sourceUrls);
  }

  if (
    (kind.type === "resource" || kind.type === "roundup") &&
    looksLikeProductProspect(row.domain, row.sourceUrls)
  ) {
    kind = byTypeId("product");
  }

  const genericDir = isGenericDirectoryName(row.domain, tokens);
  const provenByLinks = !genericDir && (hits >= 2 || (hits >= 1 && successfulAnalyses < 3));
  const knownListingHost =
    (isClaimableListing(row.domain) &&
      (onNiche || hits > 0 || local || listing)) ||
    isPaidDirectory(row.domain);
  const genericClaimableDropped =
    isGenericClaimable(row.domain) && !onNiche && hits === 0 && !local;
  const behavesLikeNicheDirectory =
    hits >= 1 && looksLikeListing(row.domain, "", null) && !genericDir;

  if (genericClaimableDropped && (kind.type === "directory" || kind.type === "serp-listing")) {
    kind = byTypeId("off-niche");
  } else if (
    !listing &&
    !onNiche &&
    !provenByLinks &&
    !knownListingHost &&
    !behavesLikeNicheDirectory &&
    (kind.type === "directory" || kind.type === "serp-listing" || kind.type === "publication")
  ) {
    kind = byTypeId("off-niche");
  }

  if (ACTIONABLE_TYPES.has(kind.type) && !isViablePitch({ ...row, onNiche }, kind)) {
    kind = UNKNOWN_TYPE;
  }

  const decorated = {
    ...row,
    hits,
    onNiche,
    pageCount: (row.examples || []).length,
    type: kind.type,
    typeLabel: kind.label,
    typeHint: kind.hint,
    prospectScore: scoreProspect({ ...row, hits, onNiche }, kind),
    cost: row.cost || "unknown",
    costNote: row.costNote || "",
    sourceLocation: originLocationFromHost(row.domain, row.sourceCountry),
  };
  return decorated;
}

function decorateAll(byLinker, ctx) {
  const farmHosts = directoryFarmHosts(byLinker, ctx.tokens);
  return sortProspectRows(
    [...byLinker.values()].map((row) => decorateLinker(row, { ...ctx, farmHosts }))
  ).slice(0, 1000);
}

function applyQualify(row, surveyed) {
  row.cost = surveyed.cost || row.cost;
  row.costNote = surveyed.costNote || row.costNote;
  row.probeVerdict = surveyed.verdict || "";
  row.routeUrl = surveyed.routeUrl || "";
  row.siteKind = surveyed.siteKind || "";
  row.probeStatus = "done";
  if (surveyed.alive === false) {
    const dead = byTypeId("link-farm");
    row.forcedType = dead.type;
    row.type = dead.type;
    row.typeLabel = dead.label;
    row.typeHint = "Parked, for sale, or selling backlinks — not a pitchable site.";
    row.prospectScore = 0;
    return;
  }
  if (surveyed.qualify === false) {
    if (surveyed.siteKind === "product") {
      const product = byTypeId("product");
      row.forcedType = product.type;
      row.type = product.type;
      row.typeLabel = product.label;
      row.typeHint = product.hint;
      row.prospectScore = product.weight;
    } else {
      const none = byTypeId("no-route");
      row.forcedType = none.type;
      row.type = none.type;
      row.typeLabel = none.label;
      row.typeHint = surveyed.costNote || none.hint;
      row.prospectScore = none.weight;
    }
    return;
  }
  row.prospectScore = scoreProspect(row, byTypeId(row.type) || UNKNOWN_TYPE);
}

function assemblePayload({
  keyword,
  serp,
  location,
  originWanted,
  device,
  geo,
  yourHost,
  rankers,
  refdomains,
  targets,
  intersect,
  strongest,
  byLinker,
  failed,
  failReasons,
  llmProbed,
  liveChecked,
  probeTotal,
  status,
  phase,
  phaseLabel,
  progress,
  urlFromFilter,
  notesExtra = [],
}) {
  const prospects = intersect.filter((r) => ACTIONABLE_TYPES.has(r.type) && !r.youHaveIt);
  const unpaid = prospects.filter((r) => r.cost === "unpaid").length;
  const paid = prospects.filter((r) => r.cost === "paid").length;
  const byType = PROSPECT_TYPES.concat(UNKNOWN_TYPE).map((t) => ({
    type: t.type,
    label: t.label,
    hint: t.hint,
    count: intersect.filter((r) => r.type === t.type).length,
  }));
  const strongestKept = originWanted
    ? strongest.filter((row) => originMatchesCountry(row.sourceDomain || row.sourceUrl, "", originWanted))
    : strongest;
  strongestKept.sort((a, b) => (b.authority ?? -1) - (a.authority ?? -1));

  const notes = [
    failed
      ? (() => {
          const top = [...(failReasons || new Map()).entries()].sort((a, b) => b[1] - a[1])[0];
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
      ? liveChecked < (probeTotal || liveChecked)
        ? `Live-checked ${liveChecked} of ${probeTotal} pitch candidates before time ran out. Unpaid is confirmed free only. Refresh to continue from cache.`
        : `Live-checked ${liveChecked} of ${probeTotal || liveChecked} pitch candidates (paid vs free, spam, relevance). Unpaid means a free route was confirmed. Unconfirmed stays out of Unpaid.`
      : null,
    llmProbed
      ? "The saved LLM may mark a site paid, off-niche, or a mill from fetched page text. It cannot invent URLs."
      : "LLM probe is off. Save an OpenRouter, OpenAI or Anthropic key in this module to judge routes from live page text.",
    serp?.serpProvider && serp.serpProvider !== "serpapi"
      ? `Search results came from ${serp.serpProviderLabel || serp.serpProvider}, not live Google. Positions will not match a Google tab. Discovery still works. Add SerpAPI searches or Google Programmable Search in Admin → Data sources.`
      : null,
    location || serp?.location
      ? "The location field picks the local Google SERP (who ranks). Linking-site origin is a separate control."
      : null,
    originWanted
      ? urlFromFilter
        ? `Link origin is ${originWanted.display} only. Referring-domain lists are still worldwide (the vendor has no country filter), then kept if the host is from ${originWanted.display}. Individual links were requested from ${urlFromFilter} hosts so local sites can surface instead of only global authority names.`
        : `Link origin is ${originWanted.display} only. Sites on generic TLDs (.com, .net) are kept only when the backlink data tagged them as ${originWanted.display}. The rest are dropped.`
      : null,
    ...notesExtra,
  ].filter(Boolean);

  return {
    keyword: serp?.keyword || keyword,
    location: serp?.location || location,
    originCountry: originWanted?.display || "",
    originCountryCode: originWanted?.code || "",
    locationSource: serp?.locationSource || "none",
    device,
    geo,
    yourHost,
    depth: { rankers, refdomains },
    targets,
    intersect,
    strongest: strongestKept.slice(0, 1000),
    byType,
    status: status || "running",
    phase: phase || "",
    phaseLabel: phaseLabel || "",
    progress: progress || null,
    summary: {
      analysed: Math.max(0, targets.length - (failed || 0)),
      uniqueLinkers: byLinker?.size ?? intersect.length,
      sharedLinkers: intersect.filter((r) => r.hits > 1).length,
      alreadyYours: intersect.filter((r) => r.youHaveIt).length,
      prospects: prospects.length,
      unpaid,
      paid,
      failed: failed || 0,
      llmProbed: Boolean(llmProbed),
      liveChecked: liveChecked || 0,
      fromSerp: targets.filter((t) => t.source === "serp").length,
      fromCompetitors: targets.filter((t) => t.source === "competitor").length,
      fromDiscover: intersect.filter((r) => r.foundVia === "discover").length,
    },
    notes,
  };
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

function ingestBacklinks(byLinker, strongest, target, detail, ctx) {
  const { yourHost, analysedHosts, yoursSet, rankingHosts, originWanted } = ctx;
  for (const ref of detail.refdomains || []) {
    const domain = cleanHost(ref?.domain);
    if (!domain || domain === yourHost || isLowValue(domain)) continue;
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
        sourceCountry: ref?.country || "",
        foundVia: "intersect",
      };
      byLinker.set(domain, row);
    }
    if (ref?.inlinkRank != null && (row.authority == null || ref.inlinkRank > row.authority)) {
      row.authority = ref.inlinkRank;
    }
    if (ref?.country && !row.sourceCountry) row.sourceCountry = ref.country;
    if (!row.linksTo.includes(target.domain)) row.linksTo.push(target.domain);
  }

  const authByDomain = new Map(
    (detail.refdomains || []).map((r) => [cleanHost(r.domain), r?.inlinkRank ?? null])
  );
  for (const link of detail.links || []) {
    const domain = cleanHost(link?.sourceUrl);
    if (!domain || domain === yourHost || isLowValue(domain)) continue;
    if (analysedHosts.has(domain)) continue;
    let row = byLinker.get(domain);
    if (!row) {
      if (!originWanted) continue;
      row = {
        domain,
        authority: null,
        linksTo: [],
        anchors: [],
        examples: [],
        sourceUrls: [],
        dofollow: null,
        youHaveIt: yoursSet.has(domain),
        alsoRanks: rankingHosts.has(domain),
        sourceCountry: "",
        foundVia: "intersect",
      };
      byLinker.set(domain, row);
    }
    const anchor = String(link?.anchor || "").trim();
    if (anchor && !row.anchors.includes(anchor) && row.anchors.length < 5) row.anchors.push(anchor);
    if (link?.sourceUrl && row.sourceUrls.length < 25) row.sourceUrls.push(link.sourceUrl);
    if (link?.dofollow === true) row.dofollow = true;
    else if (link?.dofollow === false && row.dofollow == null) row.dofollow = false;
    if (!row.linksTo.includes(target.domain)) row.linksTo.push(target.domain);
    if (link?.sourceUrl && row.examples.length < 15) {
      row.examples.push({
        sourceUrl: link.sourceUrl,
        targetDomain: target.domain,
        targetUrl: link?.targetUrl || "",
        anchor,
        dofollow: link?.dofollow ?? null,
      });
    }
    strongest.push({
      sourceDomain: domain,
      sourceUrl: link?.sourceUrl || "",
      targetDomain: target.domain,
      targetUrl: link?.targetUrl || "",
      anchor,
      authority: authByDomain.get(domain) ?? null,
      youHaveIt: yoursSet.has(domain),
      sourceLocation: originLocationFromHost(domain),
    });
  }
}

function discoveryKind(result, keyTokens, tokens) {
  const domain = cleanHost(result.domain);
  const url = result.link || "";
  const title = result.title || "";
  if (!domain) return null;
  if (isLowValue(domain) || isUnpitchable(domain) || isScraper(domain) || isGiant(domain)) return null;
  if (isLinkFarm(domain, tokens)) return null;
  if (isGenericClaimable(domain)) return null;
  let path = "";
  try {
    path = new URL(url).pathname || "";
  } catch {
    path = url;
  }
  const guest = PROSPECT_TYPES.find((t) => t.type === "guest-post");
  const resource = PROSPECT_TYPES.find((t) => t.type === "resource");
  if (guest.re.test(path)) return "guest-post";
  if (resource.re.test(path)) return "resource";
  if (looksLikePublication(domain, title, keyTokens)) return "publication";
  if (looksLikeListing(domain, title, null) && !isGenericDirectoryName(domain, tokens)) return "directory";
  return null;
}

async function loadDiscoverySerps(keyword, { location = "", geo = "us", device = "desktop" } = {}) {
  const q = String(keyword || "").trim();
  if (!q) return [];
  const place = placeFromKeyword(q, location);
  const city = place?.city || "";
  const niche = city ? q.replace(new RegExp(city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), "").replace(/\s+/g, " ").trim() : q;
  const queries = [];
  if (city) {
    queries.push(`${city} chamber of commerce`);
    queries.push(`${city} business directory`);
    queries.push(`${city} "write for us"`);
    queries.push(`${city} business journal`);
    if (niche) queries.push(`${niche} "write for us"`);
  } else {
    queries.push(`${q} directory`);
    queries.push(`${q} resources`);
    queries.push(`${q} "write for us"`);
  }
  const unique = [...new Set(queries.filter(Boolean))].slice(0, 5);
  const out = [];
  // Sequential on a cache miss: five parallel SerpAPI calls all fail together
  // when the account is out of searches, and they used to keep firing anyway.
  for (const query of unique) {
    const key = `ldv2:${crypto
      .createHash("sha256")
      .update(`${query}|${geo}|${location}|${device}`)
      .digest("hex")
      .slice(0, 20)}`;
    let organic = null;
    const cached = await getCachedSnapshot("__discover__", DATA_TYPES.LINK_DISCOVERY, key);
    if (cached?.payload?.organic && !cached.expired) organic = cached.payload.organic;
    if (!organic) {
      try {
        const serp = await fetchGoogleSerp(query, {
          location,
          gl: geo === "uk" ? "uk" : geo,
          device,
          num: 10,
        });
        organic = serp.organic || [];
        await saveSnapshot({
          siteUrl: "__discover__",
          dataType: DATA_TYPES.LINK_DISCOVERY,
          sourceKey: key,
          payload: { query, organic },
          creditsSpent: 0,
        });
      } catch (err) {
        logger?.warn?.(`Link discovery "${query}" failed — ${err.message}`);
        continue;
      }
    }
    for (const row of organic || []) out.push({ ...row, query });
  }
  return out;
}

/**
 * @param {string} siteUrl        your site — used to mark linkers you already have
 * @param {string} keyword
 * @param {object} [opts]         { location, originCountry, device, geo, rankers, refdomains }
 */
export async function buildLinkOpportunities(siteUrl, keyword, opts = {}, { onProgress } = {}) {
  const {
    location = "",
    originCountry = "",
    device = "desktop",
    geo = "us",
    rankers = 10,
    refdomains = 200,
  } = opts;

  const originWanted = String(originCountry || "").trim() ? parseOriginCountry(originCountry) : null;
  if (String(originCountry || "").trim() && !originWanted) {
    const err = new Error(
      "Could not match Link origin to a country. Try a name or code such as Pakistan, PK, or United Kingdom."
    );
    err.status = 400;
    throw err;
  }
  const urlFromFilter = originApiUrlFilter(originWanted);

  const yourHost = cleanHost(siteUrl);

  // 1. The ladder. Cached — this is normally free.
  const serp = await getSerpAnalysis(siteUrl, keyword, { location, device, geo });

  // Real businesses only. Ranking for the keyword does not make Wix, Figma,
  // Dribbble or a university a rival whose backlinks we should harvest — those
  // profiles are platform ecosystems, not this industry's link graph. Walk
  // past them so the quota fills with agencies and shops, not tools.
  const ladder = Array.isArray(serp?.fullLadder) ? serp.fullLadder : [];
  const keyTokens = keywordTokens(serp?.keyword || keyword);
  const candidates = [];
  const seenHosts = new Set();
  for (const row of ladder) {
    const host = cleanHost(row?.domain);
    if (!host || host === yourHost) continue;
    if (row?.tag === "directory") continue;
    if (isLowValue(host) || isNotABusinessRival(host, row?.title, keyTokens)) continue;
    if (looksLikeListing(host, row?.title, row?.tag)) continue;
    if (seenHosts.has(host)) continue;
    seenHosts.add(host);
    candidates.push({
      domain: host,
      position: row?.position ?? null,
      title: row?.title || "",
      touches: !keyTokens.length || hayMatchesTokens(`${host} ${row?.title || ""}`, keyTokens),
    });
  }
  // Head terms like "digital marketing" rank courses, SaaS and banks whose
  // titles mention the keyword. Prefer businesses whose domain or title
  // actually contains the distinctive words; fall back to everyone only when
  // local shops are named after people instead of the trade.
  const touching = candidates.filter((c) => c.touches);
  const harvest = keyTokens.length && touching.length >= 2 ? touching : candidates;
  const targets = harvest.slice(0, rankers).map(({ domain, position, title }) => ({
    domain,
    position,
    title,
  }));
  const seen = new Set(targets.map((t) => t.domain));

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
          if (isNotABusinessRival(host, "", keyTokens)) continue;
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
  const rankingHosts = new Set(ladder.map((r) => cleanHost(r?.domain)).filter(Boolean));

  const serpListings = new Map();
  for (const row of ladder) {
    const host = cleanHost(row?.domain);
    if (!host || host === yourHost || isLowValue(host)) continue;
    if (!isRankingProspect(host, row?.title, row?.tag, keyTokens)) continue;
    if (serpListings.has(host)) continue;
    if (analysedHosts.has(host) && !isPaidDirectory(host) && !looksLikePublication(host, row?.title, keyTokens)) continue;
    if (isUnpitchable(host) && !isPaidDirectory(host)) continue;
    if (/^(maps\.apple\.com|google\.[a-z.]+|bing\.com|duckduckgo\.com)$/.test(host)) continue;
    if (isGlobalPlatform(host)) continue;
    if (isGenericClaimable(host) && !hasLocalIntent(serp?.keyword || keyword, serp?.location || location) && !matchesVocabulary(host, tokens)) {
      continue;
    }
    const kind = isPaidDirectory(host)
      ? "directory"
      : looksLikePublication(host, row?.title, keyTokens)
        ? "publication"
        : "serp-listing";
    serpListings.set(host, {
      domain: host,
      position: row?.position ?? null,
      title: row?.title || "",
      kind,
    });
  }

  const byLinker = new Map();
  const strongest = [];
  let failed = 0;
  const failReasons = new Map();
  let successfulAnalyses = 0;
  let yoursSet = new Set();
  let llmProbed = false;
  let liveChecked = 0;
  let probeTotal = 0;

  const ctxBase = () => ({
    tokens,
    keyTokens,
    serpListings,
    successfulAnalyses,
    keyword: serp?.keyword || keyword,
    serpLocation: serp?.location || location,
  });

  const snapshot = (phase, phaseLabel, progress = null, extra = {}) =>
    assemblePayload({
      keyword,
      serp,
      location,
      originWanted,
      device,
      geo,
      yourHost,
      rankers,
      refdomains,
      targets,
      intersect: decorateAll(byLinker, ctxBase()),
      strongest,
      byLinker,
      failed,
      failReasons,
      llmProbed,
      liveChecked,
      probeTotal,
      status: extra.status || "running",
      phase,
      phaseLabel,
      progress,
      urlFromFilter,
      notesExtra: extra.notesExtra || [],
    });

  const emit = async (phase, phaseLabel, progress = null, extra = {}) => {
    if (!onProgress) return;
    try {
      await onProgress(snapshot(phase, phaseLabel, progress, extra));
    } catch {
      /* progress is best-effort */
    }
  };

  const ingestListingRows = async () => {
    const listingHosts = [...serpListings.keys()].filter((h) => !byLinker.has(h));
    let listingAuthority = new Map();
    if (listingHosts.length) {
      try {
        listingAuthority = await getAuthorityScores(listingHosts);
      } catch (err) {
        logger?.warn?.(`Link opportunities: authority lookup failed — ${err.message}`);
      }
    }
    for (const [host, listing] of serpListings) {
      if (byLinker.has(host)) {
        const row = byLinker.get(host);
        row.alsoRanks = true;
        row.serpPosition = listing.position;
        row.serpTitle = listing.title;
        if (!row.foundVia) row.foundVia = "serp";
        continue;
      }
      byLinker.set(host, {
        domain: host,
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
        foundVia: "serp",
      });
    }
  };

  await ingestListingRows();
  const place = placeFromKeyword(serp?.keyword || keyword, serp?.location || location);
  if (place && hasLocalIntent(serp?.keyword || keyword, serp?.location || location)) {
    for (const host of GENERIC_CLAIMABLE) {
      if (!host || host === yourHost || analysedHosts.has(host) || byLinker.has(host)) continue;
      byLinker.set(host, {
        domain: host,
        authority: null,
        linksTo: [],
        anchors: [],
        examples: [],
        sourceUrls: [],
        dofollow: null,
        youHaveIt: yoursSet.has(host),
        alsoRanks: rankingHosts.has(host),
        sourceCountry: "",
        foundVia: "discover",
        forcedType: rankingHosts.has(host) ? "serp-listing" : "directory",
      });
    }
  }
  await emit("serp", "Ranking listings and local claimable directories", { current: 0, total: targets.length || 1 });

  const yoursPromise = (async () => {
    if (!yourHost) return;
    try {
      const mine = await fetchCompetitorBacklinkDetail(yourHost, {
        refLimit: refdomains,
        linkLimit: 25,
      });
      yoursSet = new Set((mine?.refdomains || []).map((r) => cleanHost(r.domain)).filter(Boolean));
      for (const row of byLinker.values()) row.youHaveIt = yoursSet.has(row.domain);
    } catch {
      /* knowing your own profile is a bonus */
    }
  })();

  const discoveryPromise = loadDiscoverySerps(serp?.keyword || keyword, {
    location: serp?.location || location,
    geo,
    device,
  }).then(async (rows) => {
    let added = 0;
    for (const result of rows) {
      const host = cleanHost(result.domain);
      if (!host || host === yourHost || analysedHosts.has(host)) continue;
      if (originWanted && !originMatchesCountry(host, "", originWanted)) continue;
      const kind = discoveryKind(result, keyTokens, tokens);
      if (!kind) continue;
      if (byLinker.has(host)) {
        const existing = byLinker.get(host);
        if (result.link && !existing.sourceUrls.includes(result.link)) {
          existing.sourceUrls.unshift(result.link);
        }
        if (!existing.foundVia || existing.foundVia === "intersect") existing.foundVia = existing.foundVia || "discover";
        continue;
      }
      byLinker.set(host, {
        domain: host,
        authority: null,
        linksTo: [],
        anchors: [],
        examples: result.link
          ? [{ sourceUrl: result.link, targetDomain: "", targetUrl: "", anchor: result.title || "", dofollow: null }]
          : [],
        sourceUrls: result.link ? [result.link] : [],
        dofollow: null,
        youHaveIt: yoursSet.has(host),
        alsoRanks: rankingHosts.has(host),
        sourceCountry: "",
        foundVia: "discover",
        forcedType: kind,
        serpTitle: result.title || "",
      });
      added += 1;
    }
    if (added) {
      await emit("discover", `Found ${added} extra prospect${added === 1 ? "" : "s"} beyond rival linkers`);
    }
    return added;
  });

  const ingestCtx = () => ({
    yourHost,
    analysedHosts,
    yoursSet,
    rankingHosts,
    originWanted,
  });

  let rivalsDone = 0;
  await mapLimit(targets, 5, async (t) => {
    try {
      const d = await fetchCompetitorBacklinkDetail(t.domain, {
        refLimit: refdomains,
        linkLimit: 100,
        urlFromFilter,
      });
      if (d?.error || !d) {
        failed += 1;
        const reason = String(d?.error || "no backlink data returned").slice(0, 160);
        failReasons.set(reason, (failReasons.get(reason) || 0) + 1);
      } else {
        ingestBacklinks(byLinker, strongest, t, d, ingestCtx());
        if ((d.refdomains || []).length > 0 || (d.links || []).length > 0) successfulAnalyses += 1;
      }
    } catch (err) {
      failed += 1;
      const reason = String(err.message || "no backlink data returned").slice(0, 160);
      failReasons.set(reason, (failReasons.get(reason) || 0) + 1);
      logger?.warn?.(`Link opportunities: ${t.domain} failed — ${err.message}`);
    }
    rivalsDone += 1;
    await emit("rivals", `Read ${t.domain}`, { current: rivalsDone, total: targets.length });
  });

  await yoursPromise;
  for (const row of byLinker.values()) row.youHaveIt = yoursSet.has(row.domain);

  try {
    await discoveryPromise;
  } catch (err) {
    logger?.warn?.(`Link opportunities: discovery failed — ${err.message}`);
  }

  if (originWanted) {
    for (const [domain, row] of byLinker) {
      if (!originMatchesCountry(domain, row.sourceCountry, originWanted) && !serpListings.has(domain)) {
        byLinker.delete(domain);
      }
    }
    for (const host of [...serpListings.keys()]) {
      if (!originMatchesCountry(host, "", originWanted)) serpListings.delete(host);
    }
  }

  await ingestListingRows();

  let intersect = decorateAll(byLinker, ctxBase());
  await emit("probe", "Checking live submit routes on the best prospects", {
    current: 0,
    total: Math.min(80, intersect.filter((r) => ACTIONABLE_TYPES.has(r.type) && !r.youHaveIt).length || 1),
  });

  const pitchable = intersect
    .filter((r) => ACTIONABLE_TYPES.has(r.type) && !r.youHaveIt)
    .sort((a, b) => {
      const rank = (r) =>
        (GENERIC_CLAIMABLE.has(r.domain) || [...GENERIC_CLAIMABLE].some((h) => r.domain.endsWith(`.${h}`)) ? 50 : 0) +
        (r.foundVia === "discover" ? 18 : 0) +
        (r.type === "guest-post" ? 22 : 0) +
        (r.type === "serp-listing" ? 28 : 0) +
        (r.onNiche ? 20 : 0) +
        (r.prospectScore || 0);
      return rank(b) - rank(a);
    });
  probeTotal = Math.min(80, pitchable.length);

  try {
    for (const row of pitchable.slice(0, probeTotal)) {
      const raw = byLinker.get(row.domain);
      if (raw) raw.probeStatus = "queued";
    }
    await emit("probe", "Checking live submit routes on the best prospects", {
      current: 0,
      total: probeTotal || 1,
    });
    const qualified = await qualifyPitchProspects(
      pitchable.slice(0, probeTotal).map((r) => ({
        domain: r.domain,
        type: r.type,
        sourceUrls: r.sourceUrls,
        keyword: serp?.keyword || keyword,
      })),
      {
        concurrency: 10,
        limit: probeTotal,
        llmLimit: probeTotal,
        onResult: async (domain, surveyed) => {
          liveChecked += 1;
          const raw = byLinker.get(domain);
          if (raw) applyQualify(raw, surveyed);
          await emit("probe", `Checked ${domain}`, { current: liveChecked, total: probeTotal });
        },
      }
    );
    llmProbed = Boolean(qualified.llmReady);
    intersect = decorateAll(byLinker, ctxBase());
    for (const row of intersect) {
      const surveyed = qualified.get(row.domain);
      if (surveyed) applyQualify(row, surveyed);
    }
    sortProspectRows(intersect);
  } catch (err) {
    logger?.warn?.(`Link opportunities: live qualify failed — ${err.message}`);
  }

  return snapshot("done", "Search complete", { current: 1, total: 1 }, { status: "done" });
}

/** Cached entry point. Mirrors getSerpAnalysis: best-effort cache, force to bypass. */
export function linkOpportunitiesCacheKey(siteUrl, keyword, opts = {}) {
  const { geo = "us", device = "desktop", location = "", originCountry = "", rankers = 10, refdomains = 200 } = opts;
  const cacheSite = cleanHost(siteUrl) || "__no_site__";
  const originWanted = String(originCountry || "").trim() ? parseOriginCountry(originCountry) : null;
  const sourceKey = cacheKey(keyword, geo, device, location, { rankers, refdomains }, originWanted?.code || "");
  return { cacheSite, sourceKey };
}

export async function peekLinkOpportunities(siteUrl, keyword, opts = {}) {
  const { cacheSite, sourceKey } = linkOpportunitiesCacheKey(siteUrl, keyword, opts);
  try {
    const cached = await getCachedSnapshot(cacheSite, DATA_TYPES.LINK_OPPORTUNITIES, sourceKey);
    if (!cached?.payload) return null;
    const cachedKeyword = String(cached.payload.keyword || "").toLowerCase().trim();
    const wanted = String(keyword || "").toLowerCase().trim();
    if (cachedKeyword && wanted && cachedKeyword !== wanted) return null;
    return {
      ...payloadForClient(cached.payload, { running: cached.payload.status === "running" }),
      cached: cached.payload.status !== "running",
      expired: Boolean(cached.expired),
      fetchedAt: cached.fetchedAt,
    };
  } catch {
    return null;
  }
}

export async function getLinkOpportunities(siteUrl, keyword, opts = {}, { force = false, onProgress = null } = {}) {
  const { cacheSite, sourceKey } = linkOpportunitiesCacheKey(siteUrl, keyword, opts);

  if (!force) {
    try {
      const cached = await getCachedSnapshot(cacheSite, DATA_TYPES.LINK_OPPORTUNITIES, sourceKey);
      if (cached?.payload && !cached.expired) {
        const cachedKeyword = String(cached.payload.keyword || "").toLowerCase().trim();
        const wanted = String(keyword || "").toLowerCase().trim();
        if (cachedKeyword && wanted && cachedKeyword !== wanted) {
          logger?.warn?.(
            `Link opportunities: cache mismatch for "${wanted}" (stored "${cachedKeyword}") — rebuilding.`
          );
        } else if (cached.payload.status !== "running" && cached.payload.status !== "error") {
          return {
            ...payloadForClient(cached.payload, { running: false }),
            cached: true,
            fetchedAt: cached.fetchedAt,
            status: cached.payload.status || "done",
          };
        }
      }
    } catch {
      /* cache read is best-effort */
    }
  }

  let lastPersist = 0;
  let persistBusy = false;
  const persist = async (payload) => {
    const flush = payload?.status === "done" || payload?.status === "error";
    const due = flush || (!persistBusy && Date.now() - lastPersist >= PERSIST_MS);
    if (due) {
      persistBusy = true;
      lastPersist = Date.now();
      const write = saveSnapshot({
        siteUrl: cacheSite,
        dataType: DATA_TYPES.LINK_OPPORTUNITIES,
        sourceKey,
        payload: payloadForStore(payload, { running: !flush }),
        creditsSpent: 0,
      }).finally(() => {
        persistBusy = false;
      });
      if (flush) await write;
    }
    await onProgress?.(payloadForClient(payload, { running: !flush }));
  };

  const data = await buildLinkOpportunities(siteUrl, keyword, opts, { onProgress: persist });
  const done = { ...data, status: "done" };
  await saveSnapshot({
    siteUrl: cacheSite,
    dataType: DATA_TYPES.LINK_OPPORTUNITIES,
    sourceKey,
    payload: payloadForStore(done, { running: false }),
    creditsSpent: 0,
  });
  const client = payloadForClient(done, { running: false });
  await onProgress?.(client);
  return { ...client, cached: false, fetchedAt: new Date() };
}
