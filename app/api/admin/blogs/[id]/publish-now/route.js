import { requireAdminRoute } from "../../../../../../lib/adminAuth";

import { publishBlogNow } from "../../../../../../lib/blogPublishJobs.js";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  try {
    await requireAdminRoute(req, "admin-blogs");
    const { id } = await params;
    const result = await publishBlogNow(id);
    return Response.json({ ok: result.success, ...result });
  } catch (error) {
    return Response.json({ error: error.message || "Publish failed." }, { status: error.status || 500 });
  }
}
