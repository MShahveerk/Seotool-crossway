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
 * `scope` is the load-bearing field:
 *   project  — meaningless without a project selected; reads that project's data.
 *   global   — keyword- or domain-first research that stands on its own. A
 *              project can still be picked *inside* the tool to prefill a
 *              target, but it never gates access.
 *   platform — runs the installation itself, belongs to neither.
 *
 * `requires: "website"` marks project workspaces that need a real website (a
 * Search Console property); a Meta-only project can't feed them. Workspaces
 * without it work for Meta-only projects too.
 */

export const SCOPES = { PROJECT: "project", GLOBAL: "global", PLATFORM: "platform" };

export const WORKSPACES = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: "dashboard",
    scope: SCOPES.PROJECT,
    /** Single-section workspaces render no tab rail. */
    sections: [{ id: "dashboard", label: "Overview" }],
  },
  {
    id: "search-console",
    label: "Search Console",
    icon: "globe",
    scope: SCOPES.PROJECT,
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
    /* What's left here reads the selected project's own site: its audit, its
       authority, its autopilot runs. The keyword/SERP/outreach tools that only
       need a keyword moved to the Toolkit. */
    requires: "website",
    sections: [
      { id: "site-intelligence", label: "Site Intelligence" },
      { id: "seo-autopilot", label: "Autopilot" },
    ],
  },
  /* The automation studios are their own pages, sitting directly above the
     domain they produce for — they're workbenches, not another blog tool. */
  {
    id: "blog-studio",
    label: "Blog Automation Studio",
    icon: "blogStudio",
    scope: SCOPES.PROJECT,
    /** Studios get their own accent so they read as machinery, not another tab. */
    accent: "studio",
    sections: [{ id: "blog-automation", label: "Studio" }],
  },
  {
    id: "content",
    label: "Blogs",
    icon: "fileText",
    scope: SCOPES.PROJECT,
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
    id: "post-studio",
    label: "Post Automation Studio",
    icon: "postStudio",
    scope: SCOPES.PROJECT,
    accent: "studio",
    sections: [{ id: "post-automation", label: "Studio" }],
  },
  {
    id: "social",
    label: "Social",
    icon: "megaphone",
    scope: SCOPES.PROJECT,
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
    sections: [{ id: "reports-studio", label: "Report Studio" }],
  },
  /* The Toolkit is deliberately the only global workspace. Everything in it
     starts from a keyword or a domain you type in, so it stays usable with no
     project selected — and stays usable when the project you *do* have selected
     is a Meta page with no website behind it. */
  {
    id: "toolkit",
    label: "Toolkit",
    icon: "toolkit",
    scope: SCOPES.GLOBAL,
    sections: [
      { id: "keyword-research", label: "Keywords" },
      { id: "serp-analysis", label: "SERP Analysis" },
      { id: "link-opportunities", label: "Link Opportunities" },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    icon: "shield",
    scope: SCOPES.PLATFORM,
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
  "keyword-opportunities": "toolkit",
  "ai-keyword-research": "toolkit",
  "competitor-matrix": "toolkit",
  "seranking-keywords": "toolkit",
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
 */
export function visibleSections(workspace, { canAccess, isWebsiteSelected }) {
  if (!workspace) return [];
  // Global workspaces are never gated on the selection — that's the point.
  const blockedByProject = workspace.scope !== SCOPES.GLOBAL && workspace.requires === "website" && !isWebsiteSelected;
  if (blockedByProject) return [];
  return workspace.sections.filter((section) => !canAccess || canAccess(section.id));
}

/**
 * Visible workspaces split into the rails the sidebar renders.
 *
 * Two labelled groups plus an unlabelled tail: project work, then research that
 * belongs to no project, then whatever runs the installation.
 */
export function visibleWorkspaceGroups(ctx) {
  const entries = visibleWorkspaces(ctx);
  const pick = (scope) => entries.filter((entry) => entry.workspace.scope === scope);
  return [
    { id: SCOPES.PROJECT, label: "Project", entries: pick(SCOPES.PROJECT) },
    { id: SCOPES.GLOBAL, label: "Toolkit", entries: pick(SCOPES.GLOBAL) },
    { id: SCOPES.PLATFORM, label: null, entries: pick(SCOPES.PLATFORM) },
  ].filter((group) => group.entries.length > 0);
}

/** Workspaces with at least one reachable section, in nav order. */
export function visibleWorkspaces(ctx) {
  return WORKSPACES.map((workspace) => ({
    workspace,
    sections: visibleSections(workspace, ctx),
  })).filter((entry) => entry.sections.length > 0);
}
