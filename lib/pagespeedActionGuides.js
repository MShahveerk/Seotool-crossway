/**
 * Practical "how to fix" steps per Lighthouse audit id.
 * Shown under each failing audit in the PageSpeed Insights page.
 * Plain data — safe to import in client components.
 */

export const PAGESPEED_ACTION_GUIDES = {
  // ---- Performance: opportunities ----
  "render-blocking-resources": [
    "Inline critical CSS for above-the-fold content and load the rest with media/print-swap or preload.",
    "Add defer or async to non-essential <script> tags so they stop blocking first paint.",
    "If on WordPress, a plugin like WP Rocket / Autoptimize can automate critical CSS and deferred JS.",
  ],
  "unused-css-rules": [
    "Remove stylesheets for components that aren't on the page (sliders, page builders, icon packs).",
    "Split large global CSS into per-page or per-template bundles.",
    "Use a purge tool (PurgeCSS, Tailwind's built-in purge) in the build step.",
  ],
  "unused-javascript": [
    "Code-split large bundles so each page only loads what it uses.",
    "Remove or lazy-load third-party widgets (chat, heatmaps, embeds) that aren't needed at load.",
    "Audit tag manager containers — old marketing tags are a common source of dead JS.",
  ],
  "modern-image-formats": [
    "Serve images as WebP or AVIF instead of JPEG/PNG (most CDNs and image plugins convert automatically).",
    "Keep a JPEG fallback only if you must support very old browsers.",
  ],
  "uses-optimized-images": [
    "Compress JPEGs to ~80% quality — visually identical, much smaller.",
    "Run existing media through an optimizer (Squoosh, TinyPNG, or a CDN with image optimization).",
  ],
  "uses-responsive-images": [
    "Add srcset/sizes so phones download small variants instead of desktop-size images.",
    "Resize uploads to the maximum displayed size — don't ship 4000px images into 400px slots.",
  ],
  "offscreen-images": [
    "Add loading=\"lazy\" to images below the fold.",
    "Don't lazy-load the hero/LCP image — that one should load eagerly.",
  ],
  "uses-text-compression": [
    "Enable gzip or Brotli compression on the server/CDN for HTML, CSS, JS and SVG responses.",
    "On nginx: enable the brotli/gzip modules; on Apache: mod_deflate; most CDNs have a toggle.",
  ],
  "uses-long-cache-ttl": [
    "Set Cache-Control: max-age of at least 30 days for static assets (images, fonts, CSS, JS).",
    "Use hashed filenames (app.3f9c.js) so long caching never serves stale code.",
  ],
  "server-response-time": [
    "Enable full-page caching so repeat HTML requests skip the application/database.",
    "Check slow database queries and upgrade hosting if TTFB stays above ~600 ms.",
    "Put a CDN in front of the origin to serve visitors from a nearby location.",
  ],
  redirects: [
    "Link directly to the final URL — every redirect hop adds a full round-trip before rendering.",
    "Fix internal links pointing to http:// or non-www variants that bounce through redirects.",
  ],
  "uses-rel-preconnect": [
    "Add <link rel=\"preconnect\"> for critical third-party origins (fonts, CDN, analytics).",
    "Limit preconnect to 2-3 origins actually used early in the page load.",
  ],
  "font-display": [
    "Add font-display: swap to @font-face rules so text stays visible while fonts load.",
    "For Google Fonts, append &display=swap to the stylesheet URL.",
  ],
  "prioritize-lcp-image": [
    "Add fetchpriority=\"high\" to the LCP (hero) image and preload it.",
    "Never lazy-load the LCP image.",
  ],
  "unminified-css": ["Minify CSS in the build step (cssnano, esbuild) or via your optimization plugin/CDN."],
  "unminified-javascript": ["Minify JS in the build step (terser, esbuild) or via your optimization plugin/CDN."],
  "efficient-animated-content": [
    "Replace animated GIFs with MP4/WebM video — typically 5-10x smaller.",
    "Use <video autoplay loop muted playsinline> for GIF-like behavior.",
  ],
  "legacy-javascript": [
    "Update your build targets (browserslist) so modern browsers don't get transpiled polyfill code.",
    "Ship module/nomodule or ES2017+ bundles to modern browsers.",
  ],
  "total-byte-weight": [
    "Biggest wins are usually images and JS — compress images and code-split bundles first.",
    "Aim for under ~1.5 MB total transfer for a landing page.",
  ],
  "duplicated-javascript": ["Deduplicate shared dependencies in the bundler config (single React/lodash instance)."],

  // ---- Performance: diagnostics ----
  "mainthread-work-breakdown": [
    "Reduce and split long JavaScript tasks; move heavy work to web workers where possible.",
    "Remove or defer third-party scripts that run at page load.",
  ],
  "bootup-time": [
    "Code-split so less JS parses/executes on initial load.",
    "Defer analytics and marketing tags until after first interaction or idle.",
  ],
  "third-party-summary": [
    "Load third-party embeds (YouTube, maps, chat) on click/scroll using facades.",
    "Remove tags you no longer use — audit the tag manager container.",
  ],
  "dom-size": [
    "Reduce total DOM nodes — paginate long lists, virtualize tables, simplify nested markup from page builders.",
    "Aim for under ~1,500 nodes; over 3,000 slows style/layout significantly.",
  ],
  "largest-contentful-paint-element": [
    "Identify the LCP element below, then: preload it if it's an image, avoid lazy-loading it, and compress it.",
    "If it's text, make sure webfonts use font-display: swap.",
  ],
  "layout-shifts": [
    "Give images and embeds explicit width/height (or aspect-ratio) so space is reserved before load.",
    "Never inject banners/ads above existing content after load.",
  ],
  "layout-shift-elements": [
    "Give images and embeds explicit width/height (or aspect-ratio) so space is reserved before load.",
    "Never inject banners/ads above existing content after load.",
  ],
  "non-composited-animations": [
    "Animate only transform and opacity — avoid animating top/left/width/height.",
  ],
  "long-tasks": [
    "Break JS work into chunks under 50 ms; defer non-critical logic with requestIdleCallback.",
  ],
  "critical-request-chains": [
    "Flatten dependency chains: preload key requests and inline critical CSS.",
  ],
  "uses-passive-event-listeners": ["Add { passive: true } to touch/wheel scroll listeners."],

  // ---- SEO ----
  "document-title": ["Add a unique, descriptive <title> (50-60 chars) targeting the page's main keyword."],
  "meta-description": ["Add a compelling meta description (~150 chars) — it drives click-through from search results."],
  "link-text": [
    "Replace generic anchor text ('click here', 'read more') with descriptive text containing target keywords.",
  ],
  "is-crawlable": [
    "Remove noindex from pages that should rank; check robots.txt isn't blocking them.",
    "Verify with the URL Inspection tool in this dashboard.",
  ],
  "robots-txt": ["Fix syntax errors in robots.txt — invalid lines can accidentally block crawling."],
  "image-alt": ["Add descriptive alt text to every meaningful image — helps SEO and screen readers."],
  hreflang: ["Ensure hreflang values are valid locale codes and each variant links back (reciprocal tags)."],
  canonical: ["Point rel=canonical at the correct final URL — one canonical per page, absolute URL."],
  "crawlable-anchors": ["Use real <a href> links for navigation — JS-only click handlers aren't crawlable."],
  "structured-data": ["Validate structured data with Google's Rich Results Test and fix flagged items."],
  "font-size": ["Use at least 12px font sizes on mobile so text is legible without zooming."],
  "tap-targets": ["Make buttons/links at least 48x48px with 8px spacing so they're tappable on mobile."],

  // ---- Accessibility ----
  "color-contrast": [
    "Increase contrast between text and background to at least 4.5:1 (3:1 for large text).",
    "Check the flagged elements below with a contrast checker before/after.",
  ],
  "image-redundant-alt": ["Remove redundant words like 'image of' from alt text."],
  label: ["Associate every form input with a <label for> or aria-label."],
  "button-name": ["Give every button discernible text or an aria-label (icon-only buttons need one)."],
  "link-name": ["Give every link discernible text — icon links need aria-label."],
  "html-has-lang": ["Add lang attribute to <html> (e.g. <html lang=\"en\">)."],
  "aria-allowed-attr": ["Remove ARIA attributes not allowed for the element's role."],
  "heading-order": ["Keep heading levels sequential (h1 → h2 → h3) without skipping."],
  "duplicate-id-aria": ["Make id values referenced by ARIA unique on the page."],
  "meta-viewport": ["Remove user-scalable=no and maximum-scale=1 so users can zoom."],
  "target-size": ["Make touch targets at least 24x24px with adequate spacing."],

  // ---- Best practices ----
  "is-on-https": ["Serve everything over HTTPS and 301-redirect HTTP; fix mixed-content warnings."],
  "errors-in-console": [
    "Open DevTools console on the page and fix logged errors — they often signal broken features.",
  ],
  deprecations: ["Replace deprecated APIs listed below — they can break in future browser releases."],
  "image-aspect-ratio": ["Render images at their natural aspect ratio; fix mismatched width/height attributes."],
  "image-size-responsive": ["Serve images at ≥75% of their displayed pixel size for sharp rendering."],
  "csp-xss": ["Add a Content-Security-Policy header to reduce XSS risk — start with report-only mode."],
  "uses-http2": ["Enable HTTP/2 or HTTP/3 on the server/CDN — it multiplexes requests over one connection."],
  "geolocation-on-start": ["Ask for geolocation on user action, not page load."],
  "notification-on-start": ["Ask for notification permission after a user gesture, not on page load."],
  "no-vulnerable-libraries": ["Update the flagged JS libraries to patched versions."],
  charset: ["Declare <meta charset=\"utf-8\"> as the first element inside <head>."],
  doctype: ["Add <!DOCTYPE html> as the first line so browsers don't use quirks mode."],
  "valid-source-maps": ["Publish valid source maps for deployed JS to ease production debugging."],
  "inspector-issues": ["Open Chrome DevTools → Issues panel on the page and resolve the listed items."],
};

/** Steps for one audit id, or null when we have no curated guide. */
export function getActionSteps(auditId) {
  return PAGESPEED_ACTION_GUIDES[auditId] || null;
}
