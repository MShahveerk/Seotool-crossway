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
 */

export const WORKSPACES = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: "dashboard",
    /** Single-section workspaces render no tab rail. */
    sections: [{ id: "dashboard", label: "Overview" }],
  },
  {
    id: "search-console",
    label: "Search Console",
    icon: "globe",
    requiresWebsite: true,
    sections: [
      { id: "website-statistics", label: "Statistics" },
      { id: "url-inspection", label: "URL Inspection" },
    ],
  },
  {
    id: "seo",
    label: "SEO",
    icon: "search",
    /** Without a website selected only Site Explorer is meaningful. */
    websiteOnlyExcept: ["site-explorer", "keyword-opportunities", "link-opportunities"],
    sections: [
      { id: "site-health", label: "Authority" },
      { id: "site-audit", label: "Site Audit" },
      { id: "keyword-research", label: "Keywords" },
      { id: "serp-analysis", label: "SERP Analysis" },
      { id: "keyword-opportunities", label: "Keyword Ideas" },
      { id: "link-opportunities", label: "Link Opportunities" },
      { id: "site-explorer", label: "Site Explorer" },
      { id: "backlink-profile", label: "Backlinks" },
      { id: "google-ads-planner", label: "Ads Planner" },
      { id: "seo-autopilot", label: "Autopilot" },
      { id: "dataforseo-explorer", label: "DataForSEO" },
    ],
  },
  /* The automation studios are their own pages, sitting directly above the
     domain they produce for — they're workbenches, not another blog tool. */
  {
    id: "blog-studio",
    label: "Blog Automation Studio",
    icon: "blogStudio",
    /** Studios get their own accent so they read as machinery, not another tab. */
    accent: "studio",
    sections: [{ id: "blog-automation", label: "Studio" }],
  },
  {
    id: "content",
    label: "Blogs",
    icon: "fileText",
    /* Approvals sits last: it's where work ends up, not where it starts. */
    sections: [
      { id: "admin-blogs", label: "Create" },
      { id: "blog-board", label: "Board" },
      { id: "blog-autoschedule", label: "Autoscheduler" },
      { id: "my-blog-approvals", label: "Approvals" },
    ],
  },
  {
    id: "post-studio",
    label: "Post Automation Studio",
    icon: "postStudio",
    accent: "studio",
    sections: [{ id: "post-automation", label: "Studio" }],
  },
  {
    id: "social",
    label: "Social",
    icon: "megaphone",
    sections: [
      { id: "smm-statistics", label: "Statistics" },
      { id: "calendar", label: "Calendar" },
      { id: "admin-approvals", label: "Create" },
      { id: "post-board", label: "Board" },
      { id: "post-autoschedule", label: "Autoscheduler" },
      { id: "my-approvals", label: "Approvals" },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    icon: "presentation",
    sections: [{ id: "reports-studio", label: "Report Studio" }],
  },
  {
    id: "admin",
    label: "Admin",
    icon: "shield",
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
  "pagespeed-insights": "seo",
  "domain-authority": "seo",
  "link-index": "seo",
  "ai-keyword-research": "seo",
  "competitor-matrix": "seo",
  "seranking-domain": "seo",
  "seranking-backlinks": "seo",
  "seranking-keywords": "seo",
  "seranking-audit": "seo",
  "seranking-explorer": "seo",
};

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
  return workspace.sections.filter((section) => {
    if (canAccess && !canAccess(section.id)) return false;
    if (workspace.requiresWebsite && !isWebsiteSelected) return false;
    if (
      workspace.websiteOnlyExcept &&
      !isWebsiteSelected &&
      !workspace.websiteOnlyExcept.includes(section.id)
    ) {
      return false;
    }
    return true;
  });
}

/** Workspaces with at least one reachable section, in nav order. */
export function visibleWorkspaces(ctx) {
  return WORKSPACES.map((workspace) => ({
    workspace,
    sections: visibleSections(workspace, ctx),
  })).filter((entry) => entry.sections.length > 0);
}
