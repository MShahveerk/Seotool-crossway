/**
 * Build thorough step-by-step indexing fix guides from Google URL Inspection signals.
 */

function blob(row = {}) {
  return [
    row.coverageState,
    row.cause,
    row.indexingState,
    row.robotsTxtState,
    row.pageFetchState,
    row.verdict,
    row.errorMessage,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * @returns {string} issueType key
 */
export function detectIssueType(row = {}) {
  const t = blob(row);
  if (t.includes("noindex") || t.includes("excluded by ‘noindex’") || t.includes("excluded by 'noindex'")) {
    return "noindex";
  }
  if (t.includes("robots.txt") || t.includes("blocked by robots")) return "robots_blocked";
  if (t.includes("soft 404")) return "soft_404";
  if (
    t.includes("not found") ||
    t.includes("404") ||
    (t.includes("page fetch") && t.includes("not_found"))
  ) {
    return "not_found";
  }
  if (t.includes("server error") || t.includes("5xx") || t.includes("server_error")) return "server_error";
  if (t.includes("redirect")) return "redirect";
  if (t.includes("canonical") || t.includes("duplicate") || t.includes("alternate page")) {
    return "canonical_duplicate";
  }
  if (t.includes("discovered - currently not indexed") || t.includes("discovered – currently not indexed")) {
    return "discovered_not_indexed";
  }
  if (t.includes("crawled - currently not indexed") || t.includes("crawled – currently not indexed")) {
    return "crawled_not_indexed";
  }
  if (t.includes("blocked due to access") || t.includes("forbidden") || t.includes("unauthorized")) {
    return "access_blocked";
  }
  if (t.includes("blocked by page") || t.includes("blocked_by_http")) return "http_blocked";
  if (t.includes("excluded") && t.includes("sitemap")) return "sitemap_issue";
  return "generic_not_indexed";
}

function step(title, detail) {
  return { title, detail };
}

function commonVerifySteps(pageUrl) {
  return [
    step(
      "Re-check in Google Search Console",
      `Open URL Inspection for ${pageUrl}, click “Test live URL”, then “Request indexing” only after the live test shows the page is indexable (no noindex, 200 OK, correct canonical).`
    ),
    step(
      "Confirm in this app tomorrow",
      "After the next daily inspection run (05:00), confirm this URL moves into the Indexed list. If it stays Not indexed, re-open this task and work through any remaining steps."
    ),
  ];
}

function guideForType(issueType, pageUrl, row = {}) {
  const googleCanon = row.googleCanonical || "";
  const userCanon = row.userCanonical || "";
  const coverage = row.coverageState || row.cause || "Not indexed";

  const guides = {
    noindex: {
      title: `Remove noindex so Google can index ${shortPath(pageUrl)}`,
      summary: `Google reports this URL is excluded because of a noindex signal. Coverage: ${coverage}.`,
      steps: [
        step(
          "Confirm where noindex is set",
          `Open ${pageUrl} and view page source. Search for “noindex” in: (1) <meta name="robots"> / <meta name="googlebot">, (2) HTTP header X-Robots-Tag, (3) CMS/SEO plugin settings (Yoast, Rank Math, WordPress reading “Discourage search engines”, Shopify/Webflow SEO toggles).`
        ),
        step(
          "Decide if the page should be public",
          "If this URL should rank in Google, remove every noindex. If it is intentionally private (thank-you pages, staging, cart), keep noindex and mark this task done — do not request indexing."
        ),
        step(
          "Remove noindex and publish",
          "Clear the meta robots noindex, remove X-Robots-Tag: noindex from the server/CDN, and save/publish the page. Purge cache (CDN, Cloudflare, WP cache) so Google sees the updated HTML/headers."
        ),
        step(
          "Verify live response",
          `Fetch the live URL (incognito or curl -I). Confirm: HTTP 200, no X-Robots-Tag: noindex, and HTML does not contain content="noindex". Also confirm the page has unique title, H1, and useful body content.`
        ),
        ...commonVerifySteps(pageUrl),
      ],
    },
    robots_blocked: {
      title: `Unblock ${shortPath(pageUrl)} in robots.txt`,
      summary: `Google cannot crawl this URL because robots.txt is blocking it. Coverage: ${coverage}.`,
      steps: [
        step(
          "Open robots.txt",
          `Visit your site origin + /robots.txt. Find Disallow rules that match the path of ${pageUrl} (or Disallow: / for the whole site).`
        ),
        step(
          "Update rules carefully",
          "Remove or narrow the Disallow for this path. Keep blocking only admin, cart, search, and private areas. Do not block CSS/JS needed for rendering if you use dynamic pages."
        ),
        step(
          "Deploy robots.txt and wait for Google to re-read it",
          "Publish the new robots.txt. In GSC → robots.txt Tester / URL Inspection, confirm the URL is allowed. Note: Google may cache robots.txt for a day."
        ),
        step(
          "Ensure the page itself is indexable",
          "After crawl is allowed, confirm the page returns 200, has no noindex, and is linked from the sitemap or internal navigation."
        ),
        ...commonVerifySteps(pageUrl),
      ],
    },
    soft_404: {
      title: `Fix soft 404 on ${shortPath(pageUrl)}`,
      summary: `Google treats this URL like a soft 404 (thin/empty “not found” content with a 200 status). Coverage: ${coverage}.`,
      steps: [
        step(
          "Open the page as a user would",
          `Load ${pageUrl}. If it shows “not found”, empty state, or almost no content while still returning HTTP 200, that is a soft 404.`
        ),
        step(
          "Choose the correct fix",
          "Either: (A) restore real unique content and keep 200, or (B) return a true HTTP 404/410 if the page should not exist, or (C) 301 redirect to the best replacement URL if the content moved."
        ),
        step(
          "If keeping the URL — enrich content",
          "Add a clear title, H1, 300+ words of useful unique copy (or a real product/service layout), internal links from related pages, and an image if relevant. Remove placeholder/lorem text."
        ),
        step(
          "If the page is gone — use proper status codes",
          "Return 404 or 410 (or 301 to the replacement). Update internal links and the XML sitemap so they no longer point to the dead URL."
        ),
        ...commonVerifySteps(pageUrl),
      ],
    },
    not_found: {
      title: `Resolve 404 for ${shortPath(pageUrl)}`,
      summary: `Google cannot index this URL because it is not found / fails to fetch. Coverage: ${coverage}.`,
      steps: [
        step(
          "Confirm the HTTP status",
          `Request ${pageUrl} and note the status code. 404/410 means missing; 0/timeout means server/DNS issues.`
        ),
        step(
          "Restore or redirect",
          "Restore the page at this exact URL if it should exist, or 301 redirect to the closest live equivalent. Avoid chains of redirects."
        ),
        step(
          "Clean references",
          "Remove the dead URL from the XML sitemap, menus, and internal links. Submit/resubmit the sitemap from Sitemap Health after cleanup."
        ),
        ...commonVerifySteps(pageUrl),
      ],
    },
    server_error: {
      title: `Fix server errors blocking ${shortPath(pageUrl)}`,
      summary: `Google hit server errors when fetching this URL. Coverage: ${coverage}.`,
      steps: [
        step(
          "Reproduce the error",
          `Load ${pageUrl} several times. Check hosting/CDN logs for 5xx around Googlebot user-agents.`
        ),
        step(
          "Stabilize the page",
          "Fix application crashes, database timeouts, memory limits, or WAF rules blocking Googlebot. Ensure TTFB is reasonable and the page returns 200 consistently."
        ),
        step(
          "Allow Googlebot through security layers",
          "Whitelist Googlebot in Cloudflare/WAF if you rate-limit aggressively. Do not challenge Googlebot with CAPTCHAs on this URL."
        ),
        ...commonVerifySteps(pageUrl),
      ],
    },
    redirect: {
      title: `Clean up redirects for ${shortPath(pageUrl)}`,
      summary: `Google sees this URL as a redirect (or redirect-related exclusion). Coverage: ${coverage}.`,
      steps: [
        step(
          "Map the redirect chain",
          `Follow ${pageUrl} until the final URL. Note every hop. Ideal: one 301 to the final HTTPS canonical URL.`
        ),
        step(
          "Pick one canonical URL",
          "Decide the single URL that should be indexed. Update internal links, sitemap, and hreflang/canonical tags to that final URL — not the intermediate redirects."
        ),
        step(
          "Remove unnecessary hops",
          "Collapse http→https, www↔non-www, and trailing-slash chains into a single redirect. Avoid redirecting to soft-404 or noindex destinations."
        ),
        ...commonVerifySteps(pageUrl),
      ],
    },
    canonical_duplicate: {
      title: `Resolve canonical/duplicate issue for ${shortPath(pageUrl)}`,
      summary: `Google is not indexing this URL as a duplicate/canonical conflict.${
        googleCanon || userCanon
          ? ` User canonical: ${userCanon || "—"}. Google chose: ${googleCanon || "—"}.`
          : ""
      } Coverage: ${coverage}.`,
      steps: [
        step(
          "Compare the two URLs",
          `If Google chose a different canonical (${googleCanon || "see GSC"}), open both URLs. Confirm which one should rank.`
        ),
        step(
          "Align rel=canonical",
          "On the preferred URL, set rel=canonical to itself. On duplicates, point rel=canonical to the preferred URL. Ensure CMS plugins are not overriding this."
        ),
        step(
          "Consolidate signals",
          "Put the preferred URL in the XML sitemap, internal links, and menus. 301 redirect weak duplicates when appropriate (http/www/param variants)."
        ),
        step(
          "Reduce near-duplicate content",
          "If two URLs have nearly identical content, merge them or differentiate clearly (unique intent, titles, and body). Thin parameter variants should not compete."
        ),
        ...commonVerifySteps(pageUrl),
      ],
    },
    discovered_not_indexed: {
      title: `Get ${shortPath(pageUrl)} crawled and indexed (Discovered)`,
      summary: `Google knows the URL exists but has not crawled/indexed it yet. Coverage: ${coverage}.`,
      steps: [
        step(
          "Confirm the page is worth indexing",
          `Ensure ${pageUrl} returns 200, is not noindex, has unique valuable content, and is not a thin tag/filter URL.`
        ),
        step(
          "Strengthen discovery signals",
          "Add internal links from important related pages (homepage/category/blog hubs). Include the URL in the XML sitemap and resubmit from Sitemap Health."
        ),
        step(
          "Improve quality / reduce crawl waste",
          "Fix sitewide soft-404s and low-value URLs so Google spends crawl budget on this page. Compress images and speed up LCP to make crawling cheaper."
        ),
        step(
          "Request indexing after live test passes",
          "In GSC URL Inspection → Test live URL. If indexable, request indexing. Do not spam requests daily."
        ),
        ...commonVerifySteps(pageUrl),
      ],
    },
    crawled_not_indexed: {
      title: `Improve ${shortPath(pageUrl)} so Google indexes after crawl`,
      summary: `Google crawled the URL but chose not to index it (quality/usefulness). Coverage: ${coverage}.`,
      steps: [
        step(
          "Audit content quality",
          `Open ${pageUrl}. Check for thin content, doorway text, duplicate sections, AI fluff, or pages with little unique value versus stronger pages on the same topic.`
        ),
        step(
          "Upgrade the page",
          "Add original substance: clearer intent, unique H1/title, expanded helpful sections, FAQs if relevant, examples, and outbound/internal links to related resources. Remove boilerplate-only layouts."
        ),
        step(
          "Check technical indexability",
          "Confirm 200 OK, no noindex, correct self-canonical, content visible without login, and important text not locked behind tabs that never render in HTML."
        ),
        step(
          "Build relevance with internal links",
          "Link to this URL with descriptive anchors from topical pages. Ensure it appears in the sitemap."
        ),
        ...commonVerifySteps(pageUrl),
      ],
    },
    access_blocked: {
      title: `Fix access blocking for ${shortPath(pageUrl)}`,
      summary: `Google is blocked from accessing this URL (auth, paywall, IP, or similar). Coverage: ${coverage}.`,
      steps: [
        step(
          "Identify the block",
          `Open ${pageUrl} in a private window. Check for login walls, geo blocks, basic auth, or CDN “Access denied”.`
        ),
        step(
          "Allow Googlebot for public pages",
          "If the page should be public SEO content, remove auth requirements for Googlebot and users. Keep private areas behind auth intentionally."
        ),
        step(
          "Review firewall / bot rules",
          "Ensure WAF/CDN rules are not blocking Googlebot ASN/user-agent. Test with URL Inspection live test."
        ),
        ...commonVerifySteps(pageUrl),
      ],
    },
    http_blocked: {
      title: `Fix HTTP/fetch block for ${shortPath(pageUrl)}`,
      summary: `Google could not fetch the page due to an HTTP-level block. Coverage: ${coverage}.`,
      steps: [
        step(
          "Inspect response headers and status",
          `curl -I "${pageUrl}" and note status, cookies challenges, and security headers that might interfere.`
        ),
        step(
          "Serve a clean 200 HTML response to Googlebot",
          "Disable bot fights on this path if it is marketing content. Ensure the first response contains the main content (not an empty shell that never hydrates)."
        ),
        ...commonVerifySteps(pageUrl),
      ],
    },
    sitemap_issue: {
      title: `Fix sitemap listing for ${shortPath(pageUrl)}`,
      summary: `Indexing exclusion appears related to sitemap/submission. Coverage: ${coverage}.`,
      steps: [
        step(
          "Confirm URL is in the XML sitemap",
          `Open your sitemap and search for ${pageUrl}. If missing and the page should be indexed, add it.`
        ),
        step(
          "Remove bad URLs from the sitemap",
          "Sitemaps should only list canonical, indexable, 200 URLs. Remove noindex, redirected, and 404 URLs."
        ),
        step(
          "Resubmit sitemap",
          "Use Sitemap Health → Resubmit, then re-inspect this URL."
        ),
        ...commonVerifySteps(pageUrl),
      ],
    },
    generic_not_indexed: {
      title: `Investigate why ${shortPath(pageUrl)} is not indexed`,
      summary: `Google is not indexing this URL. Reported coverage/cause: ${coverage}.`,
      steps: [
        step(
          "Read Google’s coverage reason carefully",
          `In this app and in GSC URL Inspection, note the exact coverage state (“${coverage}”). That phrase is the primary diagnosis.`
        ),
        step(
          "Run a technical checklist",
          `For ${pageUrl} verify: (1) HTTP 200, (2) no noindex meta/header, (3) not blocked in robots.txt, (4) self-canonical or correct canonical, (5) content is unique and substantial, (6) URL is in sitemap + internal links.`
        ),
        step(
          "Compare with a working indexed sibling page",
          "Find a similar page that is indexed. Diff templates, robots tags, canonicals, and content length to spot what differs."
        ),
        step(
          "Fix the root cause then request indexing",
          "Apply the fix, purge caches, live-test in GSC, then request indexing once."
        ),
        ...commonVerifySteps(pageUrl),
      ],
    },
  };

  return guides[issueType] || guides.generic_not_indexed;
}

function shortPath(pageUrl) {
  try {
    const u = new URL(pageUrl);
    const p = u.pathname + u.search;
    return p.length > 60 ? `${p.slice(0, 57)}…` : p || "/";
  } catch {
    return String(pageUrl || "page").slice(0, 60);
  }
}

/**
 * Build a full task payload from an inspection result row.
 */
export function buildIndexingTaskFromResult(siteUrl, row = {}) {
  const pageUrl = String(row.url || row.inspectionUrl || "").trim();
  const issueType = detectIssueType(row);
  const guide = guideForType(issueType, pageUrl, row);
  return {
    siteUrl,
    pageUrl,
    title: guide.title.slice(0, 512),
    issueType,
    cause: row.cause || null,
    coverageState: row.coverageState || null,
    verdict: row.verdict || null,
    summary: guide.summary,
    steps: guide.steps,
  };
}
