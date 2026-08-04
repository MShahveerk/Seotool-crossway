import { requireAdminRoute } from "../../../../../../lib/adminAuth";
import { enqueueAutopilotRun } from "@/lib/seoAutopilot/runner.js";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const session = await requireAdminRoute(req, "seo-autopilot");
    const url = new URL(req.url);
    const siteLink = String(url.searchParams.get("siteLink") || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const agentIds = Array.isArray(body.agentIds) ? body.agentIds : null;
    const run = await enqueueAutopilotRun({
      siteLink,
      trigger: "manual",
      triggeredById: session.user.id,
      agentIds,
    });

    return Response.json({ run }, { status: 202 });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to start Autopilot run." },
      { status: error.status || 500 }
    );
  }
}
