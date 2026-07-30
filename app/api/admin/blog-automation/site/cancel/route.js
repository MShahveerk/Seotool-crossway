import { requireAdminRoute } from "../../../../../../lib/adminAuth";

import { cancelActiveStudioRunsForSite, cancelStudioRun } from "@/lib/blogStudio/runner.js";

export const runtime = "nodejs";

/**
 * Cancel active Studio automations for a site.
 * Body optional: { runId } to cancel one run; otherwise cancels all queued/running for the site.
 */
export async function POST(req) {
  try {
    await requireAdminRoute(req);
    const url = new URL(req.url);
    const siteLink = String(url.searchParams.get("siteLink") || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    if (body.runId) {
      const { default: prisma } = await import("@/lib/prisma");
      const existing = await prisma.blogAutomationRun.findUnique({
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
