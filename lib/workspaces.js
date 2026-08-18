/**
 * Workspace navigation model.
 *
 * The sidebar used to list ~30 tools across 6 collapsible groups, which made
 * finding anything a scavenger hunt. Instead the sidebar now lists a handful of
 * *workspaces*, and the tools inside a workspace appear as tabs on the page.
 *
 * Section ids are unchanged, so permissions (`modulePermissions`), deep links
 * (`?section=…`) and the existing router switch all keep working exactly as they
 * did. This file only describes how they're grouped and labelled in the nav.
 *
 * Tab labels are deliberately short — the workspace already supplies the noun,
 * so "SEO › Site Audit" doesn't need to repeat itself.
 *
 * Two independent axes, deliberately not collapsed into one:
 *
 * `scope` — does this need a project at all?
 *   project  — reads the selected project's own data.
 *   global   — keyword- or domain-first research that stands on its own. A
 *              project can still be picked *inside* the tool to prefill a
 *              target, but it never gates access.
 *   platform — runs the installation itself, belongs to neither.
 *
 * `group` — which sidebar rail it appears under. The studios are project-scoped
 * machinery but belong next to the research tools in the Toolkit, so nav
 * position and data scope have to be separate fields.
 *
 * `requires` — the selection a project workspace needs before its tabs mean
 * anything: `"website"` for a real Search Console property, `"project"` for any
 * project including a Meta-only one.
 */

export const SCOPES = { PROJECT: "project", GLOBAL: "global", PLATFORM: "platform" };
export const GROUPS = { PROJECT: "project", TOOLKIT: "toolkit", PLATFORM: "platform" };

export const WORKSPACES = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: "dashboard",
    scope: SCOPES.PROJECT,
    group: GROUPS.PROJECT,
    /* This is one project's dashboard. The all-projects view is its own entry
       above the rail, so there's nothing for this to show unselected. */
    requires: "project",
    /** Single-section workspaces render no tab rail. */
    sections: [{ id: "dashboard", label: "Overview" }],
  },
  {
    id: "search-console",
    label: "Search Console",
    icon: "globe",
    scope: SCOPES.PROJECT,
    group: GROUPS.PROJECT,
    requires: "website",
    sections: [
      { id: "website-statistics", label: "Statistics" },
      { id: "url-inspection", label: "URL Inspection" },
    ],
  },
  {
    id: "seo",
    label: "SEO",
    icon: "search",
    scope: SCOPES.PROJECT,
    group: GROUPS.PROJECT,
    /* What's left here reads the selected project's own site: its audit, its
       authority, its autopilot runs. The keyword/SERP/outreach tools that only
       need a keyword moved to the Toolkit. */
    requires: "website",
    sections: [
      { id: "site-intelligence", label: "Site Intelligence" },
      { id: "seo-autopilot", label: "Autopilot" },
    ],
  },
  {
    id: "content",
    label: "Blogs",
    icon: "fileText",
    scope: SCOPES.PROJECT,
    group: GROUPS.PROJECT,
    /* Every tab here is a queue of one project's posts, so an unselected
       sidebar would only ever show an empty board. */
    requires: "project",
    /* Read left to right as the work moves: survey, review, make, then hand it
       to the machine. Autoscheduler sits last because it's set-and-forget. */
    sections: [
      { id: "blog-board", label: "Board" },
      { id: "my-blog-approvals", label: "Approvals" },
      { id: "admin-blogs", label: "Create" },
      { id: "blog-autoschedule", label: "Autoscheduler" },
    ],
  },
  {
    id: "social",
    label: "Social",
    icon: "megaphone",
    scope: SCOPES.PROJECT,
    group: GROUPS.PROJECT,
    requires: "project",
    sections: [
      { id: "smm-statistics", label: "Statistics" },
      { id: "calendar", label: "Calendar" },
      { id: "post-board", label: "Board" },
      { id: "my-approvals", label: "Approvals" },
      { id: "admin-approvals", label: "Create" },
      { id: "post-autoschedule", label: "Autoscheduler" },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    icon: "presentation",
    scope: SCOPES.PROJECT,
    group: GROUPS.PROJECT,
    requires: "project",
    sections: [{ id: "reports-studio", label: "Report Studio" }],
  },

  /* Toolkit — the workbenches. The three research tools start from a keyword or
     a domain you type in, so they're global: usable with nothing selected, and
     usable when the selected project is a Meta page with no website behind it.
     The studios sit here too because they're the same kind of thing (a bench you
     go to and operate) even though they write into one project. */
  {
    id: "keyword-research",
    label: "Keyword Research",
    icon: "keywords",
    scope: SCOPES.GLOBAL,
    group: GROUPS.TOOLKIT,
    sections: [{ id: "keyword-research", label: "Keywords" }],
  },
  {
    id: "serp-analysis",
    label: "SERP Analysis",
    icon: "serp",
    scope: SCOPES.GLOBAL,
    group: GROUPS.TOOLKIT,
    sections: [{ id: "serp-analysis", label: "SERP Analysis" }],
  },
  {
    id: "link-opportunities",
    label: "Link Opportunities",
    icon: "links",
    scope: SCOPES.GLOBAL,
    group: GROUPS.TOOLKIT,
    sections: [{ id: "link-opportunities", label: "Link Opportunities" }],
  },
  {
    id: "blog-studio",
    label: "Blog Studio",
    icon: "blogStudio",
    scope: SCOPES.PROJECT,
    group: GROUPS.TOOLKIT,
    requires: "project",
    /** Studios get their own accent so they read as machinery, not another tab. */
    accent: "studio",
    sections: [{ id: "blog-automation", label: "Studio" }],
  },
  {
    id: "post-studio",
    label: "Post Studio",
    icon: "postStudio",
    scope: SCOPES.PROJECT,
    group: GROUPS.TOOLKIT,
    requires: "project",
    accent: "studio",
    sections: [{ id: "post-automation", label: "Studio" }],
  },

  {
    id: "admin",
    label: "Admin",
    icon: "shield",
    scope: SCOPES.PLATFORM,
    group: GROUPS.PLATFORM,
    sections: [{ id: "user-management", label: "Users" }],
  },
];

/**
 * Sections that live inside a workspace but aren't tabs — deep-linked or
 * legacy ids that should still light up their workspace in the sidebar.
 */
const EXTRA_SECTION_OWNERS = {
  "device-appearance": "search-console",
  "query-page-matrix": "search-console",
  "sitemap-health": "search-console",
  "seo-opportunities": "search-console",
  // Folded into the unified "Site Intelligence" tab, but deep links must still
  // resolve to the SEO workspace.
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
  // Keyword and SERP aliases follow their tools into the Toolkit.
  "keyword-opportunities": "keyword-research",
  "ai-keyword-research": "keyword-research",
  "seranking-keywords": "keyword-research",
  "competitor-matrix": "serp-analysis",
};

/** Sections that stand on their own, derived from the workspace scopes above. */
const GLOBAL_SECTION_IDS = new Set(
  WORKSPACES.filter((w) => w.scope === SCOPES.GLOBAL).flatMap((w) => w.sections.map((s) => s.id))
);
for (const [sectionId, ownerId] of Object.entries(EXTRA_SECTION_OWNERS)) {
  const owner = WORKSPACES.find((w) => w.id === ownerId);
  if (owner?.scope === SCOPES.GLOBAL) GLOBAL_SECTION_IDS.add(sectionId);
}

/**
 * True when a section needs no project at all. Callers use this to skip the
 * "you have a Meta-only project selected, go somewhere else" redirects — a
 * Toolkit tool doesn't care what's selected.
 */
export function isGlobalSection(sectionId) {
  return GLOBAL_SECTION_IDS.has(sectionId);
}

export function scopeForSection(sectionId) {
  return workspaceForSection(sectionId)?.scope || SCOPES.PROJECT;
}

/** Which workspace owns a section id (including legacy/alias ids). */
export function workspaceForSection(sectionId) {
  if (!sectionId) return WORKSPACES[0];
  const direct = WORKSPACES.find((w) => w.sections.some((s) => s.id === sectionId));
  if (direct) return direct;
  const ownerId = EXTRA_SECTION_OWNERS[sectionId];
  return WORKSPACES.find((w) => w.id === ownerId) || WORKSPACES[0];
}

/**
 * The tabs a user can actually see in a workspace.
 *
 * @param {object} workspace
 * @param {object} ctx
 * @param {(sectionId: string) => boolean} ctx.canAccess  permission check
 * @param {boolean} ctx.isWebsiteSelected                 a real website (not a Meta page)
 * @param {boolean} ctx.isProjectSelected                 any project, Meta pages included
 */
export function visibleSections(workspace, { canAccess, isWebsiteSelected, isProjectSelected }) {
  if (!workspace) return [];
  if (workspace.scope !== SCOPES.GLOBAL) {
    // A website requirement implies a project requirement.
    if (workspace.requires === "website" && !isWebsiteSelected) return [];
    if (workspace.requires === "project" && !isProjectSelected) return [];
  }
  return workspace.sections.filter((section) => !canAccess || canAccess(section.id));
}

/**
 * Visible workspaces split into the rails the sidebar renders, grouped by
 * `group` rather than `scope` — the studios are project-scoped but belong in the
 * Toolkit rail alongside the research tools.
 */
export function visibleWorkspaceGroups(ctx) {
  const entries = visibleWorkspaces(ctx);
  const pick = (group) => entries.filter((entry) => entry.workspace.group === group);
  return [
    { id: GROUPS.PROJECT, label: "Project", collapsible: false, entries: pick(GROUPS.PROJECT) },
    { id: GROUPS.TOOLKIT, label: "Toolkit", collapsible: true, entries: pick(GROUPS.TOOLKIT) },
    { id: GROUPS.PLATFORM, label: null, collapsible: false, entries: pick(GROUPS.PLATFORM) },
  ].filter((group) => group.entries.length > 0);
}

/** Workspaces with at least one reachable section, in nav order. */
export function visibleWorkspaces(ctx) {
  return WORKSPACES.map((workspace) => ({
    workspace,
    sections: visibleSections(workspace, ctx),
  })).filter((entry) => entry.sections.length > 0);
}
