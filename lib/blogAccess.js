import {
  buildApprovalSiteOrFilter,
  resolveSiteEquivalents,
  sessionCanAccessSiteAsync,
  isMetaPageId,
} from "./siteAccess.js";
import { normalizeSiteOrigin } from "./validation.js";

/**
 * BlogPost only has `siteLink` (no facebookPageId column). Map approval-style
 * OR filters so Meta page IDs and host contains still match blog rows.
 */
export function blogSiteOrFromEquivalents(equivalents) {
  const keys = [...new Set((equivalents || []).map((s) => String(s || "").trim()).filter(Boolean))];
  if (!keys.length) return null;

  // Extra URL slash / origin variants — blogs are often stored slightly differently
  // than the currently selected site key.
  const expanded = new Set(keys);
  for (const key of keys) {
    expanded.add(key.replace(/\/+$/, ""));
    expanded.add(`${key.replace(/\/+$/, "")}/`);
    if (!isMetaPageId(key)) {
      const origin = normalizeSiteOrigin(key);
      if (origin) {
        expanded.add(origin);
        expanded.add(`${origin}/`);
      }
    }
  }

  const siteFilter = buildApprovalSiteOrFilter([...expanded]);
  if (!siteFilter?.OR?.length) {
    return { siteLink: { in: [...expanded] } };
  }

  return {
    OR: siteFilter.OR.map((clause) => {
      if (clause.siteLink) return { siteLink: clause.siteLink };
      // BlogPost.siteLink may store the Meta page / IG id used at create time
      if (clause.facebookPageId) return { siteLink: clause.facebookPageId };
      if (clause.instagramUserId) return { siteLink: clause.instagramUserId };
      return clause;
    }),
  };
}

/** Admin / board list filter for a selected site (or empty = no site constraint). */
export async function buildBlogAdminSiteWhere(prisma, siteParam) {
  const site = String(siteParam || "").trim();
  if (!site) return {};
  const equivalents = await resolveSiteEquivalents(prisma, site);
  return blogSiteOrFromEquivalents([site, ...equivalents]) || { siteLink: site };
}

export async function buildBlogSiteFilter(prisma, siteParam, sessionUser, role) {
  let whereClause = {};

  if (role !== "super_admin" && role !== "smm") {
    const user = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      include: { accessibleSites: true },
    });
    const allowedSites = [
      user?.siteLink,
      user?.facebookPageId,
      user?.instagramUserId,
      ...(user?.accessibleSites || []).map((s) => s.siteLink),
    ].filter(Boolean);

    if (allowedSites.length > 0) {
      const allowedFilter = blogSiteOrFromEquivalents(allowedSites) || {
        siteLink: { in: allowedSites },
      };
      whereClause = {
        AND: [
          {
            OR: [{ assigneeId: sessionUser.id }, { createdById: sessionUser.id }],
          },
          allowedFilter,
        ],
      };
    } else {
      whereClause = {
        OR: [{ assigneeId: sessionUser.id }, { createdById: sessionUser.id }],
      };
    }
  }

  if (siteParam) {
    const equivalents = await resolveSiteEquivalents(prisma, siteParam);
    if (role === "smm" && !(await sessionCanAccessSiteAsync(prisma, sessionUser, equivalents))) {
      const err = new Error("Access denied for selected site.");
      err.status = 403;
      throw err;
    }
    const blogSiteFilter = blogSiteOrFromEquivalents([siteParam, ...equivalents]);
    if (blogSiteFilter) {
      whereClause = Object.keys(whereClause).length ? { AND: [whereClause, blogSiteFilter] } : blogSiteFilter;
    }
  }

  return whereClause;
}

export const BLOG_INCLUDE = {
  assignee: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true, email: true } },
};
