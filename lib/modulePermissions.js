/**
 * Granular module permissions: Search Console, SEO, Social, Blogs.
 * Admin (user-management) is super_admin only — not assignable here.
 */

import { ROLES, isSuperAdmin } from "./rbac.js";

export const MODULES = {
  GSC: "gsc",
  SEO: "seo",
  SOCIAL: "social",
  BLOGS: "blogs",
};

/** Sub-permissions per module (section IDs). */
export const MODULE_SUB_PERMISSIONS = {
  [MODULES.GSC]: [
    { id: "website-statistics", label: "Website Statistics" },
    { id: "url-inspection", label: "URL Inspection" },
  ],
  [MODULES.SEO]: [
    { id: "site-health", label: "Authority & Performance" },
    { id: "site-audit", label: "Site Audit" },
    { id: "keyword-research", label: "Keyword Research" },
    { id: "site-explorer", label: "Site Explorer" },
    { id: "backlink-profile", label: "Backlink Profile" },
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
};

const ALL_GSC = MODULE_SUB_PERMISSIONS[MODULES.GSC].map((p) => p.id);
const ALL_SEO = MODULE_SUB_PERMISSIONS[MODULES.SEO].map((p) => p.id);
const ALL_SOCIAL = MODULE_SUB_PERMISSIONS[MODULES.SOCIAL].map((p) => p.id);
const ALL_BLOGS = MODULE_SUB_PERMISSIONS[MODULES.BLOGS].map((p) => p.id);

/** Default grants when user has no explicit modulePermissions stored. */
export const DEFAULT_ROLE_MODULE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: {
    [MODULES.GSC]: ALL_GSC,
    [MODULES.SEO]: ALL_SEO,
    [MODULES.SOCIAL]: ALL_SOCIAL,
    [MODULES.BLOGS]: ALL_BLOGS,
  },
  [ROLES.USER]: {
    [MODULES.GSC]: ALL_GSC,
    [MODULES.SEO]: ALL_SEO,
    [MODULES.SOCIAL]: ["smm-statistics", "calendar", "my-approvals"],
    [MODULES.BLOGS]: ["my-blog-approvals"],
  },
  [ROLES.VIEWER]: {
    [MODULES.GSC]: ALL_GSC,
    [MODULES.SEO]: ALL_SEO,
    [MODULES.SOCIAL]: ["smm-statistics", "calendar", "my-approvals"],
    [MODULES.BLOGS]: ["my-blog-approvals"],
  },
  [ROLES.SMM]: {
    [MODULES.GSC]: ALL_GSC,
    [MODULES.SEO]: ALL_SEO,
    [MODULES.SOCIAL]: ALL_SOCIAL,
    [MODULES.BLOGS]: ALL_BLOGS,
  },
  [ROLES.APPROVER]: {
    [MODULES.GSC]: [],
    [MODULES.SEO]: [],
    [MODULES.SOCIAL]: ["calendar", "my-approvals"],
    [MODULES.BLOGS]: [],
  },
};

const SECTION_ALIASES = {
  "seranking-audit": "site-audit",
  "seranking-keywords": "keyword-research",
  "seranking-explorer": "site-explorer",
  "seranking-domain": "site-health",
  "seranking-backlinks": "backlink-profile",
  "ai-keyword-research": "keyword-research",
  "pagespeed-insights": "site-health",
  "domain-authority": "site-health",
  "link-index": "site-health",
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

export function getModuleForSection(sectionId) {
  const canonical = SECTION_ALIASES[sectionId] || sectionId;
  return SECTION_TO_MODULE[canonical] || SECTION_TO_MODULE[sectionId] || null;
}

export function normalizeSectionId(sectionId) {
  return SECTION_ALIASES[sectionId] || sectionId;
}

function normalizeModulePermissions(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  for (const mod of Object.values(MODULES)) {
    const list = raw[mod];
    if (!Array.isArray(list)) continue;
    const valid = new Set(MODULE_SUB_PERMISSIONS[mod].map((p) => p.id));
    out[mod] = [...new Set(list.filter((id) => valid.has(id)))];
  }
  return out;
}

/**
 * Resolve effective module permissions for a user.
 * @param {{ role?: string, modulePermissions?: object|null }} user
 */
export function resolveModulePermissions(user) {
  if (!user) {
    return {
      [MODULES.GSC]: [],
      [MODULES.SEO]: [],
      [MODULES.SOCIAL]: [],
      [MODULES.BLOGS]: [],
    };
  }

  if (isSuperAdmin(user.role)) {
    return { ...DEFAULT_ROLE_MODULE_PERMISSIONS[ROLES.SUPER_ADMIN] };
  }

  const explicit = normalizeModulePermissions(user.modulePermissions);
  if (explicit && Object.keys(explicit).length > 0) {
    return {
      [MODULES.GSC]: explicit[MODULES.GSC] || [],
      [MODULES.SEO]: explicit[MODULES.SEO] || [],
      [MODULES.SOCIAL]: explicit[MODULES.SOCIAL] || [],
      [MODULES.BLOGS]: explicit[MODULES.BLOGS] || [],
    };
  }

  const role = user.role || ROLES.USER;
  const defaults = DEFAULT_ROLE_MODULE_PERMISSIONS[role] || DEFAULT_ROLE_MODULE_PERMISSIONS[ROLES.USER];
  return {
    [MODULES.GSC]: [...(defaults[MODULES.GSC] || [])],
    [MODULES.SEO]: [...(defaults[MODULES.SEO] || [])],
    [MODULES.SOCIAL]: [...(defaults[MODULES.SOCIAL] || [])],
    [MODULES.BLOGS]: [...(defaults[MODULES.BLOGS] || [])],
  };
}

export function canAccessSection(user, sectionId) {
  if (!user || !sectionId) return false;
  if (sectionId === "dashboard") return user.role !== ROLES.APPROVER;

  if (ADMIN_ONLY_SECTIONS.has(sectionId)) {
    return isSuperAdmin(user.role);
  }

  if (isSuperAdmin(user.role)) return true;

  const canonical = normalizeSectionId(sectionId);
  const module = getModuleForSection(canonical);
  if (!module) return true;

  const perms = resolveModulePermissions(user);
  const allowed = perms[module] || [];
  return allowed.includes(canonical);
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

/** Global site picker (multi-client admin tools). */
export function hasGlobalSiteAccess(user) {
  if (!user) return false;
  if (isSuperAdmin(user.role)) return true;
  if (hasAnyAdminContentPermission(user)) return true;
  return false;
}

export function getDefaultModulePermissionsForRole(role) {
  if (role === ROLES.SUPER_ADMIN) {
    return { ...DEFAULT_ROLE_MODULE_PERMISSIONS[ROLES.SUPER_ADMIN] };
  }
  const defaults = DEFAULT_ROLE_MODULE_PERMISSIONS[role] || DEFAULT_ROLE_MODULE_PERMISSIONS[ROLES.USER];
  return {
    [MODULES.GSC]: [...(defaults[MODULES.GSC] || [])],
    [MODULES.SEO]: [...(defaults[MODULES.SEO] || [])],
    [MODULES.SOCIAL]: [...(defaults[MODULES.SOCIAL] || [])],
    [MODULES.BLOGS]: [...(defaults[MODULES.BLOGS] || [])],
  };
}

/** Safe shape for admin user form / ModulePermissionPicker. */
export function coerceModulePermissionsForForm(raw, role = ROLES.USER) {
  const normalized = normalizeModulePermissions(raw);
  if (!normalized || Object.keys(normalized).length === 0) {
    return getDefaultModulePermissionsForRole(role);
  }
  return {
    [MODULES.GSC]: [...(normalized[MODULES.GSC] || [])],
    [MODULES.SEO]: [...(normalized[MODULES.SEO] || [])],
    [MODULES.SOCIAL]: [...(normalized[MODULES.SOCIAL] || [])],
    [MODULES.BLOGS]: [...(normalized[MODULES.BLOGS] || [])],
  };
}

export function validateModulePermissionsInput(raw, { role } = {}) {
  if (raw == null) return { valid: true, value: null };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { valid: false, error: "modulePermissions must be an object" };
  }
  if (role === ROLES.SUPER_ADMIN) {
    return { valid: false, error: "Cannot set module permissions on super admin" };
  }
  const normalized = normalizeModulePermissions(raw);
  return { valid: true, value: normalized };
}

export const MODULE_LABELS = {
  [MODULES.GSC]: "Search Console",
  [MODULES.SEO]: "SEO Tools",
  [MODULES.SOCIAL]: "Social Media",
  [MODULES.BLOGS]: "Blogs",
};

/** Map admin API path segments to required section permission. */
export const API_PATH_SECTION_MAP = [
  { pattern: /\/api\/admin\/post-automation/, section: "post-automation" },
  { pattern: /\/api\/admin\/post-publish-config/, section: "post-automation" },
  { pattern: /\/api\/admin\/board\/posts/, section: "post-board" },
  { pattern: /\/api\/admin\/approvals/, section: "admin-approvals" },
  { pattern: /\/api\/admin\/meta\/pull/, section: "admin-approvals" },
  { pattern: /\/api\/admin\/email-inbound/, section: "admin-approvals" },
  { pattern: /\/api\/admin\/content-autoschedule/, section: "post-autoschedule" },
  { pattern: /\/api\/admin\/blog-automation/, section: "blog-automation" },
  { pattern: /\/api\/admin\/blog-publish-config/, section: "blog-automation" },
  { pattern: /\/api\/admin\/board\/blogs/, section: "blog-board" },
  { pattern: /\/api\/admin\/blogs/, section: "admin-blogs" },
  { pattern: /\/api\/admin\/wordpress/, section: "admin-blogs" },
];

export function sectionForApiPath(pathname) {
  for (const { pattern, section } of API_PATH_SECTION_MAP) {
    if (pattern.test(pathname)) return section;
  }
  return null;
}
