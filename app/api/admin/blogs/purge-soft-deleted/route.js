import { requireAdminRoute } from "../../../../../lib/adminAuth";
import prisma from "../../../../../lib/prisma";

import { buildBlogAdminSiteWhere } from "../../../../../lib/blogAccess.js";

export const runtime = "nodejs";

/** Hard-delete all tombstone rows (status=deleted) for a site. */
export async function POST(req) {
  try {
    await requireAdminRoute(req, "admin-blogs");
    const body = await req.json();
    const siteLink = String(body.siteLink || body.url || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });

    const siteWhere = await buildBlogAdminSiteWhere(prisma, siteLink);

    const result = await prisma.blogPost.deleteMany({
      where: { AND: [siteWhere, { status: "deleted" }] },
    });

    return Response.json({ ok: true, purged: result.count });
  } catch (error) {
    return Response.json({ error: error.message || "Purge failed." }, { status: error.status || 500 });
  }
}
