import { requireAdminRoute } from "../../../../../../../lib/adminAuth";

import { cancelStudioRun } from "@/lib/postsStudio/runner.js";

export const runtime = "nodejs";

export async function (req, { params }) {
  try {
    await requireAdminRoute(req, "post-automation");
    const { id } = await params;
    const run = await cancelStudioRun(id, { hard: true });
    return Response.json({ run });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to cancel run." },
      { status: error.status || 500 }
    );
  }
}
