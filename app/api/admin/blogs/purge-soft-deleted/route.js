import { requireAdminRoute } from "../../../../../lib/adminAuth";
import prisma from "../../../../../lib/prisma";

import { resolveSiteEquivalents } from "../../../../../lib/siteAccess.js";

export const runtime = "nodejs";

/** Hard-delete all tombstone rows (status=deleted) for a site. */
export async function POST(req) {
  try {
    await requireAdminRoute(req, "admin-blogs");
    const body = await req.json();
    const siteLink = String(body.siteLink || body.url || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });

    const siteKeys = await resolveSiteEquivalents(prisma, siteLink);
    const sites = [...new Set([siteLink, ...siteKeys].filter(Boolean))];

    const result = await prisma.blogPost.deleteMany({
      where: { siteLink: { in: sites }, status: "deleted" },
    });

    return Response.json({ ok: true, purged: result.count });
  } catch (error) {
    return Response.json({ error: error.message || "Purge failed." }, { status: error.status || 500 });
  }
}
