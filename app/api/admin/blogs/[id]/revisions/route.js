import { requirePermission } from "../../../../../../lib/middleware/auth";
import { PERMISSIONS } from "../../../../../../lib/rbac";
import { listBlogRevisions } from "../../../../../../lib/blogRevisions.js";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  try {
    await requirePermission(PERMISSIONS.VIEW_ALL_DATA);
    const { id } = await params;
    const revisions = await listBlogRevisions(id);
    return Response.json({ revisions });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to load revisions." }, { status: error.status || 500 });
  }
}
