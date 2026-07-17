import prisma from "../../../../lib/prisma";
import { verifyBlogQuickActionToken } from "../../../../lib/blogAssignee.js";
import { BLOG_INCLUDE } from "../../../../lib/blogAccess.js";

export const runtime = "nodejs";

export async function GET(req) {
  const id = req.nextUrl.searchParams.get("id");
  const token = req.nextUrl.searchParams.get("token");
  const action = String(req.nextUrl.searchParams.get("action") || "approve").toLowerCase();
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

  if (!id || !token || !verifyBlogQuickActionToken(id, token)) {
    return Response.redirect(`${baseUrl}/login?error=invalid_token`);
  }

  const blog = await prisma.blogPost.findUnique({ where: { id } });
  if (!blog || !["pending", "edited"].includes(blog.status)) {
    return Response.redirect(`${baseUrl}/login?blog=closed`);
  }

  const now = new Date();
  if (action === "approve") {
    await prisma.blogPost.update({
      where: { id },
      data: { status: "approved", lastAction: "approve", respondedAt: now, awaitingAdminReview: true },
    });
  } else if (action === "decline") {
    await prisma.blogPost.update({
      where: { id },
      data: { status: "declined", lastAction: "decline", respondedAt: now, awaitingAdminReview: true },
    });
  }

  return Response.redirect(`${baseUrl}/?section=my-blog-approvals`);
}
