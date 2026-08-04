/**
 * Step-by-step deploy guides used when the Fixer model omits deployGuides,
 * and as UI fallbacks for older artifacts.
 */

export function buildFallbackGuides(siteUrl = "") {
  const origin = String(siteUrl || "").replace(/\/$/, "") || "https://yoursite.com";
  return [
    {
      id: "robots_txt",
      title: "Allow AI crawlers in robots.txt",
      purpose:
        "Many AI search bots honor robots.txt. Explicitly allowing GPTBot, ClaudeBot, PerplexityBot, and OAI-SearchBot makes your pages eligible for citation.",
      where: `${origin}/robots.txt (site root) — or your CMS SEO plugin’s robots editor`,
      difficulty: "Easy",
      platforms: ["WordPress (Yoast/Rank Math)", "Next.js /public", "Shopify", "Webflow", "Any host"],
      steps: [
        `Open ${origin}/robots.txt in a browser. If it 404s, create a new file named robots.txt at the web root.`,
        "WordPress: SEO → tools/robots.txt (Yoast/Rank Math) and paste the Autopilot payload. Save.",
        "Next.js: create public/robots.txt with the payload, commit, and redeploy.",
        "Shopify: Online Store → Themes → Edit code → add/edit templates/robots.txt.liquid (or use an SEO app).",
        "Keep existing Sitemap: lines. Do not wipe Disallow rules you still need for admin/private paths.",
        "Merge Autopilot’s User-agent allow blocks for GPTBot, ClaudeBot, PerplexityBot, and OAI-SearchBot.",
      ],
      verify: `Revisit ${origin}/robots.txt and confirm the AI bot User-agent blocks appear publicly.`,
      caution: "Never Disallow: / globally. Only block private areas (wp-admin, cart, account).",
    },
    {
      id: "llms_txt",
      title: "Publish llms.txt at the site root",
      purpose:
        "llms.txt is a short “menu” for AI systems: who you are, what you sell, and which URLs to trust. It improves accurate brand mentions and citations.",
      where: `${origin}/llms.txt`,
      difficulty: "Easy",
      platforms: ["Any static host", "Next.js /public", "WordPress (root upload / redirect)", "CDN"],
      steps: [
        "Copy the Autopilot llms.txt payload and replace placeholders with your real brand name and best URLs.",
        "Upload as a plain-text file named llms.txt at the site root (same level as robots.txt).",
        "Next.js: save as public/llms.txt and redeploy.",
        "WordPress: upload via hosting file manager to public_html, or map a static file plugin/redirect.",
        "Ensure Content-Type is text/plain and the URL is publicly crawlable (no login wall).",
      ],
      verify: `Open ${origin}/llms.txt — you should see markdown-like headings and links, not an HTML 404 page.`,
      caution: "Link only to pages you want AI to summarize. Avoid staging/private URLs.",
    },
    {
      id: "faq_schema",
      title: "Add FAQ JSON-LD structured data",
      purpose:
        "FAQ schema tells Google (and AI systems that consume markup) which Q&A pairs are authoritative on the page — boosting rich results and citation readiness.",
      where: "Inside the <head> or end of <body> on the target FAQ / service page",
      difficulty: "Medium",
      platforms: ["WordPress", "Next.js", "Shopify", "Webflow", "Tag Manager (advanced)"],
      steps: [
        "Pick one high-intent page (service, pricing FAQ, or cornerstone guide).",
        "WordPress: use Rank Math / Yoast schema, or a “Header & Footer” plugin → Scripts → insert <script type=\"application/ld+json\">…</script> with the Autopilot JSON.",
        "Next.js: add a <script type=\"application/ld+json\" dangerouslySetInnerHTML={{ __html: JSON.stringify(...) }} /> in the page component, or use next/script.",
        "Shopify: Online Store → Themes → Edit code → theme.liquid or the template for that page; paste before </body>.",
        "Validate questions match visible on-page FAQ text (Google expects consistency).",
      ],
      verify: "Paste the page URL into Google’s Rich Results Test and confirm FAQ is detected without errors.",
      caution: "Do not mark up FAQ that is not visible to users. Keep 3–8 real Q&As.",
    },
    {
      id: "answer_block",
      title: "Add a citable answer block on-page",
      purpose:
        "AI engines prefer short, self-contained answers near the top of a page. This block is designed to be quoted with your brand attached.",
      where: "Target page from the Fixer card (usually below H1 / above the fold)",
      difficulty: "Easy",
      platforms: ["WordPress editor", "Next.js page", "CMS WYSIWYG"],
      steps: [
        "Open the page URL listed on the Fixer card.",
        "Paste the citable answer as a short paragraph (40–80 words) directly under the H1 or in a callout.",
        "Update the meta description with the provided meta line (SEO plugin or CMS SEO fields).",
        "Optionally wrap the answer in a clearly labeled section (e.g. “Quick answer”).",
        "Internal-link once from a related blog or homepage to this page.",
      ],
      verify: "View source / preview — answer text is visible, unique, and matches the meta theme.",
      caution: "Do not keyword-stuff. Keep one clear claim you can defend.",
    },
    {
      id: "answer_block_1",
      title: "Citable answer block #1",
      purpose: "First priority citable paragraph for an AI / buyer question.",
      where: "Page URL on the matching Fixer answer card",
      difficulty: "Easy",
      platforms: ["WordPress", "Next.js", "Any CMS"],
      steps: [
        "Open the answer card’s page URL.",
        "Paste the citable answer under the H1.",
        "Apply the meta description.",
        "Publish and request indexing in Search Console if the page is new.",
      ],
      verify: "Page live with the new paragraph and meta.",
      caution: "",
    },
  ];
}

export function mergeDeployGuides(modelGuides, siteUrl) {
  const fallback = buildFallbackGuides(siteUrl);
  const byId = new Map();
  for (const g of fallback) byId.set(g.id, g);
  for (const g of Array.isArray(modelGuides) ? modelGuides : []) {
    if (!g?.id) continue;
    const base = byId.get(g.id) || {};
    byId.set(g.id, {
      ...base,
      ...g,
      steps: Array.isArray(g.steps) && g.steps.length ? g.steps : base.steps || [],
      platforms: Array.isArray(g.platforms) && g.platforms.length ? g.platforms : base.platforms || [],
      purpose: g.purpose || base.purpose,
      where: g.where || base.where,
      verify: g.verify || base.verify,
      title: g.title || base.title,
    });
  }
  return Array.from(byId.values());
}
