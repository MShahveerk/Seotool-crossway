/** Section IDs, labels, and URL sync helpers for the dashboard SPA. */

export const SECTION_META = {
  dashboard: { label: "Dashboard", group: "main" },
  "website-statistics": { label: "Website Statistics", group: "gsc" },
  "device-appearance": { label: "Website Statistics", group: "gsc" },
  "url-inspection": { label: "URL Inspection", group: "gsc" },
  "query-page-matrix": { label: "Website Statistics", group: "gsc" },
  "sitemap-health": { label: "Website Statistics", group: "gsc" },
  "seo-opportunities": { label: "Website Statistics", group: "gsc" },
  "site-health": { label: "Authority & Performance", group: "seo" },
  "pagespeed-insights": { label: "Site Health", group: "seo" },
  "site-audit": { label: "Site Audit", group: "seo" },
  "domain-authority": { label: "Authority & Performance", group: "seo" },
  "keyword-research": { label: "Keyword Research", group: "seo" },
  "ai-keyword-research": { label: "Keyword Research", group: "seo" },
  "google-ads-planner": { label: "Google Ads Planner", group: "seo" },
  "serp-analysis": { label: "SERP Analysis", group: "seo" },
  "competitor-matrix": { label: "SERP Analysis", group: "seo" },
  "site-explorer": { label: "Site Explorer", group: "seo" },
  "backlink-profile": { label: "Backlink Profile", group: "seo" },
  "seo-autopilot": { label: "SEO Autopilot", group: "seo" },
  "link-index": { label: "Site Health", group: "seo" },
  "seranking-domain": { label: "Authority & Performance", group: "seo" },
  "seranking-backlinks": { label: "Backlink Profile", group: "seo" },
  "seranking-keywords": { label: "Keyword Research", group: "seo" },
  "seranking-audit": { label: "Site Audit", group: "seo" },
  "seranking-explorer": { label: "Site Explorer", group: "seo" },
  "dataforseo-explorer": { label: "DataForSEO Explorer", group: "dataforseo" },
  "smm-statistics": { label: "SMM Statistics", group: "smm" },
  calendar: { label: "Content Calendar", group: "smm" },
  "my-approvals": { label: "SMM Post Approvals", group: "smm" },
  "admin-approvals": { label: "Create Post", group: "smm" },
  "post-board": { label: "Post Board", group: "smm" },
  "post-automation": { label: "Post Automation Studio", group: "smm" },
  "post-autoschedule": { label: "Post Autoscheduler", group: "smm" },
  "my-blog-approvals": { label: "Blog Approvals", group: "blogs" },
  "admin-blogs": { label: "Create Blog", group: "blogs" },
  "blog-board": { label: "Blog Board", group: "blogs" },
  "blog-automation": { label: "Blog Automation Studio", group: "blogs" },
  "blog-autoschedule": { label: "Blog Autoscheduler", group: "blogs" },
  "user-management": { label: "User Management", group: "admin" },
  "reports-studio": { label: "Report Studio", group: "reports" },
};

export function getSectionLabel(sectionId) {
  return SECTION_META[sectionId]?.label || "Dashboard";
}

export function readSectionFromUrl() {
  if (typeof window === "undefined") return null;
  const section = new URLSearchParams(window.location.search).get("section");
  return section && SECTION_META[section] ? section : null;
}

export function readSiteFromUrl() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("site") || null;
}

export function writeDashboardUrl(section, site) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  if (section && section !== "dashboard") params.set("section", section);
  if (site) params.set("site", site);
  const qs = params.toString();
  const next = qs ? `/?${qs}` : "/";
  const current = `${window.location.pathname}${window.location.search}`;
  if (current !== next) {
    window.history.replaceState(null, "", next);
  }
}
