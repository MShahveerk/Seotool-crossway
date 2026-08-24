export const site = {
  name: "RoboSEO.Ai",
  tagline: "SEO and social in one project",
};

export const chapters = [
  {
    id: "arrival",
    kicker: "",
    title: "A machine that watches the search.",
    lead: "Websites and social accounts live here as projects. Rankings, drafts, approvals, and reports share one navy room.",
    paragraphs: [],
    clusters: [],
  },
  {
    id: "what",
    kicker: "What it is",
    title: "SEO and social, in the same breath.",
    lead: "You pick a project. Everything that follows belongs to that project: Search Console, the site audit, the blog board, the social calendar.",
    paragraphs: [
      "A project is a website, a Meta page, or both. It is not a pile of disconnected logins. Open one card on All projects and the rest of the product follows that choice.",
      "Meta-only accounts can still run social: statistics, calendar, board, approvals, Create, autoscheduler, Post Studio. Blog Studio needs a real website. The product will not pretend a Facebook page is a crawlable site.",
      "One accent does the work. Electric blue is live state, a win versus the prior period, and the primary action. Red is a loss, an error, or a destroy. Average position inverts that rule, because a lower number is the win.",
    ],
    clusters: [
      {
        heading: "All projects",
        items: [
          { label: "The list", body: "Every website and social account you can open. Filter by name or domain when the list is long." },
          { label: "Health snapshot", body: "Clicks, impressions, and coverage at a glance on the card. Blue is up versus the prior period. Red is down." },
          { label: "Open", body: "Click a card to enter that project's dashboard and tools. Nothing in the workspace is global except Admin and the Knowledge Hub." },
        ],
      },
      {
        heading: "The dashboard",
        items: [
          { label: "Clicks", body: "Search visits that actually landed on the site in this period." },
          { label: "Impressions", body: "How often your pages showed in Google Search." },
          { label: "Average CTR", body: "Clicks divided by impressions, shown in percentage points against the prior block." },
          { label: "Average position", body: "Lower is better. The badge says worse or better, not a naked plus. A rise of 2.4 spots is 2.4 worse, in red." },
          { label: "Top queries and pages", body: "What people search and which URLs they land on. Open Statistics for the full tables." },
        ],
      },
    ],
  },
  {
    id: "search",
    kicker: "Search Console",
    title: "The numbers Google already has on you.",
    lead: "Statistics pull clicks, impressions, CTR, and average position for a date range you choose. Comparison is optional. The math is not decoration.",
    paragraphs: [
      "Worked example. Last block, average position was 8.0. This block it is 10.4. The delta is +2.4 spots. That is 2.4 worse, painted red. If it had moved from 10.4 to 8.0, the badge would read 2.4 better, in blue. Clicks do not invert: more clicks is blue.",
      "URL Inspection is a separate screen. Paste a page on this property. The result is coverage, last crawl, and the declared canonical. It will not invent rankings. It tells you whether Google can index the page and why not, if it cannot.",
    ],
    clusters: [
      {
        heading: "Statistics",
        items: [
          { label: "Date range", body: "Pick the period and an optional comparison. Totals, charts, and tables follow this range." },
          { label: "Clicks", body: "Search visits for the selected dates. Toggle the card to show or hide this series on the chart." },
          { label: "Impressions", body: "How often you appeared in Search. Up is blue. Down is red." },
          { label: "Average CTR", body: "Click-through rate for the period, compared in percentage points when comparison is on." },
          { label: "Average position", body: "Lower is better. The badge uses spots, not a percent of the rank number. Worse stays red. Better stays blue." },
          { label: "Pages, countries, queries", body: "The same totals, broken down by URL, country, and search term." },
        ],
      },
      {
        heading: "URL Inspection",
        items: [
          { label: "URL", body: "Paste a page on this Search Console property." },
          { label: "Inspect", body: "Reads live coverage for that URL." },
          { label: "Coverage", body: "Index status, last crawl, and declared canonical. The facts you need before chasing rankings." },
        ],
      },
    ],
  },
  {
    id: "site",
    kicker: "The site",
    title: "Health, speed, authority, crawl.",
    lead: "Site Intelligence is one report for the selected website: audit issues, PageSpeed, domain authority, backlinks. Autopilot sits beside it when you want the machine to keep working the same site.",
    paragraphs: [
      "Scores come first. Strong scores use brand blue. Poor scores use red. Issues are ordered so the expensive ones sit on top. Export a PDF when you need to share the current view.",
      "Autopilot is a run against this project's own site, not a generic crawl of the internet. Agents score, diagnose, and propose. Nothing publishes without you.",
    ],
    clusters: [
      {
        heading: "Site Intelligence",
        items: [
          { label: "The report", body: "Audit, speed, authority, and backlinks in one place for the selected site." },
          { label: "Scores", body: "Health and authority figures. Blue is strong. Red is poor." },
          { label: "Issues", body: "Crawl and on-page problems, expensive first." },
          { label: "Export", body: "Download a PDF of the current view." },
        ],
      },
      {
        heading: "SEO Autopilot",
        items: [
          { label: "Briefing", body: "Live site context the agents use: Search Console, audit, and authority." },
          { label: "Run", body: "Start a pass. Agents score the site, diagnose, and propose fixes you can approve." },
          { label: "Agents", body: "Auditor, Diagnoser, Fixer, and the rest. Open a card to read or replace its skill." },
          { label: "Output", body: "Scorecards, pitches, and drafts land here. Nothing publishes without you." },
        ],
      },
    ],
  },
  {
    id: "map",
    kicker: "The map",
    title: "Keywords first. A project is optional.",
    lead: "The toolkit starts from a term or a domain you type. You can open it with nothing selected, or with a Meta page that has no website behind it.",
    paragraphs: [
      "This is the one corner that does not require a website project. Keyword Research, SERP Analysis, and Link Opportunities are a shelf you can pull even when the rest of the workspace is waiting on a site.",
      "Research does not invent terms outside what you give it and the live SERP. That rule is the same rule Blog Studio uses later. The list you take out of research is the list the Decider is allowed to see.",
    ],
    clusters: [
      {
        heading: "Keyword Research",
        items: [
          { label: "Seed", body: "Type a keyword or paste a domain." },
          { label: "Research", body: "Pulls volume, difficulty, and related terms." },
          { label: "Results", body: "Sort by volume or difficulty. Priority is a nudge, not a guarantee." },
          { label: "Export", body: "Download the table when you want it in a sheet." },
        ],
      },
      {
        heading: "SERP Analysis",
        items: [
          { label: "Query", body: "The search you want a snapshot of." },
          { label: "Analyze", body: "Fetches the live top results, your rank if you are in them, and competitor pages." },
          { label: "Your position", body: "Where you sit. Above you is a warning that someone ranks higher, not a growth badge." },
          { label: "How to move up", body: "Concrete gaps on the pages beating you: headings, speed, missing terms." },
        ],
      },
      {
        heading: "Link opportunities",
        items: [
          { label: "Target", body: "The page or domain you want links toward." },
          { label: "Find", body: "Prospects that already rank on related terms or link to similar pages." },
          { label: "Prospects", body: "Domain, overlap, and a reason they are on the list. Export when you are ready to outreach." },
        ],
      },
    ],
  },
  {
    id: "blogs",
    kicker: "Blogs",
    title: "From a closed list to a draft you can refuse.",
    lead: "The blog workspace is a queue for one website project: Board, Approvals, Create, Autoscheduler. Blog Studio is the bench that writes.",
    paragraphs: [
      "The Decider prefers a relevant world trend, then overlap (library×trend or Search Console ∩ library), then leftover library keywords. It does not invent keywords. Leftover bags stay fat. A product that mints a term nobody searched is a product you cannot trust.",
      "Research itself is not on a cron. You run that by hand. Autoscheduler publishes approved pieces into windows you set. It does not go hunting overnight.",
      "Prefix agents run first, then the Writer, then an optional Humanizer. Watch the live rail. If the Humanizer returns empty HTML, the writer draft is kept and a deterministic scrub still runs. The run does not die on a blank model.",
    ],
    clusters: [
      {
        heading: "The queue",
        items: [
          { label: "Board", body: "Draft through published. Drag a card to change status. Double-click to edit. Changes save immediately." },
          { label: "Approvals", body: "A person signs off. Approve schedules or publishes. Decline sends it back with a reason. Email quick-actions exist for the same decision." },
          { label: "Create", body: "A human still starts a post when the machine should not. Title, slug, featured image, and the project it belongs to." },
          { label: "Autoscheduler", body: "Slots, cadence, timezone, and which queue feeds the calendar. Pause a date if you need to hold it." },
        ],
      },
      {
        heading: "Blog Studio",
        items: [
          { label: "Topic source", body: "Relevant world trends first, then overlap with the library, then leftover library keywords. Closed list only." },
          { label: "Generate", body: "Prefix agents, then the draft. Watch the live rail while it works." },
          { label: "Live rail", body: "Each agent as it runs. Open a step to read what it decided." },
          { label: "Library", body: "Past runs for this project. Re-open one to continue or inspect." },
          { label: "Skills", body: "Replace an agent's instructions if you need a house style. Defaults stay until you save." },
          { label: "Humanizer", body: "Optional rewrite plus a deterministic scrub of stock phrasing. Empty model output keeps the writer HTML." },
        ],
      },
    ],
  },
  {
    id: "social",
    kicker: "Social",
    title: "The same discipline, for the channels.",
    lead: "Statistics, calendar, board, approvals, Create, autoscheduler. Post Studio is the bench: a brief, a channel, a strategist, a copywriter.",
    paragraphs: [
      "Output lands in approval, not live. Stop or re-run a step if the angle is wrong. The library keeps earlier runs for this project.",
      "Headline numbers use the same language as Search Console. Up is blue. Down is red. Facebook, Instagram, and the rest each have their own series.",
    ],
    clusters: [
      {
        heading: "The social workspace",
        items: [
          { label: "Statistics", body: "Period, reach, engagement, follower change. Build a slide deck from this window when you need to send it out." },
          { label: "Calendar", body: "Posts and blogs plotted on the days they go out. Click a date to add or inspect." },
          { label: "Board", body: "Social posts from idea to published. Drag to change status. Double-click to edit caption, media, and schedule." },
          { label: "Approvals", body: "The same refuse-or-ship motion as blogs. Preview caption and creative before you sign off." },
          { label: "Create", body: "Write the post. Attach images or video. Choose channel and time. Send for approval." },
          { label: "Autoscheduler", body: "Allowed publish windows per channel and timezone. Hold a slot if the date needs to move." },
        ],
      },
      {
        heading: "Post Studio",
        items: [
          { label: "Brief", body: "What the post is about and which channel it is for." },
          { label: "Generate", body: "Strategist then copywriter. Output lands in the approval flow, not live." },
          { label: "Live rail", body: "Follow each agent. Stop or re-run a step if the angle is wrong." },
          { label: "Library", body: "Earlier runs for this project." },
        ],
      },
    ],
  },
  {
    id: "reports",
    kicker: "Reports and people",
    title: "A pack you can send. A door you can close.",
    lead: "Report Studio builds a designed pack for the selected project. Admin is the installation itself: who can sign in, which projects they may open, which tools they may use.",
    paragraphs: [
      "The robot mark sits in the header of the PDF and the slide deck. Live data is pulled for the month you pick. Sent reports stay in history so you do not double-send.",
      "Access is a list of projects and tools, not a rumour. Invite creates an account and sends a verification email. You cannot sign in until that link is used.",
    ],
    clusters: [
      {
        heading: "Report Studio",
        items: [
          { label: "Report type", body: "Website, social, or combined landscape decks." },
          { label: "Month", body: "The reporting period. Live data is pulled for that month." },
          { label: "Build", body: "Generates the PDF. Send it from here or download it." },
          { label: "Sent reports", body: "What already went out." },
        ],
      },
      {
        heading: "Admin",
        items: [
          { label: "People", body: "Everyone who can sign in. Invite, deactivate, or change a role." },
          { label: "Access", body: "Which projects and tools a person can open." },
          { label: "Invite", body: "Creates an account and sends a verification email." },
        ],
      },
    ],
  },
  {
    id: "guide",
    kicker: "How you learn it",
    title: "A hole in the dark, over the control.",
    lead: "Guide is not a knowledge-base article. It is a spotlight on this screen: the metric, the date range, the Generate button.",
    paragraphs: [
      "Next moves the hole. The label stays on the page. Esc closes it. If a target is missing, the dim stays and the card sits in the centre. There is never a hanging label with no hole.",
      "Knowledge Hub is separate. Longer explainers live there. They do not change project data. Use Guide on each tool for how that screen works.",
    ],
    clusters: [
      {
        heading: "Guide",
        items: [
          { label: "On the workspace", body: "Header, right side. One Guide per section." },
          { label: "On sign-in", body: "A shorter tour for login, signup, and reset." },
          { label: "The hole", body: "A cutout over the control, plus a measured card clamped inside the viewport." },
        ],
      },
      {
        heading: "Knowledge Hub",
        items: [
          { label: "Search", body: "Find an article by topic: Core Web Vitals, third-party scripts, and the rest." },
          { label: "Articles", body: "Short explainers, not the in-page Guide." },
          { label: "The article", body: "Read it here. It does not change your project data." },
        ],
      },
    ],
  },
  {
    id: "limits",
    kicker: "Limits",
    title: "What it will not pretend to do.",
    lead: "A product that invents keywords is a product you cannot trust. RoboSEO.Ai would rather leave a bag fat than mint a term nobody searched.",
    paragraphs: [
      "These are not roadmap hedges. They are the rules the machine already follows. If a vendor promises the opposite, they are selling a different product.",
    ],
    clusters: [
      {
        heading: "The rules we keep",
        items: [
          { label: "Closed list", body: "The Decider prefers relevant world trends, then overlap, then the library. It never invents a term." },
          { label: "No research cron", body: "Keyword research runs when you ask. Autoscheduler publishes. It does not go hunting overnight." },
          { label: "Website for blogs", body: "Blog Studio needs a website project. A Meta-only account is not enough." },
          { label: "Approvals stay human", body: "Studio output waits. It does not post itself because a model felt confident." },
        ],
      },
    ],
    footer: "RoboSEO.Ai. AI powered SEO and SMM automation.",
  },
];
