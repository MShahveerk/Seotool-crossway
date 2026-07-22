/**
 * Site Audit issue catalog: severity, plain-language explanation, and
 * step-by-step resolution for every check the crawler performs.
 * Plain data — safe to import in client components.
 */

export const AUDIT_SEVERITIES = {
  critical: { label: "Critical", weight: 5 },
  warning: { label: "Warning", weight: 2 },
  notice: { label: "Notice", weight: 0.5 },
};

export const AUDIT_RULES = {
  /* ------------------------------- critical ------------------------------- */
  "broken-internal-links": {
    severity: "critical",
    title: "Broken internal links (4xx)",
    description:
      "Pages on your site link to internal URLs that return a 4xx error. Visitors hit dead ends and crawlers waste crawl budget, which hurts rankings.",
    fixSteps: [
      "Open each broken URL below and confirm it really returns an error (not a temporary outage).",
      "If the page moved, add a 301 redirect from the old URL to the new location.",
      "If the page is gone for good, remove or update every internal link pointing to it (the linking pages are listed below).",
      "Re-run the audit to confirm the links are resolved.",
    ],
  },
  "server-errors": {
    severity: "critical",
    title: "Server errors (5xx)",
    description:
      "These URLs returned a server error during the crawl. Google will drop pages that repeatedly return 5xx from the index.",
    fixSteps: [
      "Check your server / hosting error logs for the exact failure on each URL.",
      "Common causes: PHP fatal errors, memory limits, broken plugins, database connection issues.",
      "Fix the underlying error, then request reindexing via the URL Inspection tool in this dashboard.",
    ],
  },
  "redirect-loops": {
    severity: "critical",
    title: "Redirect loops",
    description:
      "These URLs redirect in a circle and never resolve. Browsers show an error and search engines can't index them.",
    fixSteps: [
      "Trace the redirect chain for each URL (each hop is usually defined in your server config, CMS, or a redirect plugin).",
      "Remove the rule that sends the chain back to an earlier URL.",
      "Ensure each URL redirects at most once, directly to the final destination.",
    ],
  },
  "mixed-content": {
    severity: "critical",
    title: "Mixed content (HTTP resources on HTTPS pages)",
    description:
      "Secure pages load images/scripts/styles over insecure HTTP. Browsers block or warn about these resources, breaking the page and eroding trust.",
    fixSteps: [
      "Search the page source for `http://` in src and href attributes (the affected pages are listed below).",
      "Update each resource URL to `https://` — most assets are already available over HTTPS.",
      "In WordPress, run a search-replace on the database (e.g. Better Search Replace plugin) from `http://yourdomain` to `https://yourdomain`.",
      "Add a Content-Security-Policy `upgrade-insecure-requests` header as a safety net.",
    ],
  },
  "missing-title": {
    severity: "critical",
    title: "Missing page title",
    description:
      "These pages have no <title> tag. The title is the single most important on-page SEO element and your headline in search results.",
    fixSteps: [
      "Add a unique, descriptive <title> to each page (50–60 characters).",
      "Lead with the page's main keyword, end with your brand: \"Primary Keyword — Brand\".",
      "In WordPress, set titles via your SEO plugin (Yoast/Rank Math) per page.",
    ],
  },
  "non-200-in-sitemap": {
    severity: "critical",
    title: "Sitemap contains broken or redirected URLs",
    description:
      "Your XML sitemap lists URLs that return errors or redirects. This wastes crawl budget and signals a poorly maintained site to Google.",
    fixSteps: [
      "Remove deleted URLs from the sitemap, or restore the pages if removal was accidental.",
      "Replace redirected URLs with their final destination URL.",
      "If the sitemap is auto-generated (CMS/plugin), regenerate it and check the generator settings.",
      "Resubmit the sitemap in the Sitemap Health section of this dashboard.",
    ],
  },
  "crawler-blocked": {
    severity: "critical",
    title: "Crawler blocked by the server",
    description:
      "The audit could not fetch real pages — the server returned a firewall/challenge response or a noindex stub meant for bots. The health score is withheld because the crawl never reached your actual site.",
    fixSteps: [
      "Check Cloudflare, Wordfence, Sucuri, or your host's bot protection — allow requests with a normal browser user-agent from your server's IP.",
      "If you use a CDN \"bot fight mode\", add an allow rule for your SEO tool server or disable aggressive bot blocking for HTML pages.",
      "Confirm the homepage loads without a JavaScript challenge for a plain HTTP client.",
      "Re-run the audit after whitelisting — you should see dozens of pages crawled, not just 1.",
    ],
  },
  "crawl-incomplete": {
    severity: "warning",
    title: "Incomplete crawl coverage",
    description:
      "The audit finished quickly because it only reached a fraction of the site — often due to JavaScript-only navigation, a missing sitemap, or partial bot blocking. Issue counts and health score may not reflect the whole website.",
    fixSteps: [
      "Open \"Crawled pages inventory\" below — if it shows 1 page, the crawl did not explore the site.",
      "Ensure an XML sitemap exists at /sitemap.xml and lists your important URLs.",
      "If menus are JavaScript-only, add plain <a href> links in the HTML or rely on the sitemap (already used as a seed).",
      "Check server/CDN logs for 403 responses to the audit user-agent.",
      "Re-run after fixes; a healthy WordPress site usually shows 20–150+ pages crawled.",
    ],
  },

  /* -------------------------------- warning ------------------------------- */
  "duplicate-titles": {
    severity: "warning",
    title: "Duplicate page titles",
    description:
      "Multiple pages share the same title. Google struggles to decide which page to rank, and both pages can end up performing worse (keyword cannibalization).",
    fixSteps: [
      "Review each group of duplicates below and decide the primary page for that topic.",
      "Rewrite the other titles to target distinct topics/keywords.",
      "If pages are true duplicates, consolidate them with a 301 redirect or canonical tag.",
    ],
  },
  "missing-meta-description": {
    severity: "warning",
    title: "Missing meta description",
    description:
      "These pages have no meta description. Google will generate its own snippet, which usually lowers click-through rate from search results.",
    fixSteps: [
      "Write a unique description (~150 characters) for each page that includes the target keyword and a reason to click.",
      "Front-load the value proposition — the first ~120 characters always show.",
      "In WordPress, set it per page in your SEO plugin's snippet editor.",
    ],
  },
  "duplicate-meta-descriptions": {
    severity: "warning",
    title: "Duplicate meta descriptions",
    description:
      "Multiple pages share the same meta description, so search snippets don't differentiate your pages and CTR suffers.",
    fixSteps: [
      "Rewrite the description on each duplicate page to summarize that page specifically.",
      "Template-generated pages (archives, tags) can interpolate the page name into the template to stay unique.",
    ],
  },
  "missing-h1": {
    severity: "warning",
    title: "Missing H1 heading",
    description:
      "These pages have no <h1>. The H1 tells visitors and search engines the main topic of the page.",
    fixSteps: [
      "Add exactly one <h1> near the top of the content matching the page's target topic.",
      "Keep it distinct from (but related to) the <title> tag.",
      "Check the theme/template — some themes render titles as styled <div>s instead of <h1>.",
    ],
  },
  "images-missing-alt": {
    severity: "warning",
    title: "Images missing alt text",
    description:
      "Images without alt attributes are invisible to search engines and screen readers. Alt text helps you rank in Google Images and improves accessibility.",
    fixSteps: [
      "Add a short, descriptive alt attribute to every meaningful image (what's in the image, naturally worded).",
      "Decorative images can use an empty alt (alt=\"\") so screen readers skip them.",
      "In WordPress, alt text is set in the Media Library per image.",
    ],
  },
  "thin-content": {
    severity: "warning",
    title: "Thin content (very low word count)",
    description:
      "These pages have very little text. Thin pages rarely rank and can drag down sitewide quality signals.",
    fixSteps: [
      "Decide: expand, consolidate, or remove each thin page.",
      "Expand pages that target real search intent to properly cover the topic (typically 300+ words minimum).",
      "Merge overlapping thin pages into one strong page with 301 redirects.",
      "Noindex utility pages (login, cart, thank-you) that shouldn't rank anyway.",
    ],
  },
  "redirect-chains": {
    severity: "warning",
    title: "Redirect chains",
    description:
      "These URLs pass through 2+ redirects before resolving. Each hop slows users down and leaks link equity.",
    fixSteps: [
      "Update the first redirect to point directly at the final URL.",
      "Update internal links to point straight at the final URL so no redirect fires at all.",
      "Audit your redirect rules (server config or plugin) and flatten old chains after migrations.",
    ],
  },
  "broken-external-links": {
    severity: "warning",
    title: "Broken external links",
    description:
      "Pages link out to external URLs that no longer resolve. Dead outbound links frustrate users and signal stale content.",
    fixSteps: [
      "Replace each dead link with a working alternative source, or link to an archived copy (web.archive.org).",
      "If no alternative exists, remove the link and keep the text.",
    ],
  },
  "slow-pages": {
    severity: "warning",
    title: "Slow server response (>3s)",
    description:
      "These pages took over 3 seconds to respond during the crawl. Slow responses hurt Core Web Vitals, rankings, and conversions.",
    fixSteps: [
      "Enable full-page caching so repeat requests skip the application entirely.",
      "Check the PageSpeed Insights section of this dashboard for the specific bottlenecks on these URLs.",
      "Consider a CDN and review slow database queries or heavy plugins.",
    ],
  },
  "large-pages": {
    severity: "warning",
    title: "Very large pages (>2 MB HTML)",
    description:
      "The raw HTML of these pages exceeds 2 MB, which slows parsing and rendering — especially on mobile.",
    fixSteps: [
      "Check for inlined images (base64), huge inline CSS/JS, or embedded data blobs in the HTML.",
      "Move large inline assets to external cached files.",
      "Paginate or lazy-render very long listings.",
    ],
  },
  "noindex-pages": {
    severity: "warning",
    title: "Pages blocked with noindex",
    description:
      "These crawled pages carry a noindex directive. That's correct for utility pages — but if any should rank, they currently can't.",
    fixSteps: [
      "Review the list — confirm each noindex is intentional.",
      "For pages that should rank, remove the noindex meta tag / X-Robots-Tag header (often a stray SEO-plugin setting).",
      "After removing, request indexing via the URL Inspection tool.",
    ],
  },
  "missing-viewport": {
    severity: "warning",
    title: "Missing viewport meta tag",
    description:
      "Without a viewport tag, phones render the page zoomed-out like a desktop. Google's mobile-first indexing penalizes this heavily.",
    fixSteps: [
      'Add <meta name="viewport" content="width=device-width, initial-scale=1"> inside <head> of the affected templates.',
    ],
  },

  /* -------------------------------- notice -------------------------------- */
  "title-length": {
    severity: "notice",
    title: "Title too short or too long",
    description:
      "Titles under 30 characters waste ranking potential; titles over 60 get cut off in search results.",
    fixSteps: [
      "Rewrite flagged titles to 50–60 characters.",
      "Include the primary keyword early and make it compelling to click.",
    ],
  },
  "meta-description-length": {
    severity: "notice",
    title: "Meta description too short or too long",
    description:
      "Descriptions under 70 characters underuse the snippet space; over 160 characters get truncated.",
    fixSteps: ["Rewrite flagged descriptions to roughly 120–158 characters with a clear value proposition."],
  },
  "multiple-h1": {
    severity: "notice",
    title: "Multiple H1 headings",
    description:
      "More than one <h1> dilutes the topical focus of a page. Not a ranking killer, but a clarity issue.",
    fixSteps: [
      "Keep the main topic as the single <h1>; demote the others to <h2>/<h3>.",
      "Check the theme — logos and section headers are sometimes wrapped in <h1> by mistake.",
    ],
  },
  "missing-canonical": {
    severity: "notice",
    title: "Missing canonical tag",
    description:
      "Without a canonical tag, URL variants (with parameters, trailing slashes, etc.) can be treated as duplicate pages.",
    fixSteps: [
      'Add <link rel="canonical" href="…full URL…"> to each page, pointing at itself (or at the primary version for variants).',
      "Most CMS SEO plugins add self-referencing canonicals automatically — check the plugin settings.",
    ],
  },
  "missing-lang": {
    severity: "notice",
    title: "Missing language attribute",
    description:
      "The <html> tag has no lang attribute. Search engines and screen readers use it to identify the page language.",
    fixSteps: ['Add lang to the <html> tag in your base template, e.g. <html lang="en">.'],
  },
  "missing-structured-data": {
    severity: "notice",
    title: "No structured data (schema.org)",
    description:
      "These pages have no JSON-LD structured data. Schema markup unlocks rich results (stars, FAQs, breadcrumbs) and better click-through.",
    fixSteps: [
      "Add Organization + WebSite schema to the homepage, Article schema to posts, Product schema to product pages.",
      "SEO plugins (Yoast/Rank Math) generate most of this automatically — enable their schema features.",
      "Validate with Google's Rich Results Test after adding.",
    ],
  },
  "missing-og-tags": {
    severity: "notice",
    title: "Missing Open Graph tags",
    description:
      "Without og:title/og:image, shares of these pages on social platforms and messengers show bare, unattractive previews.",
    fixSteps: [
      "Add og:title, og:description and og:image meta tags to each template.",
      "Use a 1200×630 image for og:image.",
      "SEO plugins handle this per page under their \"Social\" tab.",
    ],
  },
  "deep-pages": {
    severity: "notice",
    title: "Pages buried too deep (5+ clicks from home)",
    description:
      "These pages take 5 or more clicks to reach from the homepage. Deep pages get crawled less often and receive less link equity.",
    fixSteps: [
      "Link to important deep pages from category hubs, the footer, or related-content widgets.",
      "Flatten the site structure — aim for every important page within 3 clicks of home.",
    ],
  },
  "orphan-pages": {
    severity: "notice",
    title: "Orphan pages (in sitemap, no internal links)",
    description:
      "These URLs are in your sitemap but no crawled page links to them. Orphans rarely rank because they receive no internal link equity.",
    fixSteps: [
      "Add contextual internal links to each orphan from related pages.",
      "If a page is obsolete, remove it from the sitemap and let it 410/redirect.",
    ],
  },
};

export function getRule(ruleId) {
  return AUDIT_RULES[ruleId] || null;
}
