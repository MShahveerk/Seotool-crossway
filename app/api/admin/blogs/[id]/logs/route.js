import { requireAdminRoute } from "../../../../../../lib/adminAuth";
import prisma from "../../../../../../lib/prisma";


export const runtime = "nodejs";

export async function GET(req, { params }) {
  try {
    await requireAdminRoute(req, "admin-blogs");
    const { id } = await params;
    const blog = await prisma.blogPost.findUnique({ where: { id }, select: { id: true, title: true } });
    if (!blog) return Response.json({ error: "Blog not found." }, { status: 404 });

    const logs = await prisma.blogPublishLog.findMany({
      where: { blogPostId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return Response.json({ blog, logs });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to load logs." }, { status: error.status || 500 });
  }
}
