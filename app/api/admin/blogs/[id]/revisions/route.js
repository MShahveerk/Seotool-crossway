import { requireAdminRoute } from "../../../../../../lib/adminAuth";

import { listBlogRevisions } from "../../../../../../lib/blogRevisions.js";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  try {
    await requireAdminRoute(req);
    const { id } = await params;
    const revisions = await listBlogRevisions(id);
    return Response.json({ revisions });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to load revisions." }, { status: error.status || 500 });
  }
}
