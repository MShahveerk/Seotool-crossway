import { requireAdminRoute } from "../../../../../../../lib/adminAuth";
import { cancelAutopilotRun } from "@/lib/seoAutopilot/runner.js";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  try {
    await requireAdminRoute(req, "seo-autopilot");
    const { id: rawId } = await params;
    const id = String(rawId || "").trim();
    const run = await cancelAutopilotRun(id);
    return Response.json({ run });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to cancel run." },
      { status: error.status || 500 }
    );
  }
}
