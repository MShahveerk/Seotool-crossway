import { requirePermission } from "../../../../../../../../lib/middleware/auth";
import prisma from "../../../../../../../../lib/prisma";
import { PERMISSIONS } from "../../../../../../../../lib/rbac";
import { BLOG_INCLUDE } from "../../../../../../../../lib/blogAccess.js";
import { recordBlogRevision, restoreBlogRevision } from "../../../../../../../../lib/blogRevisions.js";

export const runtime = "nodejs";

export async function POST(_req, { params }) {
  try {
    const session = await requirePermission(PERMISSIONS.VIEW_ALL_DATA);
    const { id, revisionId } = await params;
    const blog = await prisma.blogPost.findUnique({ where: { id } });
    if (!blog) return Response.json({ error: "Blog not found." }, { status: 404 });

    await restoreBlogRevision(id, revisionId);
    const updated = await prisma.blogPost.findUnique({ where: { id }, include: BLOG_INCLUDE });
    await recordBlogRevision(updated, { action: "restore", actorId: session.user.id });

    return Response.json({ blog: updated });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to restore revision." }, { status: error.status || 500 });
  }
}
