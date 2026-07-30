import { requireAdminRoute } from "../../../../../../lib/adminAuth";

import { cancelActiveStudioRunsForSite, cancelStudioRun } from "@/lib/postsStudio/runner.js";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    await requireAdminRoute(req, "post-automation");
    const siteLink = String(new URL(req.url).searchParams.get("siteLink") || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });
    const body = await req.json().catch(() => ({}));
    if (body.runId) {
      const existing = await prisma.postAutomationRun.findUnique({
        where: { id: String(body.runId) },
      });
      if (!existing) return Response.json({ error: "Run not found." }, { status: 404 });
      if (existing.siteLink !== siteLink) {
        return Response.json({ error: "Run does not belong to this site." }, { status: 403 });
      }
      const run = await cancelStudioRun(existing.id, { hard: true });
      return Response.json({ count: 1, runs: [run], run });
    }
    const result = await cancelActiveStudioRunsForSite(siteLink);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to cancel automation." },
      { status: error.status || 500 }
    );
  }
}
