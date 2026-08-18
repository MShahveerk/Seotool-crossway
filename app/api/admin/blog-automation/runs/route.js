import { requireAdminRoute } from "../../../../../lib/adminAuth";

import prisma from "@/lib/prisma";

export const runtime = "nodejs";

const AGENT_TITLES = {
  interpreter: "Interpreter",
  agent1: "Strategist",
  agent2: "Architect",
  agent3: "Writer",
  image: "Image",
};

/**
 * Collapse a run's stages into the few numbers the library list needs.
 *
 * `stagesJson` carries every agent's full output, which is far too heavy to ship
 * for a list that polls while a run is live — so it is read, reduced here, and
 * dropped before the response.
 */
function toStageSummary(stagesJson) {
  const stages = Array.isArray(stagesJson)
    ? stagesJson.filter((s) => s && typeof s === "object" && s.agent !== "_context")
    : [];
  if (!stages.length) return null;

  let done = 0;
  let failed = 0;
  let current = null;

  for (const stage of stages) {
    const status = String(stage.status || "").toLowerCase();
    if (["succeeded", "success", "completed", "complete", "done", "ok"].includes(status)) done += 1;
    else if (["failed", "error", "errored"].includes(status)) failed += 1;
    else if (!current && ["running", "in_progress", "active", "working"].includes(status)) current = stage;
  }

  return {
    done,
    failed,
    current: current
      ? AGENT_TITLES[current.agent] || current.role || current.title || String(current.agent || "")
      : null,
    // The Interpreter only runs for document / Excel sources, so the expected
    // pipeline length depends on whether this run used one.
    hasInterpreter: stages.some((s) => s.agent === "interpreter"),
  };
}

export async function GET(req) {
  try {
    await requireAdminRoute(req, "blog-automation");
    const url = new URL(req.url);
    const siteLink = String(url.searchParams.get("siteLink") || "").trim();
    const take = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));

    const runs = await prisma.blogAutomationRun.findMany({
      where: siteLink ? { siteLink } : undefined,
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        siteLink: true,
        trigger: true,
        status: true,
        topic: true,
        totalCostUsd: true,
        blogPostId: true,
        errorMessage: true,
        startedAt: true,
        finishedAt: true,
        createdAt: true,
        draftPreviewJson: true,
        stagesJson: true,
      },
    });

    return Response.json({
      runs: runs.map(({ stagesJson, ...run }) => ({
        ...run,
        stageSummary: toStageSummary(stagesJson),
      })),
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to list runs." },
      { status: error.status || 500 }
    );
  }
}
