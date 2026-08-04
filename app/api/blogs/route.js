import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import prisma from "../../../lib/prisma";
import { ROLES } from "../../../lib/rbac";
import { canAccessSection } from "../../../lib/modulePermissions";
import { buildBlogSiteFilter, BLOG_INCLUDE } from "../../../lib/blogAccess.js";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!canAccessSection(session.user, "my-blog-approvals")) {
      return Response.json({ error: "Forbidden: Blog Approvals access not granted." }, { status: 403 });
    }

    const siteParam = req.nextUrl.searchParams.get("site") || req.nextUrl.searchParams.get("url") || "";
    const whereClause = await buildBlogSiteFilter(prisma, siteParam, session.user, session.user.role);

    const statusParam = String(req.nextUrl.searchParams.get("status") || "open").trim().toLowerCase();
    const ALLOWED = new Set(["pending", "edited", "declined", "approved"]);
    let statusFilter;
    if (statusParam === "all") {
      statusFilter = { status: { in: ["pending", "edited", "declined", "approved"] } };
    } else if (ALLOWED.has(statusParam)) {
      statusFilter = { status: statusParam };
    } else {
      // Default "open" queue
      statusFilter = { status: { in: ["pending", "edited", "declined"] } };
    }

    const blogs = await prisma.blogPost.findMany({
      where: {
        ...whereClause,
        hiddenFromAssignee: false,
        ...statusFilter,
        ...(session.user.role === ROLES.APPROVER ? { assigneeId: session.user.id } : {}),
      },
      include: BLOG_INCLUDE,
      orderBy: [{ scheduledFor: "asc" }, { createdAt: "desc" }],
      take: 200,
    });

    return Response.json({ blogs });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to load blogs." }, { status: error.status || 500 });
  }
}
