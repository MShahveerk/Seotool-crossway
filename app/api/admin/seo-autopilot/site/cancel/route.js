import { requireAdminRoute } from "../../../../../../lib/adminAuth";
import {
  cancelActiveAutopilotRunsForSite,
  cancelAutopilotRun,
} from "@/lib/seoAutopilot/runner.js";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Cancel active Autopilot runs for a site.
 * Body optional: { runId } to cancel one run; otherwise cancels all queued/running for the site.
 */
export async function POST(req) {
  try {
    await requireAdminRoute(req, "seo-autopilot");
    const url = new URL(req.url);
    const siteLink = String(url.searchParams.get("siteLink") || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    if (body.runId) {
      const existing = await prisma.seoAutopilotRun.findUnique({
        where: { id: String(body.runId) },
      });
      if (!existing) return Response.json({ error: "Run not found." }, { status: 404 });
      if (existing.siteLink !== siteLink) {
        return Response.json({ error: "Run does not belong to this site." }, { status: 403 });
      }
      const run = await cancelAutopilotRun(existing.id, { hard: true });
      return Response.json({ count: 1, runs: [run], run });
    }

    const result = await cancelActiveAutopilotRunsForSite(siteLink);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to cancel Autopilot run(s)." },
      { status: error.status || 500 }
    );
  }
}
