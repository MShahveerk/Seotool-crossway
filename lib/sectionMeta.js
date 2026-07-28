/** Section IDs, labels, and URL sync helpers for the dashboard SPA. */

export const SECTION_META = {
  dashboard: { label: "Dashboard", group: "main" },
  "website-statistics": { label: "Website Statistics", group: "website-gsc" },
  "pagespeed-insights": { label: "PageSpeed Insights", group: "website-gsc" },
  "site-audit": { label: "Site Audit", group: "website-gsc" },
  "domain-authority": { label: "Domain Authority", group: "website-gsc" },
  "keyword-research": { label: "Keyword Research", group: "website-gsc" },
  "ai-keyword-research": { label: "AI Keyword Research", group: "website-gsc" },
  "seo-opportunities": { label: "SEO Opportunities", group: "website-gsc" },
  "device-appearance": { label: "Device & Appearance", group: "website-gsc" },
  "url-inspection": { label: "URL Inspection", group: "website-gsc" },
  "query-page-matrix": { label: "Query × Page", group: "website-gsc" },
  "site-explorer": { label: "Site Explorer", group: "website-gsc" },
  "link-index": { label: "Link Index", group: "website-gsc" },
  "sitemap-health": { label: "Sitemap Health", group: "website-gsc" },
  "smm-statistics": { label: "SMM Statistics", group: "smm" },
  calendar: { label: "Content Calendar", group: "smm" },
  "my-approvals": { label: "SMM Post Approvals", group: "smm" },
  "admin-approvals": { label: "Create Post", group: "smm" },
  "my-blog-approvals": { label: "Blog Approvals", group: "blogs" },
  "admin-blogs": { label: "Create Blog", group: "blogs" },
  "blog-automation": { label: "Blog Automation", group: "blogs" },
  "user-management": { label: "User Management", group: "admin" },
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
