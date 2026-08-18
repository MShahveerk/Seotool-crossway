/**
 * Granular module permissions: Search Console, SEO, Social, Blogs, Reports.
 * Admin (user-management) is super_admin only — not assignable here.
 */

import { ROLES, isSuperAdmin, isSmmRole } from "./rbac.js";

export const MODULES = {
  GSC: "gsc",
  SEO: "seo",
  SOCIAL: "social",
  BLOGS: "blogs",
  REPORTS: "reports",
};

/** Sub-permissions per module (section IDs). */
export const MODULE_SUB_PERMISSIONS = {
  [MODULES.GSC]: [
    { id: "website-statistics", label: "Website Statistics" },
    { id: "url-inspection", label: "URL Inspection" },
  ],
  [MODULES.SEO]: [
    { id: "site-health", label: "Performance Metrics" },
    { id: "site-audit", label: "Site Audit" },
    { id: "keyword-research", label: "Keyword Research" },
    { id: "serp-analysis", label: "SERP Analysis" },
    { id: "link-opportunities", label: "Link Opportunities" },
    { id: "keyword-opportunities", label: "Keyword Opportunities" },
    { id: "site-explorer", label: "Site Explorer" },
    { id: "backlink-profile", label: "Backlink Profile" },
    { id: "seo-autopilot", label: "SEO Autopilot" },
  ],
  [MODULES.SOCIAL]: [
    { id: "smm-statistics", label: "SMM Statistics" },
    { id: "calendar", label: "Content Calendar" },
    { id: "my-approvals", label: "SMM Post Approvals" },
    { id: "admin-approvals", label: "Create Post" },
    { id: "post-board", label: "Post Board" },
    { id: "post-automation", label: "Post Automation Studio" },
    { id: "post-autoschedule", label: "Post Autoscheduler" },
  ],
  [MODULES.BLOGS]: [
    { id: "my-blog-approvals", label: "Blog Approvals" },
    { id: "admin-blogs", label: "Create Blog" },
    { id: "blog-board", label: "Blog Board" },
    { id: "blog-automation", label: "Blog Automation Studio" },
    { id: "blog-autoschedule", label: "Blog Autoscheduler" },
  ],
  [MODULES.REPORTS]: [{ id: "reports-studio", label: "Report Studio" }],
};

const ALL_GSC = MODULE_SUB_PERMISSIONS[MODULES.GSC].map((p) => p.id);
const ALL_SEO = MODULE_SUB_PERMISSIONS[MODULES.SEO].map((p) => p.id);
const ALL_SOCIAL = MODULE_SUB_PERMISSIONS[MODULES.SOCIAL].map((p) => p.id);
const ALL_BLOGS = MODULE_SUB_PERMISSIONS[MODULES.BLOGS].map((p) => p.id);
const ALL_REPORTS = MODULE_SUB_PERMISSIONS[MODULES.REPORTS].map((p) => p.id);

/** Default grants when user has no explicit modulePermissions stored. */
export const DEFAULT_ROLE_MODULE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: {
    [MODULES.GSC]: ALL_GSC,
    [MODULES.SEO]: ALL_SEO,
    [MODULES.SOCIAL]: ALL_SOCIAL,
    [MODULES.BLOGS]: ALL_BLOGS,
    [MODULES.REPORTS]: ALL_REPORTS,
  },
  [ROLES.USER]: {
    [MODULES.GSC]: ALL_GSC,
    [MODULES.SEO]: ALL_SEO,
    [MODULES.SOCIAL]: ["smm-statistics", "calendar", "my-approvals"],
    [MODULES.BLOGS]: ["my-blog-approvals"],
    [MODULES.REPORTS]: [],
  },
  [ROLES.VIEWER]: {
    [MODULES.GSC]: ALL_GSC,
    [MODULES.SEO]: ALL_SEO,
    [MODULES.SOCIAL]: ["smm-statistics", "calendar", "my-approvals"],
    [MODULES.BLOGS]: ["my-blog-approvals"],
    [MODULES.REPORTS]: [],
  },
  [ROLES.SMM]: {
    [MODULES.GSC]: ALL_GSC,
    [MODULES.SEO]: ALL_SEO,
    [MODULES.SOCIAL]: ALL_SOCIAL,
    [MODULES.BLOGS]: ALL_BLOGS,
    [MODULES.REPORTS]: ALL_REPORTS,
  },
  [ROLES.APPROVER]: {
    [MODULES.GSC]: [],
    [MODULES.SEO]: [],
    [MODULES.SOCIAL]: ["calendar", "my-approvals"],
    [MODULES.BLOGS]: [],
    [MODULES.REPORTS]: [],
  },
};

const SECTION_ALIASES = {
  "competitor-matrix": "serp-analysis",
  "seranking-audit": "site-audit",
  "seranking-keywords": "keyword-research",
  "seranking-explorer": "site-explorer",
  "seranking-domain": "site-health",
  "seranking-backlinks": "backlink-profile",
  "ai-keyword-research": "keyword-research",
  "pagespeed-insights": "site-health",
  "domain-authority": "site-health",
  "device-appearance": "website-statistics",
  "query-page-matrix": "website-statistics",
  "sitemap-health": "website-statistics",
  "seo-opportunities": "website-statistics",
};

const SECTION_TO_MODULE = {};
for (const [module, items] of Object.entries(MODULE_SUB_PERMISSIONS)) {
  for (const item of items) {
    SECTION_TO_MODULE[item.id] = module;
  }
}
for (const [alias, canonical] of Object.entries(SECTION_ALIASES)) {
  if (SECTION_TO_MODULE[canonical]) {
    SECTION_TO_MODULE[alias] = SECTION_TO_MODULE[canonical];
  }
}

const ADMIN_ONLY_SECTIONS = new Set(["user-management"]);

const ADMIN_CONTENT_SECTIONS = new Set([
  "admin-approvals",
  "post-board",
  "post-automation",
  "post-autoschedule",
  "admin-blogs",
  "blog-board",
  "blog-automation",
  "blog-autoschedule",
]);

function emptyPermissions() {
  return {
    [MODULES.GSC]: [],
    [MODULES.SEO]: [],
    [MODULES.SOCIAL]: [],
    [MODULES.BLOGS]: [],
    [MODULES.REPORTS]: [],
  };
}

function cloneRoleDefaults(role) {
  const defaults =
    DEFAULT_ROLE_MODULE_PERMISSIONS[role] || DEFAULT_ROLE_MODULE_PERMISSIONS[ROLES.USER];
  return {
    [MODULES.GSC]: [...(defaults[MODULES.GSC] || [])],
    [MODULES.SEO]: [...(defaults[MODULES.SEO] || [])],
    [MODULES.SOCIAL]: [...(defaults[MODULES.SOCIAL] || [])],
    [MODULES.BLOGS]: [...(defaults[MODULES.BLOGS] || [])],
    [MODULES.REPORTS]: [...(defaults[MODULES.REPORTS] || [])],
  };
}

function filterValidSections(module, list) {
  const valid = new Set(MODULE_SUB_PERMISSIONS[module].map((p) => p.id));
  return [...new Set((list || []).filter((id) => valid.has(id)))];
}

/**
 * Normalize stored JSON. Modules present as arrays are kept (even if empty).
 * Modules omitted from stored JSON are inherited from role defaults so newly
 * added catalog modules (e.g. Reports) do not silently strip staff access.
 */
function resolveFromStored(raw, role) {
  const defaults = cloneRoleDefaults(role);
  const out = emptyPermissions();
  let hasAny = false;
  for (const mod of Object.values(MODULES)) {
    if (Array.isArray(raw[mod])) {
      hasAny = true;
      out[mod] = filterValidSections(mod, raw[mod]);
    } else {
      out[mod] = [...(defaults[mod] || [])];
    }
  }
  return hasAny ? out : null;
}

export function getModuleForSection(sectionId) {
  const canonical = SECTION_ALIASES[sectionId] || sectionId;
  return SECTION_TO_MODULE[canonical] || SECTION_TO_MODULE[sectionId] || null;
}

export function normalizeSectionId(sectionId) {
  return SECTION_ALIASES[sectionId] || sectionId;
}

/**
 * Resolve effective module permissions for a user.
 * @param {{ role?: string, modulePermissions?: object|null }} user
 */
export function resolveModulePermissions(user) {
  if (!user) return emptyPermissions();

  if (isSuperAdmin(user.role)) {
    return cloneRoleDefaults(ROLES.SUPER_ADMIN);
  }

  const role = user.role || ROLES.USER;
  const fromStored =
    user.modulePermissions && typeof user.modulePermissions === "object"
      ? resolveFromStored(user.modulePermissions, role)
      : null;
  if (fromStored) return fromStored;

  return cloneRoleDefaults(role);
}

export function canAccessSection(user, sectionId) {
  if (!user || !sectionId) return false;
  if (sectionId === "dashboard") return user.role !== ROLES.APPROVER;
  if (sectionId === "help") return true;

  if (ADMIN_ONLY_SECTIONS.has(sectionId)) {
    return isSuperAdmin(user.role);
  }

  if (isSuperAdmin(user.role)) return true;

  const canonical = normalizeSectionId(sectionId);
  const module = getModuleForSection(canonical);
  // Fail closed: unknown / unmapped sections are denied.
  if (!module) return false;

  const perms = resolveModulePermissions(user);
  const allowed = perms[module] || [];
  return allowed.includes(canonical);
}

export function canAccessAnySection(user, sectionIds = []) {
  if (!user) return false;
  if (isSuperAdmin(user.role)) return true;
  return (Array.isArray(sectionIds) ? sectionIds : [sectionIds]).some((id) =>
    canAccessSection(user, id)
  );
}

/** Throw an error with `.status` when the user lacks the section. */
export function assertSectionAccess(user, sectionId) {
  if (!canAccessSection(user, sectionId)) {
    const err = new Error("Forbidden: Insufficient permissions");
    err.status = 403;
    throw err;
  }
}

export function assertAnySectionAccess(user, sectionIds = []) {
  if (!canAccessAnySection(user, sectionIds)) {
    const err = new Error("Forbidden: Insufficient permissions");
    err.status = 403;
    throw err;
  }
}

export function hasAnyAdminContentPermission(user) {
  if (isSuperAdmin(user?.role)) return true;
  const perms = resolveModulePermissions(user);
  for (const mod of [MODULES.SOCIAL, MODULES.BLOGS]) {
    for (const sectionId of perms[mod] || []) {
      if (ADMIN_CONTENT_SECTIONS.has(sectionId)) return true;
    }
  }
  return false;
}

/**
 * Global site / Meta page picker (sidebar client switcher, meta-accounts, site-integrations).
 * Super admins, SMM roles, and anyone with studio/board/create grants.
 */
export function hasGlobalSiteAccess(user) {
  if (!user) return false;
  if (isSuperAdmin(user.role)) return true;
  if (isSmmRole(user.role)) return true;
  if (hasAnyAdminContentPermission(user)) return true;
  if (canAccessSection(user, "reports-studio")) return true;
  return false;
}

export function getDefaultModulePermissionsForRole(role) {
  if (role === ROLES.SUPER_ADMIN) {
    return cloneRoleDefaults(ROLES.SUPER_ADMIN);
  }
  return cloneRoleDefaults(role || ROLES.USER);
}

/** Safe shape for admin user form / ModulePermissionPicker. */
export function coerceModulePermissionsForForm(raw, role = ROLES.USER) {
  if (!raw || typeof raw !== "object") {
    return getDefaultModulePermissionsForRole(role);
  }
  const resolved = resolveFromStored(raw, role || ROLES.USER);
  return resolved || getDefaultModulePermissionsForRole(role);
}

export function validateModulePermissionsInput(raw, { role } = {}) {
  if (raw == null) return { valid: true, value: null };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { valid: false, error: "modulePermissions must be an object" };
  }
  if (role === ROLES.SUPER_ADMIN) {
    return { valid: false, error: "Cannot set module permissions on super admin" };
  }
  const out = emptyPermissions();
  let hasAny = false;
  for (const mod of Object.values(MODULES)) {
    if (!Array.isArray(raw[mod])) continue;
    hasAny = true;
    out[mod] = filterValidSections(mod, raw[mod]);
  }
  return { valid: true, value: hasAny ? out : null };
}

export const MODULE_LABELS = {
  [MODULES.GSC]: "Search Console",
  [MODULES.SEO]: "SEO Tools",
  [MODULES.SOCIAL]: "Social Media",
  [MODULES.BLOGS]: "Blogs",
  [MODULES.REPORTS]: "Reports",
};

/** Map API path segments to required section permission. */
export const API_PATH_SECTION_MAP = [
  { pattern: /\/api\/admin\/post-automation/, section: "post-automation" },
  { pattern: /\/api\/admin\/post-publish-config/, section: "post-automation" },
  { pattern: /\/api\/admin\/board\/posts/, section: "post-board" },
  { pattern: /\/api\/admin\/approvals/, section: "admin-approvals" },
  { pattern: /\/api\/admin\/meta\/pull/, section: "post-automation" },
  { pattern: /\/api\/admin\/email-inbound/, section: "post-automation" },
  { pattern: /\/api\/admin\/content-autoschedule/, section: "post-autoschedule" },
  { pattern: /\/api\/admin\/seo-autopilot/, section: "seo-autopilot" },
  { pattern: /\/api\/admin\/blog-automation/, section: "blog-automation" },
  { pattern: /\/api\/admin\/blog-publish-config/, section: "blog-automation" },
  { pattern: /\/api\/admin\/board\/blogs/, section: "blog-board" },
  { pattern: /\/api\/admin\/blogs/, section: "admin-blogs" },
  { pattern: /\/api\/admin\/wordpress/, section: "admin-blogs" },
  { pattern: /\/api\/reports\/studio/, section: "reports-studio" },
  { pattern: /\/api\/site-audit/, section: "site-audit" },
  { pattern: /\/api\/site-explorer/, section: "site-explorer" },
  { pattern: /\/api\/authority/, section: "site-health" },
  { pattern: /\/api\/pagespeed/, section: "site-health" },
  { pattern: /\/api\/seranking\/audit/, section: "site-audit" },
  { pattern: /\/api\/seranking\/keywords/, section: "keyword-research" },
  { pattern: /\/api\/seranking\/explorer/, section: "site-explorer" },
  { pattern: /\/api\/seranking\/backlinks/, section: "backlink-profile" },
  { pattern: /\/api\/seranking\/domain/, section: "site-health" },
  { pattern: /\/api\/seranking\/metrics/, section: "site-health" },
  { pattern: /\/api\/seranking\/overview/, section: "site-health" },
  { pattern: /\/api\/keywords\//, section: "keyword-research" },
  { pattern: /\/api\/smm\//, section: "smm-statistics" },
  { pattern: /\/api\/calendar/, section: "calendar" },
  { pattern: /\/api\/approvals/, section: "my-approvals" },
  { pattern: /\/api\/blogs/, section: "my-blog-approvals" },
];

export function sectionForApiPath(pathname) {
  for (const { pattern, section } of API_PATH_SECTION_MAP) {
    if (pattern.test(pathname)) return section;
  }
  return null;
}

/** All SEO section IDs — used for shared status shells. */
export function allSeoSectionIds() {
  return [...ALL_SEO];
}
