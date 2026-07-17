import { buildApprovalSiteOrFilter, resolveSiteEquivalents, sessionCanAccessSiteAsync } from "./siteAccess.js";

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
      whereClause = {
        AND: [
          {
            OR: [{ assigneeId: sessionUser.id }, { createdById: sessionUser.id }],
          },
          {
            OR: [{ siteLink: { in: allowedSites } }],
          },
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
    const siteFilter = buildApprovalSiteOrFilter(equivalents);
    if (siteFilter) {
      const blogSiteFilter = {
        OR: siteFilter.OR.map((clause) => {
          if (clause.siteLink) return { siteLink: clause.siteLink };
          if (clause.facebookPageId) return { siteLink: clause.facebookPageId };
          if (clause.instagramUserId) return { siteLink: clause.instagramUserId };
          return clause;
        }),
      };
      whereClause = Object.keys(whereClause).length ? { AND: [whereClause, blogSiteFilter] } : blogSiteFilter;
    }
  }

  return whereClause;
}

export const BLOG_INCLUDE = {
  assignee: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true, email: true } },
};
