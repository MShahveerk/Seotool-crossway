import { requirePermission } from "@/lib/middleware/auth";
import { PERMISSIONS } from "@/lib/rbac";
import { cancelStudioRun } from "@/lib/postsStudio/runner.js";

export const runtime = "nodejs";

export async function POST(_req, { params }) {
  try {
    await requirePermission(PERMISSIONS.VIEW_ALL_DATA);
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
