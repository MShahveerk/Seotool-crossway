export const HELP_ARTICLES = {
  "cls": {
    title: "Understanding and Optimizing Cumulative Layout Shift (CLS)",
    category: "Page Performance",
    readTime: "4 min read",
    description: "Cumulative Layout Shift (CLS) measures visual stability. Pages with high layout shifts provide frustrating experiences, causing content to move unexpectedly while users try to read or click.",
    content: `
### What is Cumulative Layout Shift (CLS)?
Cumulative Layout Shift (CLS) is a Core Web Vital that tracks how often users experience unexpected layout shifts on a page. It calculates the fraction of the viewport that shifted and the distance elements moved. A good CLS score is **0.1 or lower**.

### Common Causes of Layout Shifts
1. **Images without dimensions:** Browsers don't know how much space to reserve for an image, so it collapses to zero height initially and pushes text down when loaded.
2. **Ads, embeds, and iframes without reserved space:** Dynamically inserted banner ads can push content down.
3. **Dynamically injected content:** Banners, forms, or notices added via Javascript after the page renders.
4. **Web Fonts causing FOIT/FOUT:** Flash of Invisible Text (FOIT) or Flash of Unstyled Text (FOUT) when switching from fallback system fonts to custom web fonts.

### How to Optimize CLS
- **Specify width and height attributes:** Always declare explicit dimensions on images and videos, or use CSS aspect-ratio properties.
- **Reserve space for dynamic elements:** Set a placeholder min-height for ads, wrappers, and widgets.
- **Avoid inserting content above existing content:** Place dynamic banners below the fold or inside pre-allocated boxes.
- **Use CSS font-display: swap:** Ensure fonts load smoothly, or preload critical web fonts to avoid sudden layout shifting.
    `
  },
  "third-party-summary": {
    title: "Reducing and Deferring Third-Party Resources",
    category: "Site Speed",
    readTime: "5 min read",
    description: "Third-party scripts for analytics, ads, chat widgets, and social sharing add network overhead and block the main thread. Learn how to control third-party load impact.",
    content: `
### What are Third-Party Resources?
Third-party scripts are code snippets hosted outside your server that you embed on your page. Common examples include Google Analytics, Facebook Pixel, HubSpot chats, and tracking pixels.

### Why Do They Slow Down Your Page?
- **Network Overhead:** They require extra DNS lookups, SSL connections, and download bandwidth.
- **Render-Blocking:** Many scripts are inserted using synchronous tags, blocking the browser from building the page structure.
- **CPU execution:** Heavy tracking scripts run complex Javascript that hog the browser's main thread, causing laggy scrolling and unresponsive buttons.

### How to Improve Performance
1. **Defer or async scripts:** Add the \`defer\` or \`async\` attribute to script tags so they load in parallel without stopping HTML parsing.
2. **Preconnect to critical domains:** Use link relations like \`<link rel="preconnect" href="https://example.com">\` to warm up connections early.
3. **Lazy-load non-critical embeds:** Load widgets like chat bubbles or Google Maps only when the user scrolls near them.
4. **Audit and prune regularly:** Remove unused tags and pixels inside Google Tag Manager (GTM).
    `
  },
  "defer-3rd-party": {
    title: "Reducing and Deferring Third-Party Resources",
    category: "Site Speed",
    readTime: "5 min read",
    description: "Third-party scripts for analytics, ads, chat widgets, and social sharing add network overhead and block the main thread. Learn how to control third-party load impact.",
    content: `
### What are Third-Party Resources?
Third-party scripts are code snippets hosted outside your server that you embed on your page. Common examples include Google Analytics, Facebook Pixel, HubSpot chats, and tracking pixels.

### Why Do They Slow Down Your Page?
- **Network Overhead:** They require extra DNS lookups, SSL connections, and download bandwidth.
- **Render-Blocking:** Many scripts are inserted using synchronous tags, blocking the browser from building the page structure.
- **CPU execution:** Heavy tracking scripts run complex Javascript that hog the browser's main thread, causing laggy scrolling and unresponsive buttons.

### How to Improve Performance
1. **Defer or async scripts:** Add the \`defer\` or \`async\` attribute to script tags so they load in parallel without stopping HTML parsing.
2. **Preconnect to critical domains:** Use link relations like \`<link rel="preconnect" href="https://example.com">\` to warm up connections early.
3. **Lazy-load non-critical embeds:** Load widgets like chat bubbles or Google Maps only when the user scrolls near them.
4. **Audit and prune regularly:** Remove unused tags and pixels inside Google Tag Manager (GTM).
    `
  },
  "unused-css-rules": {
    title: "Optimizing Unused CSS Rules",
    category: "Code Cleanliness",
    readTime: "3 min read",
    description: "Browsers must download and parse all stylesheet rules before they can start rendering a page. Removing dead CSS rules speeds up visual load.",
    content: `
### What is Unused CSS?
Unused CSS is styling code included in your stylesheets that is not used by any element on the current page. This often happens when you use massive CSS frameworks (like Bootstrap, Tailwind, or Bulma) but only use a tiny fraction of their utility classes.

### How it Impacts Page Loading
Every byte of CSS is **render-blocking**. The browser refuses to display the page content until it has completely downloaded and compiled your styles. Dead code means users wait longer for a blank white screen.

### Best Practices to Fix
- **Use Purging Tools:** For build systems, use tools like PurgeCSS or PostCSS to scan your HTML and JavaScript files, stripping out CSS declarations that aren't actively referenced.
- **Inline Critical CSS:** Inline the styles needed for 'above-the-fold' content directly in the HTML document \`<style>\` block, and defer loading the rest of the stylesheet.
- **Split stylesheets:** Separate layouts (e.g. blog vs dashboard) and load them page-specifically.
    `
  },
  "unused-javascript": {
    title: "Pruning Unused JavaScript Bundles",
    category: "Main Thread",
    readTime: "4 min read",
    description: "Heavy JavaScript bundles increase download size and require intensive CPU parsing. Reducing unused JS keeps the interface responsive.",
    content: `
### What is Unused JavaScript?
Unused JavaScript refers to library imports, obsolete packages, or unreachable code built into your main script bundles that do not execute on the current page.

### The Cost of JavaScript
JavaScript is the most expensive resource on the web. Unlike images, which are decoded quickly, JavaScript must be:
1. Downloaded over the network.
2. Parsed into an Abstract Syntax Tree (AST).
3. Compiled by the browser engine.
4. Executed on the main thread.

### How to Prune Javascript
- **Code Splitting / Dynamic Imports:** Use bundler features (like Webpack or Next.js dynamic imports) to load modules asynchronously only when they are needed.
- **Analyze Bundles:** Use visualizers (like Webpack Bundle Analyzer) to find heavy libraries and replace them with lighter alternatives (e.g. replace Moment.js with Day.js).
- **Remove Dead Code:** Use tree-shaking features of modern bundlers.
    `
  },
  "render-blocking-resources": {
    title: "Eliminating Render-Blocking Resources",
    category: "First Paint",
    readTime: "4 min read",
    description: "External CSS files and JavaScript tags delay the initial paint of the website. Learn how to unblock your critical rendering path.",
    content: `
### What are Render-Blocking Resources?
A render-blocking resource is any external script or stylesheet that prevents the browser from drawing pixels to the screen. By default, browsers read HTML sequentially: when they hit a \`<script>\` or \`<link rel="stylesheet">\`, they halt visual assembly until the resource is fetched and parsed.

### How to Fix
- **Make Scripts Non-Blocking:** Add \`async\` or \`defer\` attributes to script tags.
- **Inline Critical Styles:** Place 'above-the-fold' styles inside the HTML \`<head>\` and load secondary stylesheets asynchronously.
- **Avoid CSS @import:** Use standard \`<link>\` tags instead of CSS \`@import\` statements inside CSS files, as \`@import\` forces sequential, serial downloads.
    `
  },
  "lcp": {
    title: "Optimizing Largest Contentful Paint (LCP)",
    category: "Page Performance",
    readTime: "5 min read",
    description: "Largest Contentful Paint (LCP) measures how long it takes for the main visual element of a page to render. A fast LCP reassures users that the page is loading.",
    content: `
### What is Largest Contentful Paint (LCP)?
LCP is a Core Web Vital that marks the point in the page load timeline when the main content (typically a hero image, video banner, or large text block) has likely loaded. A good LCP score is **2.5 seconds or less**.

### Common Culprits for Slow LCP
- **Slow Server Response Times:** Time to First Byte (TTFB) is high.
- **Render-Blocking CSS/JS:** Visual elements wait for code compilation.
- **Slow Resource Load Times:** Hero images are not compressed or not preloaded.
- **Client-Side Rendering:** Massive JavaScript frameworks must boot before rendering the hero area.

### Optimization Strategies
1. **Preload the LCP Image:** Use \`<link rel="preload" as="image" href="hero.jpg">\` to start downloading the LCP image instantly.
2. **Optimize Hosting and TTFB:** Implement CDNs (like Cloudflare), query caching, and fast server infrastructure.
3. **Compress and Size Images:** Use WebP or AVIF formats and responsive image attributes (\`srcset\`).
4. **Implement Page Caching:** Serve pre-rendered HTML whenever possible.
    `
  },
  "largest-contentful-paint": {
    title: "Optimizing Largest Contentful Paint (LCP)",
    category: "Page Performance",
    readTime: "5 min read",
    description: "Largest Contentful Paint (LCP) measures how long it takes for the main visual element of a page to render. A fast LCP reassures users that the page is loading.",
    content: `
### What is Largest Contentful Paint (LCP)?
LCP is a Core Web Vital that marks the point in the page load timeline when the main content (typically a hero image, video banner, or large text block) has likely loaded. A good LCP score is **2.5 seconds or less**.

### Common Culprits for Slow LCP
- **Slow Server Response Times:** Time to First Byte (TTFB) is high.
- **Render-Blocking CSS/JS:** Visual elements wait for code compilation.
- **Slow Resource Load Times:** Hero images are not compressed or not preloaded.
- **Client-Side Rendering:** Massive JavaScript frameworks must boot before rendering the hero area.

### Optimization Strategies
1. **Preload the LCP Image:** Use \`<link rel="preload" as="image" href="hero.jpg">\` to start downloading the LCP image instantly.
2. **Optimize Hosting and TTFB:** Implement CDNs (like Cloudflare), query caching, and fast server infrastructure.
3. **Compress and Size Images:** Use WebP or AVIF formats and responsive image attributes (\`srcset\`).
4. **Implement Page Caching:** Serve pre-rendered HTML whenever possible.
    `
  },
  "fcp": {
    title: "Speeding Up First Contentful Paint (FCP)",
    category: "First Paint",
    readTime: "3 min read",
    description: "First Contentful Paint (FCP) measures the time it takes for the browser to render the first piece of DOM content. A slow FCP leaves users staring at a blank screen.",
    content: `
### What is First Contentful Paint (FCP)?
FCP tracks the time from when the page starts loading to when any part of the page's content is rendered on the screen. This could be text, an image, or a canvas element. A good FCP is **1.8 seconds or less**.

### Key Ways to Improve FCP
- **Optimize Time to First Byte (TTFB):** Ensure fast database responses and close server locations.
- **Minimize Render-Blocking Resources:** Clean up redundant scripts and CSS.
- **Avoid Redirection Chains:** Every redirect adds network roundtrips, slowing down the initial paint.
- **Use GZIP or Brotli Compression:** Reduce file transfer sizes for HTML, CSS, and Javascript.
    `
  },
  "first-contentful-paint": {
    title: "Speeding Up First Contentful Paint (FCP)",
    category: "First Paint",
    readTime: "3 min read",
    description: "First Contentful Paint (FCP) measures the time it takes for the browser to render the first piece of DOM content. A slow FCP leaves users staring at a blank screen.",
    content: `
### What is First Contentful Paint (FCP)?
FCP tracks the time from when the page starts loading to when any part of the page's content is rendered on the screen. This could be text, an image, or a canvas element. A good FCP is **1.8 seconds or less**.

### Key Ways to Improve FCP
- **Optimize Time to First Byte (TTFB):** Ensure fast database responses and close server locations.
- **Minimize Render-Blocking Resources:** Clean up redundant scripts and CSS.
- **Avoid Redirection Chains:** Every redirect adds network roundtrips, slowing down the initial paint.
- **Use GZIP or Brotli Compression:** Reduce file transfer sizes for HTML, CSS, and Javascript.
    `
  },
  "openpagerank": {
    title: "Understanding PageRank & Domain Authority Metrics",
    category: "Domain Authority",
    readTime: "4 min read",
    description: "Learn how Domain Authority and Open PageRank help estimate a website's credibility and search ranking potential relative to other sites.",
    content: `
### What is Open PageRank?
Open PageRank is an open-source alternative metric based on the original Google PageRank algorithm. It utilizes massive web crawl databases (like Common Crawl) to analyze backlink profiles and assign a score from **0 to 10** (which we scale to 0–100 for consistent SEO reporting).

### Why Backlinks Matter
Search engines view backlinks as 'votes' of confidence. If highly authoritative sites link to your page, it signals to search engines that your content is trustworthy, relevant, and high-quality.

### How to Improve Your Domain Authority
1. **Create High-Quality Linkable Content:** Publish primary data, unique research, or exhaustive guides that others want to cite.
2. **Fix Broken Backlinks:** Find references pointing to dead URLs (404s) on your site and redirect them to active pages.
3. **Prune Bad Backlinks:** Disavow low-quality spam or toxic links that might trigger algorithmic search penalties.
4. **Internal Linking:** Structure your internal links to pass 'link juice' cleanly to core conversion pages.
    `
  },
  "google-ads-api": {
    title: "Configuring the Google Ads Developer API for Keyword Research",
    category: "Developer Guide",
    readTime: "5 min read",
    description: "Instructions on how to generate the developer tokens and customer credentials needed to pull live keyword suggestions and monthly search volumes.",
    content: `
### Google Ads Developer Integration
To fetch high-fidelity, historical search volumes, CPC metrics, and monthly trends inside the Keyword Research panel, you need a Google Ads API connection.

### Step-by-Step Setup Guide
1. **Create a Manager Account:** You must register a Google Ads Manager Account (MCC) if you do not have one.
2. **Apply for a Developer Token:** Go to the API Center in your Google Ads Manager Account and generate a Developer Token. Note that Test Accounts do not need basic access approval.
3. **Obtain OAuth2 Credentials:** Register your app inside the Google Cloud Console, enable the Google Ads API, and generate an OAuth Client ID and Secret.
4. **Configure Environment Variables:** Add the credentials to your app's local configurations:
   - \`GOOGLE_ADS_DEVELOPER_TOKEN\`
   - \`GOOGLE_ADS_CUSTOMER_ID\`
   - \`GOOGLE_ADS_CLIENT_ID\`
   - \`GOOGLE_ADS_CLIENT_SECRET\`
    `
  },
  "general-seo": {
    title: "Actionable SEO Performance Guidelines",
    category: "General SEO",
    readTime: "6 min read",
    description: "A summary of basic search engine optimization principles, web performance audits, and indexation checks for successful organic ranking.",
    content: `
### Essential Pillars of Modern SEO
1. **Crawlability & Indexability:** Ensure sitemaps are valid, robots.txt allows access, and search engines can crawl all critical assets.
2. **On-Page Optimization:** Craft unique titles, headings, and descriptions matching target user search intents.
3. **Core Web Vitals:** Build fast, visually stable pages (low LCP, FCP, CLS) to optimize user satisfaction and ranking factors.
4. **Authority & Trustworthiness:** Acquire citations and high-quality referral links from established industry players.

### Continuous Audit Checklists
- Run a weekly sitemap health check.
- Keep page sizes under 1.5 MB for speedy loading.
- Ensure text contrasts meet accessibility guidelines.
- Monitor Search Console performance charts to detect and address sudden traffic drops or indexation warnings.
    `
  }
};
