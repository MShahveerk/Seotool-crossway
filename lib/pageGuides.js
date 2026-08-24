/**
 * Spotlight-tour copy for every workspace section.
 * Step `id` matches `data-guide="{id}"` on the page. Missing targets still
 * show the same card, centered, so a tour never silently skips.
 */

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

function s(id, title, body) {
  return { id, title, body };
}

const GUIDES = {
  portfolio: {
    title: "All projects",
    steps: [
      s("portfolio-list", "Your projects", "Every website and social account you can open. Pick one to work inside it."),
      s("portfolio-search", "Find a project", "Filter by name or domain when the list is long."),
      s("portfolio-health", "Health snapshot", "Clicks, impressions, and coverage at a glance. Blue means up versus the prior period; red means down."),
      s("portfolio-open", "Open a project", "Click a card to enter that project's dashboard and tools."),
    ],
  },
  dashboard: {
    title: "Dashboard",
    steps: [
      s("dashboard-clicks", "Clicks", "Search visits that actually landed on the site in this period."),
      s("dashboard-impressions", "Impressions", "How often your pages showed in Google Search. A rise here is good — it shows in blue."),
      s("dashboard-ctr", "Average CTR", "Clicks divided by impressions. Higher means listings earn more visits."),
      s("dashboard-position", "Average position", "Lower is better in Search. A drop in this number is a win (blue); a rise is worse (red)."),
      s("dashboard-queries", "Top queries & pages", "What people search and which URLs they land on. Open Statistics for the full tables."),
    ],
  },
  "website-statistics": {
    title: "Search Console statistics",
    steps: [
      s("gsc-range", "Date range", "Pick the period and an optional comparison. Totals and charts follow this range."),
      s("gsc-clicks", "Clicks", "Search visits for the selected dates. Toggle the card to show or hide this series on the chart."),
      s("gsc-impressions", "Impressions", "How often you appeared in Search. Up is blue, down is red."),
      s("gsc-ctr", "Average CTR", "Click-through rate for the period. Compare against the previous range when comparison is on."),
      s("gsc-position", "Average position", "Lower is better. Comparison badges invert so an improved (lower) rank is still blue."),
      s("gsc-tables", "Pages, countries, queries", "Break the same totals down by URL, country, and search term."),
    ],
  },
  "url-inspection": {
    title: "URL Inspection",
    steps: [
      s("inspect-input", "URL", "Paste a page on this property. Inspection reads live Search Console coverage for that URL."),
      s("inspect-run", "Inspect", "Runs the check. Results say whether Google can index the page and why not, if it cannot."),
      s("inspect-result", "Coverage", "Index status, last crawl, and declared canonical — the facts you need before chasing rankings."),
    ],
  },
  "site-intelligence": {
    title: "Site Intelligence",
    steps: [
      s("intel-tabs", "The report", "One place for audit, speed, authority, and backlinks for the selected site."),
      s("intel-scores", "Scores", "Health and authority figures. Strong scores use brand blue; poor scores use red."),
      s("intel-issues", "Issues", "Crawl and on-page problems, ordered so the expensive ones sit first."),
      s("intel-export", "Export", "Download a PDF of the current view when you need to share it."),
    ],
  },
  "seo-autopilot": {
    title: "SEO Autopilot",
    steps: [
      s("auto-brief", "Briefing", "Live site context the agents use: Search Console, audit, and authority."),
      s("auto-run", "Run", "Start a pass. Agents score the site, diagnose, and propose fixes you can approve."),
      s("auto-agents", "Agents", "Auditor, Diagnoser, Fixer, and the rest. Open a card to read or replace its skill."),
      s("auto-output", "Output", "Scorecards, pitches, and drafts land here. Nothing publishes without you."),
    ],
  },
  "blog-board": {
    title: "Blog board",
    steps: [
      s("board-lanes", "Lanes", "Draft through published. Drag a card to change status."),
      s("board-card", "A post", "Double-click to edit. Changes save immediately."),
      s("board-filter", "Filters", "Narrow by assignee, site, or status when the board is busy."),
    ],
  },
  "my-blog-approvals": {
    title: "Blog approvals",
    steps: [
      s("approve-queue", "Your queue", "Blogs waiting on you. Open one to read the draft."),
      s("approve-actions", "Approve or decline", "Approve schedules or publishes. Decline sends it back with a reason."),
      s("approve-preview", "Preview", "Read the article as it will appear before you sign off."),
    ],
  },
  "admin-blogs": {
    title: "Create blog",
    steps: [
      s("create-editor", "Editor", "Write or paste the article. Formatting and links stay intact."),
      s("create-meta", "Details", "Title, slug, featured image, and the project it belongs to."),
      s("create-submit", "Send for approval", "Moves the draft into the approval queue for this project."),
    ],
  },
  "blog-autoschedule": {
    title: "Blog autoscheduler",
    steps: [
      s("sched-calendar", "Slots", "When approved blogs are allowed to go live."),
      s("sched-rules", "Rules", "Cadence, timezone, and which queue feeds the calendar."),
      s("sched-queue", "Upcoming", "The next pieces in line. Pause here if you need to hold a date."),
    ],
  },
  "smm-statistics": {
    title: "Social statistics",
    steps: [
      s("smm-range", "Period", "The window for reach, engagement, and follower change."),
      s("smm-kpis", "Headline numbers", "Up is blue, down is red — same language as Search Console."),
      s("smm-channels", "Channels", "Facebook, Instagram, and the rest, each with its own series."),
      s("smm-report", "Report", "Build a slide deck from this period when you need to send it out."),
    ],
  },
  calendar: {
    title: "Content calendar",
    steps: [
      s("cal-month", "The month", "Posts and blogs plotted on the days they go out."),
      s("cal-day", "A day", "Click a date to add or inspect items scheduled there."),
      s("cal-item", "An item", "Status and channel. Open it to edit copy or move the date."),
    ],
  },
  "post-board": {
    title: "Post board",
    steps: [
      s("board-lanes", "Lanes", "Social posts from idea to published. Drag to change status."),
      s("board-card", "A post", "Double-click to edit caption, media, and schedule."),
      s("board-filter", "Filters", "Channel, assignee, or status when the board is full."),
    ],
  },
  "my-approvals": {
    title: "Post approvals",
    steps: [
      s("approve-queue", "Your queue", "Social posts waiting on you."),
      s("approve-actions", "Approve or decline", "Approve sends it toward publish. Decline returns it with a note."),
      s("approve-preview", "Preview", "Check caption and creative before you sign off."),
    ],
  },
  "admin-approvals": {
    title: "Create post",
    steps: [
      s("create-editor", "Caption", "Write the post. Attach images or video on the side."),
      s("create-meta", "Channel & time", "Where it publishes and when."),
      s("create-submit", "Send for approval", "Drops it in the approval queue for this project."),
    ],
  },
  "post-autoschedule": {
    title: "Post autoscheduler",
    steps: [
      s("sched-calendar", "Slots", "Allowed publish windows for social posts."),
      s("sched-rules", "Rules", "Cadence per channel and timezone."),
      s("sched-queue", "Upcoming", "What is next in line. Hold a slot if the date needs to move."),
    ],
  },
  "reports-studio": {
    title: "Report Studio",
    steps: [
      s("report-kind", "Report type", "Website, social, or combined landscape decks."),
      s("report-month", "Month", "The reporting period. Live data is pulled for that month."),
      s("report-build", "Build", "Generates the PDF. Send it from here or download it."),
      s("report-history", "Sent reports", "What already went out, so you do not double-send."),
    ],
  },
  "keyword-research": {
    title: "Keyword research",
    steps: [
      s("kw-seed", "Seed", "Type a keyword or paste a domain. Research does not invent terms outside what you give it and the live SERP."),
      s("kw-run", "Research", "Pulls volume, difficulty, and related terms."),
      s("kw-table", "Results", "Sort by volume or difficulty. Priority is a nudge, not a guarantee."),
      s("kw-export", "Export", "Download the table when you want it in a sheet."),
    ],
  },
  "serp-analysis": {
    title: "SERP Analysis",
    steps: [
      s("serp-query", "Query", "The search you want a snapshot of."),
      s("serp-run", "Analyze", "Fetches the live top results, your rank if you are in them, and competitor pages."),
      s("serp-you", "Your position", "Where you sit. “Above you” is a warning that someone ranks higher — not a growth badge."),
      s("serp-move", "How to move up", "Concrete gaps on the pages beating you: headings, speed, missing terms."),
    ],
  },
  "link-opportunities": {
    title: "Link opportunities",
    steps: [
      s("link-target", "Target", "The page or domain you want links toward."),
      s("link-run", "Find", "Prospects that already rank on related terms or link to similar pages."),
      s("link-list", "Prospects", "Domain, overlap, and a reason they are on the list. Export when you are ready to outreach."),
    ],
  },
  "blog-automation": {
    title: "Blog Studio",
    steps: [
      s("studio-source", "Topic source", "Relevant world trends first, then overlap with the library, then leftover library keywords. The Decider does not invent terms."),
      s("studio-generate", "Generate", "Runs the prefix agents, then the draft. Watch the live rail while it works."),
      s("studio-rail", "Live rail", "Each agent as it runs. Open a step to read what it decided."),
      s("studio-library", "Library", "Past runs for this project. Re-open one to continue or inspect."),
      s("studio-skills", "Skills", "Replace an agent's instructions if you need a house style. Defaults stay until you save."),
    ],
  },
  "post-automation": {
    title: "Post Studio",
    steps: [
      s("studio-brief", "Brief", "What the post is about and which channel it is for."),
      s("studio-generate", "Generate", "Strategist then copywriter. Output lands in the approval flow, not live."),
      s("studio-rail", "Live rail", "Follow each agent. Stop or re-run a step if the angle is wrong."),
      s("studio-library", "Library", "Earlier runs for this project."),
    ],
  },
  "user-management": {
    title: "Admin",
    steps: [
      s("admin-users", "People", "Everyone who can sign in. Invite, deactivate, or change a role here."),
      s("admin-access", "Access", "Which projects and tools a person can open."),
      s("admin-invite", "Invite", "Creates an account and sends a verification email."),
    ],
  },
  help: {
    title: "Knowledge Hub",
    steps: [
      s("help-search", "Search", "Find an article by topic — Core Web Vitals, third-party scripts, and the rest."),
      s("help-list", "Articles", "Short explainers, not the in-page Guide. Use Guide on each tool for how that screen works."),
      s("help-article", "The article", "Read it here. It does not change your project data."),
    ],
  },
};

const AUTH_GUIDES = {
  "/login": {
    title: "Sign in",
    steps: [
      s("auth-email", "Email", "The address your administrator invited."),
      s("auth-password", "Password", "The one you set after verifying email."),
      s("auth-submit", "Sign in", "Opens the dashboard for the projects you can access."),
    ],
  },
  "/signup": {
    title: "Create account",
    steps: [
      s("auth-name", "Name", "How you appear on approvals and the board."),
      s("auth-email", "Email", "Must match the invite. You will verify it next."),
      s("auth-password", "Password", "At least six characters. Confirm it on the next field."),
      s("auth-submit", "Create", "Sends the verification email. You cannot sign in until that link is used."),
    ],
  },
  "/forgot-password": {
    title: "Reset password",
    steps: [
      s("auth-email", "Email", "We send a reset link only if this address has an account."),
      s("auth-submit", "Send link", "Check your inbox. The link expires, so use it promptly."),
    ],
  },
  "/reset-password": {
    title: "New password",
    steps: [
      s("auth-password", "New password", "Choose something you do not use elsewhere."),
      s("auth-submit", "Save", "Then sign in with the new password."),
    ],
  },
  "/verify-email": {
    title: "Verify email",
    steps: [
      s("auth-submit", "Verify", "This page finishes the invite. If the link expired, ask an administrator to resend it."),
    ],
  },
};

export function getPageGuide(sectionId) {
  const key = ALIASES[sectionId] || sectionId;
  return GUIDES[key] || GUIDES.dashboard;
}

export function getAuthGuide(pathname) {
  const path = String(pathname || "").replace(/\/+$/, "") || "/login";
  return AUTH_GUIDES[path] || AUTH_GUIDES["/login"];
}

export function guideStorageKey(scope) {
  return `roboseo.guide.seen.${scope}`;
}
