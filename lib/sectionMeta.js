/** Section IDs, labels, and URL sync helpers for the dashboard SPA. */

export const SECTION_META = {
  dashboard: { label: "Dashboard", group: "main" },
  "website-statistics": { label: "Website Statistics", group: "main" },
  "pagespeed-insights": { label: "PageSpeed Insights", group: "main" },
  "smm-statistics": { label: "SMM Statistics", group: "main" },
  calendar: { label: "Content Calendar", group: "main" },
  "my-approvals": { label: "Approvals", group: "main" },
  "my-blog-approvals": { label: "Blog Approvals", group: "main" },
  "site-audit": { label: "Site Audit", group: "seo" },
  "domain-authority": { label: "Domain Authority", group: "seo" },
  "keyword-research": { label: "Keyword Research", group: "seo" },
  "seo-opportunities": { label: "SEO Opportunities", group: "seo" },
  "device-appearance": { label: "Device & Appearance", group: "seo" },
  "url-inspection": { label: "URL Inspection", group: "seo" },
  "query-page-matrix": { label: "Query × Page", group: "seo" },
  "sitemap-health": { label: "Sitemap Health", group: "seo" },
  "user-management": { label: "User Management", group: "admin" },
  "admin-approvals": { label: "Create Post", group: "admin" },
  "admin-blogs": { label: "Create Blog", group: "admin" },
  "blog-automation": { label: "Blog Automation", group: "admin" },
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
