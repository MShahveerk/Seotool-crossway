export const SAY = {
  intro: "Hi. I am the robot on the mark. Scroll and I will walk you through every screen.",
  "sign-in": "Stop. You cannot sign in until an admin invites you. I checked.",
  "all-projects": "Pick a card. I stick to that project for the rest of the workspace.",
  dashboard: "These four tiles are the health check. Position is the sneaky one. Lower is better.",
  "gsc-statistics": "Search Console, full tables. The date range at the top drives every number here.",
  "url-inspection": "Paste one URL. I will tell you if Google can index it, and why not.",
  "site-intelligence": "Audit, speed, authority, backlinks. One report. Not four products.",
  autopilot: "I score, diagnose, and draft. I do not publish until you say so.",
  "blog-board": "Drag a card to change status. Double-click to edit. That is the whole board.",
  "blog-approvals": "If a draft is waiting on you, it is in this queue. Approve or send it back.",
  "create-blog": "Write it here, then send it for approval. It does not go live from this page.",
  "blog-autoscheduler": "Approved blogs wait for a slot. Pause here if a date needs to hold.",
  "blog-studio-compose": "This is Compose. Generate lives here. Library and Setup are the other zones.",
  "blog-studio-research": "Research is manual. I do not hunt overnight. You run it.",
  "blog-studio-prefix": "World trends first, then overlap, then leftover library. I do not invent keywords.",
  "blog-studio-setup": "Agents, brand, assets, autopilot. This is the studio's back room.",
  "smm-statistics": "Reach, engagement, followers. Blue is up. Red is down. Same language as Search.",
  calendar: "Blogs and posts on the days they go out. Click a day to inspect it.",
  "post-board": "Social posts, idea to published. Same drag rules as the blog board.",
  "post-approvals": "Your social queue. Approve sends it toward publish.",
  "create-post": "Caption, media, channel, then send for approval.",
  "post-autoscheduler": "Approved posts fill the slots you set. I do not invent new posts here.",
  "post-studio": "Post Studio writes into the selected project. A Meta-only project is fine.",
  "keyword-research": "No project required. Seed a term. I expand it. I do not guess.",
  "serp-analysis": "Your position, who sits above you, who you can move. Run it on a query.",
  "link-opportunities": "Prospects you can actually pitch. Not a dump of every linker.",
  "report-studio": "Build the deck from the period you already ran. Then send it.",
  admin: "People, access, data sources, automation. Keys live here. Be careful.",
  guide: "In the product, tap Guide on a screen and I walk the controls. This page is the full manual.",
  "knowledge-hub": "Search the articles. There is not a second manual hiding behind this.",
  rules: "Electric blue is a win. Red is a loss. Position inverts: a rise in spots is worse.",
};

export const NUDGE = ["This one.", "Here.", "Read this.", "Yes. This bit."];

export function defaultTarget(chapterId) {
  return chapterId === "intro" ? "title" : "lead";
}

export function lineFor(chapterId) {
  return SAY[chapterId] || SAY.intro;
}

export function nudgeFor(index) {
  return NUDGE[index % NUDGE.length];
}
