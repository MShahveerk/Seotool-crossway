import { requireAdminRoute } from "../../../../../../../lib/adminAuth";

import { cancelStudioRun } from "@/lib/blogStudio/runner.js";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  try {
    await requireAdminRoute(req, "blog-automation");
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