import { requireAdminRoute } from "../../../../../lib/adminAuth";
import prisma from "../../../../../lib/prisma";

export const runtime = "nodejs";

/** List payload: keep stage status/preview, drop heavy data/rawText (loaded via /runs/[id]). */
function summarizeRun(run) {
  if (!run) return run;
  const stages = Array.isArray(run.stagesJson)
    ? run.stagesJson.map((s) => ({
        agentId: s?.agentId,
        title: s?.title,
        subtitle: s?.subtitle,
        provider: s?.provider,
        model: s?.model,
        status: s?.status,
        ok: s?.ok,
        costUsd: s?.costUsd,
        error: s?.error,
        preview: s?.preview,
        startedAt: s?.startedAt,
        finishedAt: s?.finishedAt,
      }))
    : run.stagesJson;
  return { ...run, stagesJson: stages };
}

export async function GET(req) {
  try {
    await requireAdminRoute(req, "seo-autopilot");
    const url = new URL(req.url);
    const siteLink = String(url.searchParams.get("siteLink") || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });
    const takeRaw = Number(url.searchParams.get("limit") || 100);
    const take = Math.min(200, Math.max(1, Number.isFinite(takeRaw) ? takeRaw : 100));
    const runs = await prisma.seoAutopilotRun.findMany({
      where: { siteLink },
      orderBy: { createdAt: "desc" },
      take,
    });
    return Response.json({ runs: runs.map(summarizeRun), total: runs.length });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to list runs." },
      { status: error.status || 500 }
    );
  }
}
