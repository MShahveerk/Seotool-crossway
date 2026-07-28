/**
 * SE Ranking Site Audit — issue descriptions, impact, and fix steps per issue code.
 * Codes match https://seranking.com/api/data/reference/#site-audit-issue-codes
 */

function guide(code, { category, severity, title, description, impact, fixSteps }) {
  return { code, category, severity, title, description, impact, fixSteps };
}

/** @type {Record<string, ReturnType<typeof guide>>} */
export const AUDIT_ISSUE_GUIDES = {
  // ── Security ──
  no_https: guide("no_https", {
    category: "Security",
    severity: "error",
    title: "No HTTPS encryption",
    description: "Pages are served over plain HTTP instead of HTTPS. Browsers mark these as “Not secure” and search engines prefer encrypted sites.",
    impact: "Users see security warnings, credentials can be intercepted, and rankings may suffer vs HTTPS competitors.",
    fixSteps: [
      "Install a valid TLS certificate on your web server (Let’s Encrypt is free).",
      "Force HTTPS with a 301 redirect from HTTP → HTTPS at the server or CDN level.",
      "Update internal links, canonical tags, sitemap URLs, and hreflang to use https://.",
      "Verify mixed-content and certificate errors are cleared, then re-run the audit.",
    ],
  }),
  mixed_content: guide("mixed_content", {
    category: "Security",
    severity: "error",
    title: "Mixed content",
    description: "An HTTPS page loads resources (images, scripts, stylesheets, iframes) over insecure HTTP URLs.",
    impact: "Browsers may block resources, break layout/functionality, and reduce trust signals.",
    fixSteps: [
      "Open affected URLs and inspect the browser console for “Mixed Content” warnings.",
      "Change every http:// asset reference to https:// or host assets on your own domain/CDN.",
      "Use protocol-relative or root-relative paths where possible (e.g. /assets/logo.png).",
      "Enable “Upgrade Insecure Requests” header or a CDN “Automatic HTTPS Rewrites” rule as a safety net.",
    ],
  }),
  old_protocol: guide("old_protocol", {
    category: "Security",
    severity: "error",
    title: "Outdated security protocol version",
    description: "The server negotiates an obsolete TLS version (TLS 1.0/1.1) that modern clients reject.",
    impact: "Handshake failures for some users and a negative security assessment from crawlers.",
    fixSteps: [
      "Disable TLS 1.0 and TLS 1.1 in your web server or load balancer config.",
      "Enable TLS 1.2 and TLS 1.3 only; test with SSL Labs (ssllabs.com/ssltest).",
      "Renew/reconfigure certificates if your host cannot support modern protocols.",
    ],
  }),
  cert_name: guide("cert_name", {
    category: "Security",
    severity: "error",
    title: "Certificate name mismatch",
    description: "The SSL certificate Common Name / SAN does not match the hostname users visit (e.g. cert for www but site on apex).",
    impact: "Browser certificate errors block access entirely for affected hostnames.",
    fixSteps: [
      "Issue a certificate covering all live hostnames (apex + www, or wildcard).",
      "Pick one canonical hostname and 301-redirect all variants to it.",
      "Update DNS and internal links to match the canonical host.",
    ],
  }),
  outdated_encryption: guide("outdated_encryption", {
    category: "Security",
    severity: "error",
    title: "Outdated encryption algorithm",
    description: "The certificate or cipher suite uses weak encryption flagged by security scanners.",
    impact: "Compliance failures and potential blocking by modern browsers.",
    fixSteps: [
      "Reissue the certificate with a current key algorithm (RSA 2048+ or ECDSA).",
      "Disable weak ciphers on the server; follow Mozilla SSL Configuration Generator recommendations.",
      "Retest after changes with SSL Labs.",
    ],
  }),
  sitemap_http: guide("sitemap_http", {
    category: "Security",
    severity: "warning",
    title: "HTTP URLs in XML sitemap",
    description: "Your XML sitemap lists http:// URLs while the site should be served over HTTPS.",
    impact: "Search engines may crawl HTTP variants and dilute canonical signals.",
    fixSteps: [
      "Regenerate the sitemap with https:// URLs only.",
      "Resubmit the sitemap in Google Search Console.",
      "Ensure sitemap plugin or CMS setting uses the HTTPS site URL.",
    ],
  }),
  canonical_to_http: guide("canonical_to_http", {
    category: "Security",
    severity: "warning",
    title: 'rel="canonical" from HTTPS to HTTP',
    description: "An HTTPS page points its canonical tag to an HTTP URL.",
    impact: "Confuses indexation — Google may prefer the insecure URL or split signals.",
    fixSteps: [
      "Edit canonical tags on affected pages to use https:// targets.",
      "If HTTP is intentional (rare), migrate fully to HTTPS instead.",
      "Bulk-fix via CMS SEO plugin or template update.",
    ],
  }),
  cert_exp: guide("cert_exp", {
    category: "Security",
    severity: "warning",
    title: "Security certificate expires soon",
    description: "The TLS certificate will expire within the warning window.",
    impact: "Site becomes unreachable with full browser errors when the cert expires.",
    fixSteps: [
      "Renew the certificate before expiry (auto-renew with Let’s Encrypt / your CA).",
      "Set calendar or monitoring alerts 30 days before expiration.",
      "Verify renewal deployed to all load-balanced nodes.",
    ],
  }),

  // ── Crawling & Indexing ──
  http4xx: guide("http4xx", {
    category: "Crawling & Indexing",
    severity: "error",
    title: "4XX HTTP Status Codes",
    description: "Pages return client errors (404, 403, 410, etc.) but are still linked or discoverable.",
    impact: "Wasted crawl budget, broken user journeys, and lost link equity.",
    fixSteps: [
      "Export affected URLs and classify: delete, redirect, or restore content.",
      "Add 301 redirects for moved pages; return 410 for permanently removed content.",
      "Fix internal links pointing to 404s; update navigation and sitemap entries.",
      "For legitimate 403/401 pages, block in robots.txt if they should not be crawled.",
    ],
  }),
  http5xx: guide("http5xx", {
    category: "Crawling & Indexing",
    severity: "error",
    title: "5XX HTTP Status Codes",
    description: "Server errors (500, 502, 503) when the crawler requested pages.",
    impact: "Google may drop pages from the index if errors persist; users cannot access content.",
    fixSteps: [
      "Check server/application logs at the timestamps of failed requests.",
      "Fix PHP/database timeouts, memory limits, or plugin conflicts causing crashes.",
      "Ensure hosting can handle crawl rate; add caching for dynamic pages.",
      "Return 503 with Retry-After only for planned maintenance, not chronic failures.",
    ],
  }),
  timeout: guide("timeout", {
    category: "Crawling & Indexing",
    severity: "error",
    title: "Timed out",
    description: "The crawler could not load the page within the allowed time.",
    impact: "Page may not be indexed; signals a severe performance or availability problem.",
    fixSteps: [
      "Measure TTFB and total load time; optimize slow database queries and PHP execution.",
      "Enable page caching (CDN, object cache, full-page cache).",
      "Check for redirect loops or blocked bots at firewall/WAF level.",
      "Upgrade hosting if CPU/RAM is saturated during crawls.",
    ],
  }),
  canonical4xx: guide("canonical4xx", {
    category: "Crawling & Indexing",
    severity: "error",
    title: "Canonical URL with a 4XX Status Code",
    description: "A page’s rel=canonical points to a URL that returns 404/403/etc.",
    impact: "Search engines may ignore canonical hints and index wrong duplicates.",
    fixSteps: [
      "Update canonical tags to point to live 200 URLs.",
      "If the canonical target was deleted, pick the best replacement URL.",
      "Remove self-referencing canonicals on error pages.",
    ],
  }),
  canonical5xx: guide("canonical5xx", {
    category: "Crawling & Indexing",
    severity: "error",
    title: "Canonical URL with a 5XX Status Code",
    description: "Canonical target returns a server error.",
    impact: "Indexation signals are lost while the canonical destination is unavailable.",
    fixSteps: [
      "Fix server errors on canonical destination URLs first.",
      "Temporarily point canonicals to stable alternate URLs until fixed.",
    ],
  }),
  canonical3xx: guide("canonical3xx", {
    category: "Crawling & Indexing",
    severity: "error",
    title: "Canonical URL with a 3XX Status Code",
    description: "The canonical URL redirects instead of returning 200 OK directly.",
    impact: "Extra hop dilutes canonical signal; may cause duplicate indexing.",
    fixSteps: [
      "Set canonical to the final 200 URL after redirects, not the redirecting URL.",
      "Prefer direct canonical targets — avoid chaining canonical → redirect → page.",
    ],
  }),
  canonical_chain: guide("canonical_chain", {
    category: "Crawling & Indexing",
    severity: "error",
    title: "Canonical chain",
    description: "Multiple pages form a circular or chained canonical reference (A→B→C or A→B→A).",
    impact: "Search engines may ignore all canonicals and pick their own URL.",
    fixSteps: [
      "Map duplicate/near-duplicate pages and designate one indexable master URL per cluster.",
      "Point every variant’s canonical directly to that master (one hop only).",
      "Use 301 redirects for true duplicates instead of canonicals alone.",
    ],
  }),
  robots_has_too_many_redirects: guide("robots_has_too_many_redirects", {
    category: "Crawling & Indexing",
    severity: "error",
    title: "Robots.txt redirect loop",
    description: "robots.txt URL redirects too many times or loops.",
    impact: "Crawlers may fail to read crawl rules; unpredictable indexing behavior.",
    fixSteps: [
      "Ensure https://yoursite.com/robots.txt returns 200 with no redirects.",
      "Fix www/non-www and HTTP/HTTPS redirects at the edge before robots is fetched.",
      "Serve robots.txt from the canonical host only.",
    ],
  }),
  robots_not_accessible: guide("robots_not_accessible", {
    category: "Crawling & Indexing",
    severity: "error",
    title: "Robots.txt is not accessible",
    description: "The crawler could not fetch robots.txt (connection error, wrong host, etc.).",
    impact: "Google assumes full crawl allowed but may hit blocked resources unpredictably.",
    fixSteps: [
      "Verify robots.txt is reachable at the site root on the canonical domain.",
      "Check firewall, CDN, and bot-protection rules are not blocking Googlebot.",
      "Ensure DNS and SSL cover the hostname serving robots.txt.",
    ],
  }),
  robots_has_errors: guide("robots_has_errors", {
    category: "Crawling & Indexing",
    severity: "error",
    title: "Robots.txt is not valid",
    description: "robots.txt contains syntax errors or invalid directives.",
    impact: "Crawlers may misinterpret rules and crawl/block wrong paths.",
    fixSteps: [
      "Validate robots.txt in Google Search Console → robots.txt report.",
      "Fix typos in User-agent, Disallow, Allow directives.",
      "Remove non-standard syntax unless intentionally supported.",
    ],
  }),
  blocked_by_noindex: guide("blocked_by_noindex", {
    category: "Crawling & Indexing",
    severity: "notice",
    title: "Blocked by noindex",
    description: "Page has a meta robots noindex directive.",
    impact: "Page will not appear in search results — intentional for some pages, harmful if accidental.",
    fixSteps: [
      "Confirm whether the page should be indexed; remove noindex from valuable content.",
      "Check SEO plugin settings, staging flags, and paginated/archive templates.",
      "Remove noindex from pages receiving internal links and sitemap inclusion.",
    ],
  }),
  both_noindex: guide("both_noindex", {
    category: "Crawling & Indexing",
    severity: "notice",
    title: "HTML and HTTP header contain noindex",
    description: "Both the HTML meta tag and X-Robots-Tag HTTP header set noindex.",
    impact: "Strong deindex signal — page will not rank.",
    fixSteps: [
      "Remove redundant noindex from either HTML or HTTP header (keep one intentional source).",
      "Audit CDN or server configs adding X-Robots-Tag globally.",
    ],
  }),
  blocked_by_xrobots: guide("blocked_by_xrobots", {
    category: "Crawling & Indexing",
    severity: "notice",
    title: "Blocked by X-Robots-Tag",
    description: "HTTP X-Robots-Tag header blocks indexing (noindex/nofollow).",
    impact: "Overrides HTML robots tags; page excluded from index.",
    fixSteps: [
      "Inspect response headers (curl -I URL) for X-Robots-Tag.",
      "Remove noindex from server/CDN config unless deliberate (e.g. PDF downloads).",
    ],
  }),
  blocked_by_nofollow: guide("blocked_by_nofollow", {
    category: "Crawling & Indexing",
    severity: "notice",
    title: "Blocked by nofollow",
    description: "Page meta robots includes nofollow — links on page may not pass equity.",
    impact: "Internal PageRank flow is reduced from this page.",
    fixSteps: [
      "Remove nofollow from meta robots on standard content pages.",
      "Use nofollow only on untrusted user-generated links, not whole templates.",
    ],
  }),
  both_nofollow: guide("both_nofollow", {
    category: "Crawling & Indexing",
    severity: "notice",
    title: "HTML and HTTP header contain nofollow",
    description: "Both HTML and X-Robots-Tag set nofollow.",
    impact: "All outbound links treated as untrusted for crawling.",
    fixSteps: [
      "Remove duplicate nofollow directives from server headers or HTML.",
    ],
  }),
  blocked_by_robots: guide("blocked_by_robots", {
    category: "Crawling & Indexing",
    severity: "notice",
    title: "Blocked by robots.txt",
    description: "robots.txt Disallow prevents crawling this URL.",
    impact: "Page may not be indexed if never crawled (though URLs can still appear from links).",
    fixSteps: [
      "If the page should rank, remove the Disallow rule or add an Allow exception.",
      "Keep blocking admin, cart, and faceted URLs intentionally.",
    ],
  }),
  no_robots: guide("no_robots", {
    category: "Crawling & Indexing",
    severity: "notice",
    title: "Robots.txt file not found",
    description: "No robots.txt at the site root (404).",
    impact: "Full crawl allowed by default — usually OK, but you lose crawl-budget control.",
    fixSteps: [
      "Create a robots.txt at the root with Sitemap directive and Disallow for private paths.",
      "Point to your XML sitemap: Sitemap: https://example.com/sitemap.xml",
    ],
  }),
  robots_disallow_crawling: guide("robots_disallow_crawling", {
    category: "Crawling & Indexing",
    severity: "notice",
    title: "Robots.txt disallows all crawling",
    description: "robots.txt blocks all user-agents from the entire site (Disallow: /).",
    impact: "Site will not be crawled or indexed properly.",
    fixSteps: [
      "Remove Disallow: / unless the site is intentionally private/staging.",
      "Replace with specific Disallow paths for admin, search, and duplicate filters.",
    ],
  }),
  long_url: guide("long_url", {
    category: "Crawling & Indexing",
    severity: "notice",
    title: "URL too long",
    description: "URL exceeds recommended length, often due to deep paths or many parameters.",
    impact: "Harder to share, may be truncated in SERPs, slight crawl inefficiency.",
    fixSteps: [
      "Shorten slugs; remove unnecessary query parameters.",
      "Use URL rewriting instead of long tracking params where possible.",
      "Flatten category depth in CMS permalink structure.",
    ],
  }),

  // ── Redirects ──
  redirect45xx: guide("redirect45xx", {
    category: "Redirects",
    severity: "error",
    title: "Redirect to 4xx or 5xx",
    description: "A redirect chain ends on an error page instead of valid content.",
    impact: "Users and bots hit dead ends; link equity is lost.",
    fixSteps: [
      "Update redirect rules to point directly to final 200 URLs.",
      "Remove redirects targeting deleted pages; replace with relevant alternatives.",
    ],
  }),
  redirect_loop: guide("redirect_loop", {
    category: "Redirects",
    severity: "error",
    title: "Redirect loop",
    description: "URLs redirect in a circle (A→B→A) so the browser never reaches content.",
    impact: "Page unreachable — zero indexing and broken UX.",
    fixSteps: [
      "Trace redirects with curl -IL or a redirect checker.",
      "Remove conflicting rules in .htaccess, nginx config, CMS, and CDN.",
      "Consolidate to one canonical host (www vs non-www, HTTP vs HTTPS).",
    ],
  }),
  redirect_chain: guide("redirect_chain", {
    category: "Redirects",
    severity: "error",
    title: "Redirect chain",
    description: "Multiple consecutive redirects before the final page (A→B→C→D).",
    impact: "Slows crawlers, wastes budget, dilutes PageRank.",
    fixSteps: [
      "Replace chains with a single 301 from origin directly to final URL.",
      "Audit plugin redirect tables and server configs for duplicate rules.",
    ],
  }),
  meta_refresh: guide("meta_refresh", {
    category: "Redirects",
    severity: "error",
    title: "Meta refresh redirect",
    description: "Page uses HTML meta refresh instead of HTTP 301/302 redirect.",
    impact: "Not treated as reliably as server redirects; slower for users.",
    fixSteps: [
      "Replace meta refresh with server-side 301 redirects.",
      "Remove meta refresh tags from templates and legacy landing pages.",
    ],
  }),
  redirect3xx: guide("redirect3xx", {
    category: "Redirects",
    severity: "warning",
    title: "3XX HTTP status code",
    description: "URL responds with a redirect status (301, 302, 307, etc.).",
    impact: "Fine for intentional moves; problematic on URLs that should serve content directly.",
    fixSteps: [
      "If the URL should be indexable, serve 200 instead of redirecting.",
      "Use 301 for permanent moves; update internal links to the final URL.",
    ],
  }),
  redirect_temporary: guide("redirect_temporary", {
    category: "Redirects",
    severity: "warning",
    title: "302/303/307 temporary redirects",
    description: "Temporary redirect used where a permanent 301 is appropriate.",
    impact: "Search engines may keep indexing the old URL.",
    fixSteps: [
      "Change permanent moves to 301 (or 308) redirects.",
      "Reserve 302/307 for truly temporary campaigns or A/B tests.",
    ],
  }),

  // ── Sitemap ──
  sitemap_4xx: guide("sitemap_4xx", {
    category: "Sitemap",
    severity: "error",
    title: "4XX pages in XML sitemap",
    description: "Sitemap lists URLs that return 404 or other client errors.",
    impact: "Wastes crawl budget and signals poor site maintenance to search engines.",
    fixSteps: [
      "Remove dead URLs from the sitemap generator source.",
      "Fix or redirect broken URLs, then regenerate and resubmit sitemap.",
    ],
  }),
  sitemap5xx: guide("sitemap5xx", {
    category: "Sitemap",
    severity: "error",
    title: "5XX pages in XML sitemap",
    description: "Sitemap includes URLs that error on the server.",
    impact: "Crawl failures on URLs you explicitly asked Google to index.",
    fixSteps: [
      "Fix server errors on listed URLs before they remain in the sitemap.",
      "Exclude unstable/dynamic URLs until reliably available.",
    ],
  }),
  sitemap_pages_timed_out: guide("sitemap_pages_timed_out", {
    category: "Sitemap",
    severity: "error",
    title: "Sitemap pages timed out",
    description: "URLs in the sitemap did not load in time during verification.",
    impact: "Google may deprioritize or drop slow URLs from the index.",
    fixSteps: [
      "Improve performance on timed-out URLs or remove them from sitemap until fixed.",
      "Check server capacity during bulk crawls.",
    ],
  }),
  sitemap_noindex: guide("sitemap_noindex", {
    category: "Sitemap",
    severity: "error",
    title: "Noindex pages in XML sitemap",
    description: "Sitemap lists URLs marked noindex — contradictory signals.",
    impact: "Confuses crawlers; wastes sitemap quota on non-indexable pages.",
    fixSteps: [
      "Remove noindex pages from sitemap OR remove noindex if they should rank.",
      "Exclude tags, search results, and thank-you pages from sitemap generation.",
    ],
  }),
  sitemap_non_canonical: guide("sitemap_non_canonical", {
    category: "Sitemap",
    severity: "error",
    title: "Non-canonical pages in XML sitemap",
    description: "Sitemap includes URLs that are not the canonical version of the content.",
    impact: "Google may index duplicates instead of your preferred URLs.",
    fixSteps: [
      "Include only canonical URLs in sitemap (one URL per piece of content).",
      "Fix canonical tags on duplicates to point to the sitemap URL.",
    ],
  }),
  sitemap_big: guide("sitemap_big", {
    category: "Sitemap",
    severity: "error",
    title: "XML sitemap is too large",
    description: "Sitemap exceeds size limits (50,000 URLs or 50MB uncompressed).",
    impact: "Search engines may reject or truncate the sitemap.",
    fixSteps: [
      "Split into multiple sitemap files with a sitemap index.",
      "Exclude low-value URLs (thin archives, paginated duplicates).",
    ],
  }),
  sitemap_3xx: guide("sitemap_3xx", {
    category: "Sitemap",
    severity: "warning",
    title: "3XX redirects in XML sitemap",
    description: "Sitemap lists URLs that redirect instead of serving content.",
    impact: "Extra crawl hops; weaker indexation signals.",
    fixSteps: [
      "Replace redirecting URLs in sitemap with their final 200 destinations.",
      "Update CMS sitemap plugin to output canonical URLs only.",
    ],
  }),
  sitemap_missing: guide("sitemap_missing", {
    category: "Sitemap",
    severity: "warning",
    title: "XML sitemap missing",
    description: "No XML sitemap found at the expected location.",
    impact: "New and deep pages may be discovered slower.",
    fixSteps: [
      "Generate an XML sitemap (Yoast, Rank Math, Screaming Frog export, or custom script).",
      "Submit sitemap URL in Google Search Console.",
      "Reference it in robots.txt: Sitemap: https://example.com/sitemap.xml",
    ],
  }),
  sitemap_no_robots: guide("sitemap_no_robots", {
    category: "Sitemap",
    severity: "notice",
    title: "XML sitemap not in robots.txt",
    description: "Sitemap exists but is not declared in robots.txt.",
    impact: "Minor discovery delay — GSC submission still works.",
    fixSteps: [
      "Add Sitemap: https://example.com/sitemap.xml line to robots.txt.",
    ],
  }),

  // ── Meta Tags ──
  title_missing: guide("title_missing", {
    category: "Meta Tags",
    severity: "error",
    title: "Title tag missing",
    description: "Page has no <title> element in the HTML head.",
    impact: "Google generates a poor SERP title; CTR and relevance suffer.",
    fixSteps: [
      "Add a unique, descriptive <title> (50–60 characters) to each template.",
      "Fill titles in CMS SEO fields for all published pages.",
      "Verify theme header.php / layout includes wp_title or SEO plugin output.",
    ],
  }),
  title_multiple: guide("title_multiple", {
    category: "Meta Tags",
    severity: "error",
    title: "Multiple title tags",
    description: "More than one <title> element found in the document.",
    impact: "Search engines may pick the wrong title or ignore extras.",
    fixSteps: [
      "Ensure only one title tag — remove duplicates from plugins/widgets.",
      "Check for injected titles from SEO plugin + theme both outputting titles.",
    ],
  }),
  title_duplicate: guide("title_duplicate", {
    category: "Meta Tags",
    severity: "error",
    title: "Duplicate page titles",
    description: "Multiple URLs share the exact same title tag.",
    impact: "Keyword cannibalization and lower CTR in SERPs.",
    fixSteps: [
      "Audit titles with a crawl export; make each page title unique.",
      "Append brand, category, or page-specific modifiers (e.g. “Pricing | Product X”).",
      "Use canonical + unique titles on paginated series.",
    ],
  }),
  description_missing: guide("description_missing", {
    category: "Meta Tags",
    severity: "warning",
    title: "Meta description missing",
    description: "No meta description tag on the page.",
    impact: "Google auto-generates snippets — often less compelling than a crafted description.",
    fixSteps: [
      "Write unique meta descriptions (~150–160 chars) summarizing each page’s value.",
      "Populate via SEO plugin bulk editor for large sites.",
    ],
  }),
  description_multiple: guide("description_multiple", {
    category: "Meta Tags",
    severity: "warning",
    title: "Multiple description tags",
    description: "More than one meta name=description found.",
    impact: "Unpredictable snippet selection in search results.",
    fixSteps: [
      "Remove duplicate meta description output from theme and plugins.",
      "Keep a single SEO plugin responsible for meta tags.",
    ],
  }),
  title_long: guide("title_long", {
    category: "Meta Tags",
    severity: "notice",
    title: "Title too long",
    description: "Title exceeds ~60 characters and may truncate in SERPs.",
    impact: "Reduced CTR when key terms are cut off.",
    fixSteps: [
      "Front-load important keywords; trim filler words.",
      "Keep titles under ~60 characters where possible.",
    ],
  }),
  title_short: guide("title_short", {
    category: "Meta Tags",
    severity: "notice",
    title: "Title too short",
    description: "Title is very short and may under-describe the page.",
    impact: "Missed keyword opportunities and lower relevance signals.",
    fixSteps: [
      "Expand titles to describe topic + value proposition clearly.",
      "Avoid generic titles like “Home” or “Untitled”.",
    ],
  }),
  description_duplicate: guide("description_duplicate", {
    category: "Meta Tags",
    severity: "notice",
    title: "Duplicate meta description",
    description: "Same meta description on multiple URLs.",
    impact: "Less differentiated snippets; possible duplicate content perception.",
    fixSteps: [
      "Write page-specific descriptions for each URL cluster.",
      "Use dynamic templates with unique variables (product name, category).",
    ],
  }),
  description_long: guide("description_long", {
    category: "Meta Tags",
    severity: "notice",
    title: "Meta description too long",
    description: "Description exceeds ~160 characters and will truncate.",
    impact: "Key CTA text may be hidden in SERPs.",
    fixSteps: [
      "Shorten to ~150–160 characters with the main message first.",
    ],
  }),

  // ── Content ──
  duplicate_content: guide("duplicate_content", {
    category: "Content",
    severity: "error",
    title: "Duplicate content",
    description: "Substantially similar or identical content exists on multiple URLs.",
    impact: "Rankings split across duplicates; crawlers waste budget.",
    fixSteps: [
      "Consolidate with 301 redirects to the best URL, or use rel=canonical.",
      "Fix URL parameters (sort, filter, print) with canonical or noindex.",
      "Merge thin duplicate posts; use 301 for HTTP/HTTPS and www variants.",
    ],
  }),
  canonical_multiple: guide("canonical_multiple", {
    category: "Content",
    severity: "error",
    title: 'Multiple rel="canonical" tags',
    description: "Page declares more than one canonical URL.",
    impact: "Search engines may ignore all canonical hints.",
    fixSteps: [
      "Leave exactly one self-referencing or pointing canonical per page.",
      "Remove extras from plugins, AMP versions, and mobile templates.",
    ],
  }),
  no_trailing_slashes: guide("no_trailing_slashes", {
    category: "Content",
    severity: "error",
    title: "Inconsistent trailing slashes",
    description: "Site mixes URLs with and without trailing slashes as separate URLs.",
    impact: "Duplicate content and split link equity.",
    fixSteps: [
      "Pick one convention (with or without slash) sitewide.",
      "301-redirect the non-preferred variant; update internal links and canonicals.",
    ],
  }),
  double_slash_url: guide("double_slash_url", {
    category: "Content",
    severity: "error",
    title: "URLs with double slash",
    description: "Malformed URLs contain // in the path (e.g. /blog//post).",
    impact: "May create duplicate or unreachable URLs.",
    fixSteps: [
      "Fix link generation in CMS/templates causing double slashes.",
      "Add redirect rules to normalize // → / in paths.",
    ],
  }),
  images3xx: guide("images3xx", {
    category: "Content",
    severity: "error",
    title: "3XX images",
    description: "Image URLs return redirects instead of serving the file directly.",
    impact: "Slower LCP, broken images if redirect fails, wasted crawl.",
    fixSteps: [
      "Update <img src> to point to final image URLs.",
      "Fix CDN or media library URLs to serve 200 responses.",
    ],
  }),
  images4xx: guide("images4xx", {
    category: "Content",
    severity: "error",
    title: "4XX images (Not Found)",
    description: "Broken image URLs return 404 or similar errors.",
    impact: "Poor UX, broken layout, negative quality signals.",
    fixSteps: [
      "Replace or re-upload missing images; fix broken src attributes.",
      "Set up redirects for moved media library paths.",
    ],
  }),
  images5xx: guide("images5xx", {
    category: "Content",
    severity: "error",
    title: "5XX images (Loading Failed)",
    description: "Image server returns errors when loading assets.",
    impact: "Visual content missing; may indicate CDN/origin issues.",
    fixSteps: [
      "Check media server logs and storage permissions.",
      "Verify CDN origin configuration and hotlink protection rules.",
    ],
  }),
  no_www_redirect: guide("no_www_redirect", {
    category: "Content",
    severity: "warning",
    title: "No WWW redirect",
    description: "Both www and non-www versions respond without redirecting to one canonical host.",
    impact: "Duplicate site versions split rankings and backlinks.",
    fixSteps: [
      "301-redirect either www → apex or apex → www consistently.",
      "Set preferred domain in Search Console to match.",
      "Update internal links, canonicals, and sitemap to one host.",
    ],
  }),
  h1_missing: guide("h1_missing", {
    category: "Content",
    severity: "warning",
    title: "H1 tag missing",
    description: "Page has no H1 heading element.",
    impact: "Weaker topical relevance signal and accessibility issue.",
    fixSteps: [
      "Add one clear H1 describing the main topic of the page.",
      "Ensure theme outputs H1 on all content templates (not only logo text).",
    ],
  }),
  h1_empty: guide("h1_empty", {
    category: "Content",
    severity: "warning",
    title: "H1 tag empty",
    description: "H1 element exists but contains no text.",
    impact: "Missed heading signal; poor screen-reader experience.",
    fixSteps: [
      "Populate the H1 with the page’s primary headline.",
      "Remove decorative empty H1 wrappers from templates.",
    ],
  }),
  image_no_alt: guide("image_no_alt", {
    category: "Content",
    severity: "warning",
    title: "Alt text missing",
    description: "Images lack alt attributes.",
    impact: "Accessibility failure; lost image search opportunity.",
    fixSteps: [
      "Add descriptive alt text to content images (decorative images: alt=\"\").",
      "Bulk-update media library alt fields in CMS.",
    ],
  }),
  image_big: guide("image_big", {
    category: "Content",
    severity: "warning",
    title: "Image too big",
    description: "Image file size exceeds recommended limits for web delivery.",
    impact: "Slow LCP and mobile performance; higher bounce rates.",
    fixSteps: [
      "Compress images (WebP/AVIF); resize to displayed dimensions.",
      "Use responsive srcset and lazy-loading below the fold.",
      "Offload to a CDN with automatic image optimization.",
    ],
  }),
  h1_multiple: guide("h1_multiple", {
    category: "Content",
    severity: "notice",
    title: "Multiple H1 tags",
    description: "More than one H1 on the page.",
    impact: "Diluted heading hierarchy; minor SEO/accessibility concern.",
    fixSteps: [
      "Use a single H1 for the main headline; demote others to H2/H3.",
      "Fix page builders that wrap sections in extra H1 tags.",
    ],
  }),
  h1_duplicate: guide("h1_duplicate", {
    category: "Content",
    severity: "notice",
    title: "Duplicate H1",
    description: "Same H1 text appears on multiple pages.",
    impact: "Less unique page identity for crawlers.",
    fixSteps: [
      "Customize H1 per page to reflect unique content focus.",
    ],
  }),
  same_title_h1: guide("same_title_h1", {
    category: "Content",
    severity: "notice",
    title: "Identical Title and H1 tags",
    description: "Title tag and H1 contain the exact same text.",
    impact: "Minor missed opportunity to target related keyword variants.",
    fixSteps: [
      "Vary H1 (user-facing headline) vs title (SERP-optimized) slightly.",
      "Keep both aligned topically but not character-identical.",
    ],
  }),
  h1_long: guide("h1_long", {
    category: "Content",
    severity: "notice",
    title: "H1 tag too long",
    description: "H1 exceeds reasonable length for a primary headline.",
    impact: "Readability issue; may indicate keyword stuffing.",
    fixSteps: [
      "Shorten H1 to a concise main headline; move detail to subheadings.",
    ],
  }),

  // ── Localization ──
  hreflang_invalid: guide("hreflang_invalid", {
    category: "Localization",
    severity: "error",
    title: "Invalid hreflang language code",
    description: "hreflang uses non-ISO or malformed language/region codes.",
    impact: "Google ignores hreflang cluster — wrong locale pages may rank.",
    fixSteps: [
      "Use ISO 639-1 language + optional ISO 3166-1 region (e.g. en-us, de-de).",
      "Validate with hreflang testing tools or Search Console international report.",
    ],
  }),
  hreflang_duplicates: guide("hreflang_duplicates", {
    category: "Localization",
    severity: "error",
    title: "Duplicate hreflang values",
    description: "Same hreflang attribute repeated for one page.",
    impact: "Conflicting signals; hreflang may be ignored.",
    fixSteps: [
      "Ensure each language code appears once per page’s hreflang set.",
      "Remove duplicate link rel=alternate tags from templates.",
    ],
  }),
  hreflang_non_canonical: guide("hreflang_non_canonical", {
    category: "Localization",
    severity: "error",
    title: "Hreflang to non-canonical URL",
    description: "hreflang points to a URL that is not the canonical version.",
    impact: "Locale alternates may not be associated correctly.",
    fixSteps: [
      "Point hreflang only to indexable canonical URLs in each locale.",
      "Fix canonical tags before hreflang implementation.",
    ],
  }),
  hreflang345xx: guide("hreflang345xx", {
    category: "Localization",
    severity: "error",
    title: "Hreflang to 3XX, 4XX or 5XX URL",
    description: "Alternate language URL redirects or errors.",
    impact: "Broken international targeting for affected locales.",
    fixSteps: [
      "Fix target URLs to return 200 OK.",
      "Update hreflang annotations after URL migrations.",
    ],
  }),
  hreflang_return: guide("hreflang_return", {
    category: "Localization",
    severity: "error",
    title: "Missing return hreflang links",
    description: "Page A links to B via hreflang but B does not link back to A.",
    impact: "Hreflang cluster invalid — Google may ignore all tags.",
    fixSteps: [
      "Implement bidirectional hreflang: every page lists all alternates including itself.",
      "Use sitemap hreflang or on-page link tags consistently across locales.",
    ],
  }),
  hreflang_no_self: guide("hreflang_no_self", {
    category: "Localization",
    severity: "error",
    title: "Hreflang page missing self-reference",
    description: "Page lists alternates for other locales but not itself.",
    impact: "Incomplete hreflang set; validation fails.",
    fixSteps: [
      "Add rel=alternate hreflang for the page’s own language/region.",
    ],
  }),
  hreflang_different: guide("hreflang_different", {
    category: "Localization",
    severity: "warning",
    title: "Hreflang and HTML lang mismatch",
    description: "hreflang declaration does not match the html lang attribute.",
    impact: "Conflicting language signals.",
    fixSteps: [
      "Align <html lang=\"…\"> with the primary hreflang for that URL.",
    ],
  }),
  hreflang_xdefault: guide("hreflang_xdefault", {
    category: "Localization",
    severity: "warning",
    title: "Missing x-default hreflang",
    description: "No x-default alternate for language-selector or global fallback page.",
    impact: "Users in unmatched regions may land on wrong locale.",
    fixSteps: [
      "Add hreflang=\"x-default\" pointing to your global/English fallback URL.",
    ],
  }),
  hreflang_multiple: guide("hreflang_multiple", {
    category: "Localization",
    severity: "notice",
    title: "Multiple hreflang codes for one page",
    description: "Conflicting or redundant hreflang entries on a single URL.",
    impact: "Validation warnings; possible ignored tags.",
    fixSteps: [
      "Consolidate to one tag per locale; remove duplicates from HTTP headers vs HTML.",
    ],
  }),
  invalid_lang: guide("invalid_lang", {
    category: "Localization",
    severity: "notice",
    title: "Invalid HTML lang attribute",
    description: "html lang value is missing or not a valid BCP 47 language tag.",
    impact: "Screen readers and search engines get wrong language hint.",
    fixSteps: [
      "Set <html lang=\"en\"> (or appropriate code) in the document template.",
    ],
  }),
  lang_missing: guide("lang_missing", {
    category: "Localization",
    severity: "notice",
    title: "HTML lang attribute missing",
    description: "No lang attribute on the <html> element.",
    impact: "Accessibility and language detection degraded.",
    fixSteps: [
      "Add lang attribute matching the page’s primary language.",
    ],
  }),

  // ── Speed & Performance ──
  loading_speed: guide("loading_speed", {
    category: "Speed & Performance",
    severity: "warning",
    title: "Slow page loading speed",
    description: "Total page load time exceeds SE Ranking’s threshold.",
    impact: "Higher bounce rate, lower rankings, poor Core Web Vitals.",
    fixSteps: [
      "Enable caching (CDN + server); optimize images and fonts.",
      "Defer non-critical JavaScript; eliminate render-blocking resources.",
      "Upgrade hosting or enable edge caching for HTML where safe.",
    ],
  }),
  lighthouse_speed_index: guide("lighthouse_speed_index", {
    category: "Speed & Performance",
    severity: "warning",
    title: "Speed Index (lab)",
    description: "Lighthouse Speed Index — how quickly content is visually displayed.",
    impact: "Correlates with user-perceived performance and rankings.",
    fixSteps: [
      "Reduce main-thread work; optimize critical rendering path.",
      "Inline critical CSS; preload LCP image and key fonts.",
    ],
  }),
  chrome_ux_lcp: guide("chrome_ux_lcp", {
    category: "Speed & Performance",
    severity: "warning",
    title: "LCP — real-world (CrUX)",
    description: "Largest Contentful Paint exceeds good threshold in Chrome UX Report field data.",
    impact: "Direct Core Web Vitals ranking factor for Google.",
    fixSteps: [
      "Identify LCP element (usually hero image or H1 block); optimize that resource.",
      "Preload LCP image; use fetchpriority=\"high\"; serve WebP/AVIF.",
      "Reduce server TTFB with caching.",
    ],
  }),
  lighthouse_lcp: guide("lighthouse_lcp", {
    category: "Speed & Performance",
    severity: "warning",
    title: "LCP — lab (Lighthouse)",
    description: "Lab-measured Largest Contentful Paint is slow.",
    impact: "Indicates LCP optimization needed before field data degrades.",
    fixSteps: [
      "Same as CrUX LCP: optimize hero media, fonts, and server response.",
      "Test after changes with PageSpeed Insights.",
    ],
  }),
  chrome_ux_cls: guide("chrome_ux_cls", {
    category: "Speed & Performance",
    severity: "warning",
    title: "CLS — real-world (CrUX)",
    description: "Cumulative Layout Shift too high in field data — page content jumps during load.",
    impact: "Core Web Vitals failure; frustrating mobile UX.",
    fixSteps: [
      "Set explicit width/height on images and embeds.",
      "Reserve space for ads and dynamic banners.",
      "Avoid injecting content above existing content after load.",
    ],
  }),
  lighthouse_cls: guide("lighthouse_cls", {
    category: "Speed & Performance",
    severity: "warning",
    title: "CLS — lab (Lighthouse)",
    description: "Lab CLS score indicates layout instability.",
    impact: "Predicts poor field CLS if shipped unchanged.",
    fixSteps: [
      "Audit fonts (use font-display: swap with metric overrides).",
      "Fix unsized media and late-loading widgets.",
    ],
  }),
  chrome_ux_fcp: guide("chrome_ux_fcp", {
    category: "Speed & Performance",
    severity: "warning",
    title: "FCP — real-world (CrUX)",
    description: "First Contentful Paint slow in real-user data.",
    impact: "Users wait longer before seeing any content.",
    fixSteps: [
      "Reduce TTFB; minimize blocking CSS/JS in head.",
      "Use CDN for static assets close to users.",
    ],
  }),
  lighthouse_fcp: guide("lighthouse_fcp", {
    category: "Speed & Performance",
    severity: "warning",
    title: "FCP — lab (Lighthouse)",
    description: "Lab First Contentful Paint exceeds threshold.",
    impact: "Early paint delayed — affects perceived speed.",
    fixSteps: [
      "Inline minimal critical CSS; defer scripts.",
      "Eliminate redirect chains on the landing URL.",
    ],
  }),
  chrome_ux_inp: guide("chrome_ux_inp", {
    category: "Speed & Performance",
    severity: "warning",
    title: "INP — real-world (CrUX)",
    description: "Interaction to Next Paint is slow — page feels laggy after clicks/taps.",
    impact: "Core Web Vitals metric replacing FID; affects rankings.",
    fixSteps: [
      "Break up long JavaScript tasks; reduce third-party script impact.",
      "Optimize event handlers; use web workers for heavy computation.",
    ],
  }),
  lighthouse_tti: guide("lighthouse_tti", {
    category: "Speed & Performance",
    severity: "warning",
    title: "Time to Interactive (TTI)",
    description: "Page takes too long to become fully interactive.",
    impact: "Users cannot interact quickly; especially bad on mobile.",
    fixSteps: [
      "Code-split JavaScript; remove unused libraries.",
      "Delay non-essential widgets until after load.",
    ],
  }),
  lighthouse_tbt: guide("lighthouse_tbt", {
    category: "Speed & Performance",
    severity: "warning",
    title: "Total Blocking Time (TBT)",
    description: "Main thread blocked too long by JavaScript execution.",
    impact: "Poor interactivity and INP scores.",
    fixSteps: [
      "Audit long tasks in Chrome DevTools Performance panel.",
      "Split bundles; defer analytics and chat widgets.",
    ],
  }),
  too_big: guide("too_big", {
    category: "Speed & Performance",
    severity: "warning",
    title: "HTML document too large",
    description: "HTML response size exceeds recommended limit (often bloated DOM or inline data).",
    impact: "Slower parse time and higher bandwidth — especially on mobile.",
    fixSteps: [
      "Remove inline JSON blobs and commented markup bloat.",
      "Paginate long archives; lazy-load below-fold modules.",
      "Disable “view source” heavy page builders outputting huge DOM.",
    ],
  }),
  uncompressed: guide("uncompressed", {
    category: "Speed & Performance",
    severity: "notice",
    title: "Uncompressed HTML/content",
    description: "Text responses not served with gzip/Brotli compression.",
    impact: "Larger transfers and slower loads.",
    fixSteps: [
      "Enable Brotli/gzip on web server or CDN for text/* MIME types.",
    ],
  }),

  // ── JavaScript ──
  js45xx: guide("js45xx", {
    category: "JavaScript",
    severity: "error",
    title: "4XX or 5XX JavaScript file",
    description: "A script URL returns an error status.",
    impact: "Broken functionality, console errors, possible layout failures.",
    fixSteps: [
      "Fix or remove references to missing script files.",
      "Update plugin/theme paths after migrations.",
    ],
  }),
  js3xx: guide("js3xx", {
    category: "JavaScript",
    severity: "error",
    title: "3XX JavaScript file",
    description: "Script URL redirects instead of serving the file.",
    impact: "Extra latency; some browsers may not follow redirects for scripts reliably.",
    fixSteps: [
      "Point script src directly to final 200 URL.",
    ],
  }),
  extjs345xx: guide("extjs345xx", {
    category: "JavaScript",
    severity: "error",
    title: "External JavaScript 3XX/4XX/5XX",
    description: "Third-party script fails to load.",
    impact: "Dependent features break; may block rendering if synchronous.",
    fixSteps: [
      "Remove dead third-party tags from GTM/analytics.",
      "Host critical scripts locally if vendor CDN is unreliable.",
    ],
  }),
  js_big: guide("js_big", {
    category: "JavaScript",
    severity: "notice",
    title: "JavaScript file too large",
    description: "Individual JS bundle exceeds size threshold.",
    impact: "Slow parse/compile, poor mobile performance.",
    fixSteps: [
      "Code-split routes; tree-shake unused exports.",
      "Replace heavy libraries with lighter alternatives.",
    ],
  }),
  js_uncompressed: guide("js_uncompressed", {
    category: "JavaScript",
    severity: "notice",
    title: "JavaScript not compressed",
    description: "JS served without gzip/Brotli.",
    impact: "Larger downloads.",
    fixSteps: [
      "Enable compression on CDN/origin for application/javascript.",
    ],
  }),
  js_not_min: guide("js_not_min", {
    category: "JavaScript",
    severity: "notice",
    title: "JavaScript not minified",
    description: "Script files include whitespace/comments suitable for production minification.",
    impact: "Unnecessary bytes over the wire.",
    fixSteps: [
      "Run production build with minification (Terser, esbuild).",
      "Use CDN “minify JS” or optimization plugin on WordPress.",
    ],
  }),
  js_not_cached: guide("js_not_cached", {
    category: "JavaScript",
    severity: "notice",
    title: "JavaScript not cached",
    description: "Short or missing cache headers on static JS.",
    impact: "Repeat visitors re-download scripts every visit.",
    fixSteps: [
      "Set Cache-Control: public, max-age=31536000, immutable for hashed assets.",
    ],
  }),
  js_many: guide("js_many", {
    category: "JavaScript",
    severity: "notice",
    title: "Too many JavaScript files",
    description: "High count of separate script requests on the page.",
    impact: "HTTP overhead and slower parsing on mobile.",
    fixSteps: [
      "Concatenate/bundle where appropriate; HTTP/2 helps but fewer files still better.",
      "Remove unused plugin scripts per template.",
    ],
  }),

  // ── CSS ──
  css45xx: guide("css45xx", {
    category: "CSS",
    severity: "error",
    title: "4XX or 5XX CSS file",
    description: "Stylesheet URL returns an error.",
    impact: "Unstyled or partially styled pages.",
    fixSteps: [
      "Restore missing CSS files or fix broken theme enqueue paths.",
    ],
  }),
  extcss345xx: guide("extcss345xx", {
    category: "CSS",
    severity: "error",
    title: "External CSS 3XX/4XX/5XX",
    description: "Third-party stylesheet fails to load.",
    impact: "Missing styles from fonts CDN, widget CSS, etc.",
    fixSteps: [
      "Remove broken external stylesheet links.",
      "Self-host critical CSS from unreliable CDNs.",
    ],
  }),
  css3xx: guide("css3xx", {
    category: "CSS",
    severity: "warning",
    title: "3XX CSS file",
    description: "Stylesheet URL redirects.",
    impact: "Render delay and possible FOUC.",
    fixSteps: [
      "Link directly to final stylesheet URL.",
    ],
  }),
  css_big: guide("css_big", {
    category: "CSS",
    severity: "notice",
    title: "CSS file too large",
    description: "Stylesheet exceeds recommended size.",
    impact: "Render-blocking download delays first paint.",
    fixSteps: [
      "Remove unused CSS (PurgeCSS); split critical vs deferred styles.",
    ],
  }),
  css_uncompressed: guide("css_uncompressed", {
    category: "CSS",
    severity: "notice",
    title: "CSS not compressed",
    description: "Stylesheets served uncompressed.",
    impact: "Larger CSS downloads.",
    fixSteps: [
      "Enable Brotli/gzip for text/css on server/CDN.",
    ],
  }),
  css_not_min: guide("css_not_min", {
    category: "CSS",
    severity: "notice",
    title: "CSS not minified",
    description: "CSS files not minified for production.",
    impact: "Extra bytes on every page load.",
    fixSteps: [
      "Minify CSS in build pipeline or via optimization plugin.",
    ],
  }),
  css_not_cached: guide("css_not_cached", {
    category: "CSS",
    severity: "notice",
    title: "CSS not cached",
    description: "Stylesheets lack long-lived cache headers.",
    impact: "Repeat visitors re-fetch CSS.",
    fixSteps: [
      "Set long cache TTL with fingerprinted filenames.",
    ],
  }),
  css_many: guide("css_many", {
    category: "CSS",
    severity: "notice",
    title: "Too many CSS files",
    description: "Many separate stylesheet requests.",
    impact: "Render-blocking overhead.",
    fixSteps: [
      "Combine plugin CSS where safe; load non-critical CSS asynchronously.",
    ],
  }),

  // ── Links ──
  no_inlinks: guide("no_inlinks", {
    category: "Links",
    severity: "error",
    title: "No inbound internal links",
    description: "Orphan page — no internal links point to this URL.",
    impact: "Hard for crawlers and users to discover; may not get PageRank.",
    fixSteps: [
      "Add contextual internal links from related content, navigation, or hub pages.",
      "Include in HTML sitemap and category listings.",
    ],
  }),
  links3xx: guide("links3xx", {
    category: "Links",
    severity: "warning",
    title: "Internal links to 3XX redirect pages",
    description: "Internal hrefs point to URLs that redirect instead of final destinations.",
    impact: "Wasted crawl hops; diluted link equity.",
    fixSteps: [
      "Update internal links to the final 200 URL after redirects.",
      "Run find-and-replace in CMS after URL structure changes.",
    ],
  }),
  extlinks4xx: guide("extlinks4xx", {
    category: "Links",
    severity: "warning",
    title: "External links to 4XX",
    description: "Outbound links point to broken external pages.",
    impact: "Poor UX and quality signal; users hit dead ends.",
    fixSteps: [
      "Remove or replace broken outbound links.",
      "Use a link checker periodically on resource/blog pages.",
    ],
  }),
  extlinks5xx: guide("extlinks5xx", {
    category: "Links",
    severity: "warning",
    title: "External links to 5XX",
    description: "Outbound links target servers returning errors.",
    impact: "Broken references; may need temporary removal until partner site recovers.",
    fixSteps: [
      "Verify if external site is temporarily down vs permanently moved.",
      "Update or remove links accordingly.",
    ],
  }),
  less_inlink: guide("less_inlink", {
    category: "Links",
    severity: "notice",
    title: "Only one inbound internal link",
    description: "Page is barely linked internally.",
    impact: "Low internal PageRank; weak discovery signal.",
    fixSteps: [
      "Add links from related posts, breadcrumbs, and hub/category pages.",
    ],
  }),
  links_nofollow: guide("links_nofollow", {
    category: "Links",
    severity: "notice",
    title: "Nofollow internal links",
    description: "Internal links use rel=nofollow.",
    impact: "PageRank may not flow to linked internal pages.",
    fixSteps: [
      "Remove nofollow from standard internal navigation and content links.",
      "Reserve nofollow for untrusted/user links only.",
    ],
  }),
  links_no_anchor: guide("links_no_anchor", {
    category: "Links",
    severity: "notice",
    title: "Internal links missing anchor text",
    description: "Links have empty or image-only anchors without alt text.",
    impact: "Weak relevance signal for target pages.",
    fixSteps: [
      "Use descriptive anchor text (avoid generic “click here”).",
      "Add alt text when linking via images.",
    ],
  }),
  extlinks3xx: guide("extlinks3xx", {
    category: "Links",
    severity: "notice",
    title: "External links to 3XX",
    description: "Outbound URLs redirect — may be outdated link targets.",
    impact: "Extra hop for users; link may break if redirect chain changes.",
    fixSteps: [
      "Update href to the final destination URL after following redirects.",
    ],
  }),
  extlinks_timeout: guide("extlinks_timeout", {
    category: "Links",
    severity: "notice",
    title: "External links timed out",
    description: "Outbound URL did not respond in time during crawl.",
    impact: "Possibly dead or very slow partner sites linked from your content.",
    fixSteps: [
      "Verify URL manually; remove or replace unresponsive links.",
    ],
  }),
  extlinks_nofollow: guide("extlinks_nofollow", {
    category: "Links",
    severity: "notice",
    title: "Nofollow external links",
    description: "External links marked nofollow (informational — not always an issue).",
    impact: "Standard for sponsored/untrusted links; excessive nofollow on citations may be unnecessary.",
    fixSteps: [
      "Keep nofollow on paid/UGC links per Google guidelines.",
      "Use follow links for legitimate editorial citations where appropriate.",
    ],
  }),
  extlinks_no_anchor: guide("extlinks_no_anchor", {
    category: "Links",
    severity: "notice",
    title: "External links missing anchor text",
    description: "Outbound links lack descriptive anchor text.",
    impact: "Accessibility and context loss for users.",
    fixSteps: [
      "Add meaningful anchor text describing the linked resource.",
    ],
  }),

  // ── Mobile ──
  viewport_missing: guide("viewport_missing", {
    category: "Mobile Optimization",
    severity: "error",
    title: "Viewport meta tag missing",
    description: "No viewport meta tag for mobile responsive layout.",
    impact: "Page renders desktop-width on phones — poor mobile UX and rankings.",
    fixSteps: [
      'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to <head>.',
      "Verify theme mobile template includes viewport.",
    ],
  }),
  viewport_device_width: guide("viewport_device_width", {
    category: "Mobile Optimization",
    severity: "warning",
    title: "Fixed width in viewport meta tag",
    description: "Viewport uses fixed pixel width instead of device-width.",
    impact: "Non-responsive layout on varying screen sizes.",
    fixSteps: [
      "Change to width=device-width, initial-scale=1.",
      "Remove user-scalable=no unless accessibility-reviewed.",
    ],
  }),

  // ── Other ──
  no_favicon: guide("no_favicon", {
    category: "Other",
    severity: "warning",
    title: "Favicon missing",
    description: "No favicon found for the site.",
    impact: "Brand recognition in browser tabs and bookmarks suffers.",
    fixSteps: [
      "Add favicon.ico and/or PNG icons at /favicon.ico or linked in <head>.",
      "Include apple-touch-icon for mobile home screens.",
    ],
  }),
  plugins: guide("plugins", {
    category: "Other",
    severity: "warning",
    title: "Incompatible plugins (Flash/Java)",
    description: "Page references deprecated plugin content (Flash, Java applets).",
    impact: "Content unavailable in modern browsers; security risk.",
    fixSteps: [
      "Replace plugin embeds with HTML5 video/canvas or remove entirely.",
    ],
  }),
  twitter_missing: guide("twitter_missing", {
    category: "Other",
    severity: "notice",
    title: "X (Twitter) Card tags missing",
    description: "No Twitter/X Card meta tags for rich social previews.",
    impact: "Plain text previews when shared on X — lower social CTR.",
    fixSteps: [
      "Add twitter:card, twitter:title, twitter:description, twitter:image tags.",
      "Most SEO plugins generate these alongside Open Graph tags.",
    ],
  }),
};

/**
 * @param {string} code
 * @param {string} [fallbackName]
 * @param {string} [fallbackCategory]
 */
export function getAuditIssueGuide(code, fallbackName, fallbackCategory) {
  const key = String(code || "").trim();
  if (AUDIT_ISSUE_GUIDES[key]) return AUDIT_ISSUE_GUIDES[key];

  const title = fallbackName || key || "Unknown issue";
  return {
    code: key,
    category: fallbackCategory || "Other",
    severity: "notice",
    title,
    description: `${title} was reported by SE Ranking Site Audit. Review affected URLs and compare with SE Ranking’s issue documentation.`,
    impact: "May affect crawlability, indexation, user experience, or rankings depending on severity.",
    fixSteps: [
      "Open the affected URLs listed below and reproduce the issue in browser or DevTools.",
      "Compare the issue code with SE Ranking’s reference: seranking.com/api/data/reference/#site-audit-issue-codes",
      "Apply the appropriate fix (redirect, meta tag, content, performance, or server config change).",
      "Re-run the site audit to confirm the issue count drops to zero.",
    ],
  };
}

/** Enrich a normalized check object with guide fields. */
export function enrichAuditCheck(check, sectionName) {
  if (!check?.code) return check;
  const g = getAuditIssueGuide(check.code, check.name, sectionName);
  return {
    ...check,
    category: g.category,
    severity: g.severity || check.type,
    title: g.title || check.name,
    description: g.description,
    impact: g.impact,
    fixSteps: g.fixSteps,
  };
}
