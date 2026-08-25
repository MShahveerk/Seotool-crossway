/**
 * Spotlight-tour copy for every workspace section.
 * Step `id` matches `data-guide="{id}"` on the page.
 * `nav` tells the Guide to switch workspace tabs / studio zones / inner tabs
 * before it measures the hole. `pose` picks the mascot sprite.
 */

import { WORKSPACES } from "./workspaces";

const ALIASES = {
  "device-appearance": "website-statistics",
  "query-page-matrix": "website-statistics",
  "sitemap-health": "website-statistics",
  "seo-opportunities": "website-statistics",
  "site-health": "site-intelligence",
  "site-audit": "site-intelligence",
  "site-explorer": "site-intelligence",
  "backlink-profile": "site-intelligence",
  "pagespeed-insights": "site-intelligence",
  "domain-authority": "site-intelligence",
  "seranking-domain": "site-intelligence",
  "seranking-backlinks": "site-intelligence",
  "seranking-audit": "site-intelligence",
  "seranking-explorer": "site-intelligence",
  "keyword-opportunities": "keyword-research",
  "ai-keyword-research": "keyword-research",
  "seranking-keywords": "keyword-research",
  "competitor-matrix": "serp-analysis",
};

const EXTRA_OWNERS = {
  "device-appearance": "search-console",
  "query-page-matrix": "search-console",
  "sitemap-health": "search-console",
  "seo-opportunities": "search-console",
  "site-health": "seo",
  "site-audit": "seo",
  "site-explorer": "seo",
  "backlink-profile": "seo",
  "pagespeed-insights": "seo",
  "domain-authority": "seo",
  "seranking-domain": "seo",
  "seranking-backlinks": "seo",
  "seranking-audit": "seo",
  "seranking-explorer": "seo",
  "keyword-opportunities": "keyword-research",
  "ai-keyword-research": "keyword-research",
  "seranking-keywords": "keyword-research",
  "competitor-matrix": "serp-analysis",
};

function s(id, title, body, pose, nav) {
  return { id, title, body, pose: pose || "help", nav: nav || {} };
}

function withSection(steps, section) {
  return steps.map((step) => ({
    ...step,
    nav: { section, ...step.nav },
  }));
}

const GUIDES = {
  portfolio: {
    title: "All projects",
    steps: [
      s("portfolio-onboard", "Add a website", "Paste the live URL here and it becomes a project. Search Console can be connected after the site exists. Admins can also fetch Meta pages so Facebook accounts show up as their own projects.", "projects"),
      s("portfolio-list", "Your projects", "Every website and social account you can open. Pick one and I follow that project for the rest of the workspace.", "projects"),
      s("portfolio-search", "Find a project", "Filter by name or domain when the list is long. I stay on this page until you open a card.", "projects"),
      s("portfolio-health", "Health snapshot", "Clicks, impressions, and coverage versus the prior period. Blue is up. Red is down.", "projects"),
      s("portfolio-open", "Open a project", "Click a card to enter that project's dashboard and tools. Admin and Knowledge Hub still work with nothing selected.", "projects"),
    ],
  },
  dashboard: {
    title: "Dashboard",
    steps: [
      s("dashboard-clicks", "Clicks", "Search visits that actually landed on the site in this period. A rise here is a win. I paint it blue.", "search"),
      s("dashboard-impressions", "Impressions", "How often your pages showed in Google Search. More impressions is good. Blue if it rose.", "search"),
      s("dashboard-ctr", "Average CTR", "Clicks divided by impressions. Higher means listings earn more visits from the same appearances.", "search"),
      s("dashboard-position", "Average position", "Lower is better in Search. A drop in this number is a win (blue). A rise in spots is worse (red). Example: 8.0 to 10.4 is 2.4 worse.", "search"),
      s("dashboard-queries", "Top queries and pages", "What people search and which URLs they land on. Open Statistics when you want the full tables.", "search"),
    ],
  },
  "website-statistics": {
    title: "Search Console statistics",
    steps: [
      s("gsc-range", "Date range", "Pick the period and an optional comparison. Totals, the chart, and the tables follow whatever you pick.", "search"),
      s("gsc-clicks", "Clicks", "Search visits for the selected dates. Toggle this card to show or hide the series on the chart.", "search"),
      s("gsc-impressions", "Impressions", "How often you appeared in Search. Up is blue, down is red.", "search"),
      s("gsc-ctr", "Average CTR", "Click-through rate for the period. Compare against the previous range when comparison is on.", "search"),
      s("gsc-position", "Average position", "Lower is better. Comparison badges invert so an improved (lower) rank is still blue.", "search"),
      s("gsc-tables", "Pages, countries, queries", "The same totals, broken down by URL, country, and search term.", "search"),
    ],
  },
  "url-inspection": {
    title: "URL Inspection",
    steps: [
      s("inspect-input", "URL", "Paste a page on this property. I read live Search Console coverage for that URL, not a guess.", "search"),
      s("inspect-run", "Inspect", "Runs the check. Results say whether Google can index the page, and why not if it cannot.", "search"),
      s("inspect-result", "Coverage", "Index status, last crawl, and declared canonical. Daily monitored pages sit under this when you refresh.", "search"),
    ],
  },
  "site-intelligence": {
    title: "Site Intelligence",
    steps: [
      s("intel-tabs", "The report", "Audit, performance, and backlinks for the selected site. I will switch these tabs as we go.", "site", { intelTab: "audit" }),
      s("intel-scores", "Scores", "Health and authority figures. Strong scores use brand blue. Poor scores use red.", "site", { intelTab: "audit" }),
      s("intel-issues", "Issues", "Crawl and on-page problems, ordered so the expensive ones sit first.", "site", { intelTab: "audit" }),
      s("intel-authority", "Performance", "Speed and authority metrics for this site. Same project. Different lens.", "site", { intelTab: "authority" }),
      s("intel-backlinks", "Backlinks", "Who links to you, and the explorer for a domain you type. Toggle profile versus explorer here.", "site", { intelTab: "backlinks" }),
      s("intel-export", "Fresh crawl", "Force a new audit from here when the cache is stale. That spends credits. I will hop back to Audit for this.", "site", { intelTab: "audit" }),
    ],
  },
  "seo-autopilot": {
    title: "SEO Autopilot",
    steps: [
      s("auto-brief", "Briefing", "Live site context I use: Search Console, audit, and authority. You can still edit the brand fields after auto-research.", "site", { autoTab: "overview" }),
      s("auto-run", "Run", "Start a pass. I score the site, diagnose, and propose fixes. Nothing publishes without you.", "site"),
      s("auto-agents", "Agents", "Auditor, Diagnoser, Fixer, and the rest. Open a card to read or replace its skill.", "site", { autoTab: "agents" }),
      s("auto-output", "Output", "Scorecards, pitches, and drafts land on these tabs. Check Fixes and Pitches after a run.", "site", { autoTab: "overview" }),
    ],
  },
  "blog-board": {
    title: "Blog board",
    steps: [
      s("board-lanes", "Lanes", "Draft through published. Drag a card to change status. I save the move immediately.", "blogs"),
      s("board-card", "A post", "Double-click to edit. Changes save immediately. If the board is empty, add a draft first.", "blogs"),
      s("board-filter", "This project", "The chip shows which project this board belongs to, and whether live sync is on.", "blogs"),
    ],
  },
  "my-blog-approvals": {
    title: "Blog approvals",
    steps: [
      s("approve-queue", "Your queue", "Blogs waiting on you. Open one to read the draft before you sign off.", "blogs"),
      s("approve-actions", "Approve or decline", "Approve schedules or publishes. Decline sends it back with a reason.", "blogs"),
      s("approve-preview", "Preview", "Read the article as it will appear. Do this before you approve.", "blogs"),
    ],
  },
  "admin-blogs": {
    title: "Create blog",
    steps: [
      s("create-editor", "Editor", "Write or paste the article. Formatting and links stay intact.", "blogs"),
      s("create-meta", "Details", "Title, slug, featured image, and the project it belongs to.", "blogs"),
      s("create-submit", "Send for approval", "Moves the draft into the approval queue. It does not go live from this page.", "blogs"),
    ],
  },
  "blog-autoschedule": {
    title: "Blog autoscheduler",
    steps: [
      s("sched-calendar", "Slots", "When approved blogs are allowed to go live. Pause here if a date needs to hold.", "blogs"),
      s("sched-rules", "Rules", "Cadence, timezone, and which queue feeds the calendar.", "blogs"),
      s("sched-queue", "Upcoming", "The next pieces in line. I do not invent new blogs here. I only place approved ones.", "blogs"),
    ],
  },
  "smm-statistics": {
    title: "Social statistics",
    steps: [
      s("smm-range", "Period", "The month for reach, engagement, and follower change.", "social"),
      s("smm-kpis", "Headline numbers", "Up is blue, down is red. Same language as Search Console.", "social"),
      s("smm-channels", "Channels", "Facebook, Instagram, and the rest, each with its own series.", "social"),
      s("smm-report", "Report", "Download a deck from this period when you need to send it out.", "social"),
    ],
  },
  calendar: {
    title: "Content calendar",
    steps: [
      s("cal-month", "The month", "Posts and blogs plotted on the days they go out.", "social"),
      s("cal-day", "A day", "Click a date to add or inspect items scheduled there.", "social"),
      s("cal-item", "An item", "Status and channel. Open it to edit copy or move the date.", "social"),
    ],
  },
  "post-board": {
    title: "Post board",
    steps: [
      s("board-lanes", "Lanes", "Social posts from idea to published. Drag to change status.", "social"),
      s("board-card", "A post", "Double-click to edit caption, media, and schedule.", "social"),
      s("board-filter", "This project", "Which project this board belongs to, and whether live sync is on.", "social"),
    ],
  },
  "my-approvals": {
    title: "Post approvals",
    steps: [
      s("approve-queue", "Your queue", "Social posts waiting on you.", "social"),
      s("approve-actions", "Approve or decline", "Approve sends it toward publish. Decline returns it with a note.", "social"),
      s("approve-preview", "Preview", "Check caption and creative before you sign off.", "social"),
    ],
  },
  "admin-approvals": {
    title: "Create post",
    steps: [
      s("create-editor", "Caption", "Write the post. Attach images or video on the side.", "social"),
      s("create-meta", "Channel and time", "Where it publishes and when.", "social"),
      s("create-submit", "Send for approval", "Drops it in the approval queue for this project.", "social"),
    ],
  },
  "post-autoschedule": {
    title: "Post autoscheduler",
    steps: [
      s("sched-calendar", "Slots", "Allowed publish windows for social posts.", "social"),
      s("sched-rules", "Rules", "Cadence per channel and timezone.", "social"),
      s("sched-queue", "Upcoming", "What is next in line. Hold a slot if the date needs to move.", "social"),
    ],
  },
  "reports-studio": {
    title: "Report Studio",
    steps: [
      s("report-kind", "Report type", "Website, social, or combined landscape decks. Pick one before you build.", "reports"),
      s("report-month", "Month", "The reporting period. Live data is pulled for that month.", "reports"),
      s("report-build", "Build", "Generates the PDF. Send it from here or download it.", "reports"),
      s("report-history", "Sent reports", "What already went out, so you do not double-send.", "reports"),
    ],
  },
  "keyword-research": {
    title: "Keyword research",
    steps: [
      s("kw-seed", "Seed", "Type a keyword. I expand it from what you give me and the live SERP. I do not invent a library out of thin air.", "keywords", { kwTab: "research", kwView: "research", kwExplore: true }),
      s("kw-run", "Research", "Pulls volume, difficulty, and related terms. This is manual. I do not hunt overnight.", "keywords", { kwTab: "research", kwView: "research", kwExplore: true }),
      s("kw-table", "Results", "Sort by volume or difficulty. Priority is a nudge, not a guarantee.", "keywords", { kwTab: "research", kwView: "research", kwExplore: true }),
      s("kw-export", "Export", "Keyword Ideas has the PDF download after a run. I will open that tab so you can see it.", "keywords", { kwTab: "ideas" }),
    ],
  },
  "serp-analysis": {
    title: "SERP Analysis",
    steps: [
      s("serp-query", "Query", "The search you want a snapshot of. No project required.", "search"),
      s("serp-run", "Analyze", "Fetches the live top results, your rank if you are in them, and competitor pages.", "search"),
      s("serp-you", "Your position", "Where you sit. Above you means someone ranks higher. That is a warning, not a growth badge.", "search"),
      s("serp-move", "How to move up", "Concrete gaps on the pages beating you: headings, speed, missing terms.", "search"),
    ],
  },
  "link-opportunities": {
    title: "Link opportunities",
    steps: [
      s("link-target", "Target", "The keyword and the Google SERP location. Location picks who ranks; leave it blank to detect a city from the keyword.", "links"),
      s("link-run", "Find", "Rows appear as they are found. Extra searches look for directories, resource pages and write-for-us, not only sites your rivals already use. Unpaid means a free route was confirmed.", "links"),
      s("link-list", "Prospects", "Can pitch, unpaid, paid. Domain, origin, overlap, and a reason they are on the list. If you left origin blank, filter here by countries that appear in this result set.", "links"),
    ],
  },
  "blog-automation": {
    title: "Blog Studio",
    steps: [
      s("studio-source", "Topic source", "Relevant world trends first, then overlap with the library, then leftover library keywords. I do not invent terms.", "studio", { zone: "compose" }),
      s("studio-generate", "Generate", "Runs the prefix agents, then the draft. Watch the live rail while it works.", "studio", { zone: "compose" }),
      s("studio-rail", "Live rail", "Each agent as it runs. Open a step to read what it decided.", "studio", { zone: "compose" }),
      s("studio-library", "Library", "Past runs for this project. Re-open one to continue or inspect. I will switch to Library for this.", "studio", { zone: "library" }),
      s("studio-skills", "Skills", "Replace an agent's instructions if you need a house style. Defaults stay until you save.", "studio", { zone: "setup", setupTab: "agents" }),
    ],
  },
  "post-automation": {
    title: "Post Studio",
    steps: [
      s("studio-brief", "Brief", "What the post is about and which channel it is for. A Meta-only project is fine here.", "studio", { zone: "compose" }),
      s("studio-generate", "Generate", "Strategist then copywriter. Output lands in the approval flow, not live.", "studio", { zone: "compose" }),
      s("studio-rail", "Live rail", "Follow each agent. Stop or re-run a step if the angle is wrong.", "studio", { zone: "compose" }),
      s("studio-library", "Library", "Earlier runs for this project. I will open Library so you can see them.", "studio", { zone: "library" }),
    ],
  },
  "user-management": {
    title: "Admin",
    steps: [
      s("admin-users", "People", "Everyone who can sign in. Invite, deactivate, or change a role here.", "admin", { adminTab: "people" }),
      s("admin-access", "Tabs", "People, reports, data sources, automation. I will switch these as we go.", "admin", { adminTab: "people" }),
      s("admin-invite", "Invite", "Creates an account and sends a verification email. They cannot sign in until that link is used.", "admin", { adminTab: "people" }),
      s("admin-sources", "Data sources", "SerpAPI, ranking, and the rest. Keys live here. Be careful.", "admin", { adminTab: "sources" }),
      s("admin-jobs", "Automation", "Scheduled jobs behind reports and pulls. Pause one if a run is misbehaving.", "admin", { adminTab: "automation" }),
    ],
  },
  help: {
    title: "Knowledge Hub",
    steps: [
      s("help-search", "Search", "Find an article by topic. Core Web Vitals, third-party scripts, and the rest.", "help"),
      s("help-list", "Articles", "Short explainers, not the in-page Guide. Use Guide on each tool for how that screen works.", "help"),
      s("help-article", "The article", "Read it here. It does not change your project data.", "help"),
    ],
  },
};

const WORKSPACE_TOURS = {
  "search-console": {
    title: "Search Console",
    steps: [
      ...withSection(GUIDES["website-statistics"].steps, "website-statistics"),
      ...withSection(GUIDES["url-inspection"].steps, "url-inspection"),
    ],
  },
  seo: {
    title: "SEO",
    steps: [
      ...withSection(GUIDES["site-intelligence"].steps, "site-intelligence"),
      ...withSection(GUIDES["seo-autopilot"].steps, "seo-autopilot"),
    ],
  },
  content: {
    title: "Blogs",
    steps: [
      ...withSection(GUIDES["blog-board"].steps, "blog-board"),
      ...withSection(GUIDES["my-blog-approvals"].steps, "my-blog-approvals"),
      ...withSection(GUIDES["admin-blogs"].steps, "admin-blogs"),
      ...withSection(GUIDES["blog-autoschedule"].steps, "blog-autoschedule"),
    ],
  },
  social: {
    title: "Social",
    steps: [
      ...withSection(GUIDES["smm-statistics"].steps, "smm-statistics"),
      ...withSection(GUIDES.calendar.steps, "calendar"),
      ...withSection(GUIDES["post-board"].steps, "post-board"),
      ...withSection(GUIDES["my-approvals"].steps, "my-approvals"),
      ...withSection(GUIDES["admin-approvals"].steps, "admin-approvals"),
      ...withSection(GUIDES["post-autoschedule"].steps, "post-autoschedule"),
    ],
  },
};

const AUTH_GUIDES = {
  "/login": {
    title: "Sign in",
    steps: [
      s("auth-email", "Email", "The address your administrator invited.", "accounts"),
      s("auth-password", "Password", "The one you set after verifying email.", "accounts"),
      s("auth-submit", "Sign in", "Opens the dashboard for the projects you can access.", "accounts"),
    ],
  },
  "/signup": {
    title: "Create account",
    steps: [
      s("auth-name", "Name", "How you appear on approvals and the board.", "accounts"),
      s("auth-email", "Email", "Must match the invite. You will verify it next.", "accounts"),
      s("auth-password", "Password", "At least six characters. Confirm it on the next field.", "accounts"),
      s("auth-submit", "Create", "Sends the verification email. You cannot sign in until that link is used.", "accounts"),
    ],
  },
  "/forgot-password": {
    title: "Reset password",
    steps: [
      s("auth-email", "Email", "I send a reset link only if this address has an account.", "accounts"),
      s("auth-submit", "Send link", "Check your inbox. The link expires, so use it promptly.", "accounts"),
    ],
  },
  "/reset-password": {
    title: "New password",
    steps: [
      s("auth-password", "New password", "Choose something you do not use elsewhere.", "accounts"),
      s("auth-submit", "Save", "Then sign in with the new password.", "accounts"),
    ],
  },
  "/verify-email": {
    title: "Verify email",
    steps: [
      s("auth-submit", "Verify", "This page finishes the invite. If the link expired, ask an administrator to resend it.", "accounts"),
    ],
  },
};

function workspaceForGuide(sectionId) {
  const direct = WORKSPACES.find((w) => w.sections.some((sec) => sec.id === sectionId));
  if (direct) return direct;
  const ownerId = EXTRA_OWNERS[sectionId];
  if (!ownerId) return null;
  return WORKSPACES.find((w) => w.id === ownerId) || null;
}

export function getPageGuide(sectionId) {
  const key = ALIASES[sectionId] || sectionId;
  const ws = workspaceForGuide(key);
  if (ws && ws.sections.length > 1 && WORKSPACE_TOURS[ws.id]) {
    return WORKSPACE_TOURS[ws.id];
  }
  return GUIDES[key] || null;
}

export function guideStartIndex(guide, sectionId) {
  if (!guide?.steps?.length) return 0;
  const key = ALIASES[sectionId] || sectionId;
  const i = guide.steps.findIndex((step) => step.nav?.section === key);
  return i >= 0 ? i : 0;
}

export function getAuthGuide(pathname) {
  const path = String(pathname || "").replace(/\/+$/, "") || "/login";
  return AUTH_GUIDES[path] || AUTH_GUIDES["/login"];
}

export function guideStorageKey(scope) {
  return `roboseo.guide.seen.${scope}`;
}

export function mascotSrc(pose) {
  const allowed = new Set([
    "accounts",
    "projects",
    "search",
    "site",
    "blogs",
    "studio",
    "social",
    "keywords",
    "links",
    "reports",
    "admin",
    "help",
    "point",
    "bible",
  ]);
  const id = allowed.has(pose) ? pose : "help";
  return `/brand/mascot/${id}.png`;
}
