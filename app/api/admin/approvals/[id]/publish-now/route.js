import { requireAdminRoute } from "../../../../../../lib/adminAuth";

import { publishApprovalNow } from "@/lib/postPublishJobs.js";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  try {
    await requireAdminRoute(req, "admin-approvals");
    const { id } = await params;
    const result = await publishApprovalNow(id);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message || "Publish failed." }, { status: error.status || 500 });
  }
}
