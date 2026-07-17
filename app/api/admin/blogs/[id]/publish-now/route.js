import { requirePermission } from "../../../../../../lib/middleware/auth";
import { PERMISSIONS } from "../../../../../../lib/rbac";
import { publishBlogNow } from "../../../../../../lib/blogPublishJobs.js";

export const runtime = "nodejs";

export async function POST(_req, { params }) {
  try {
    await requirePermission(PERMISSIONS.VIEW_ALL_DATA);
    const { id } = await params;
    const result = await publishBlogNow(id);
    return Response.json({ ok: result.success, ...result });
  } catch (error) {
    return Response.json({ error: error.message || "Publish failed." }, { status: error.status || 500 });
  }
}
