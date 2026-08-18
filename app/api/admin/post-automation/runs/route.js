import { requireAdminRoute } from "../../../../../lib/adminAuth";

import prisma from "@/lib/prisma";
import { POST_AGENT_TITLES, toStageSummary } from "@/lib/studioRunSummary";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    await requireAdminRoute(req, "post-automation");
    const url = new URL(req.url);
    const siteLink = String(url.searchParams.get("siteLink") || "").trim();
    const take = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));
    const runs = await prisma.postAutomationRun.findMany({
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
        approvalId: true,
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
        stageSummary: toStageSummary(stagesJson, POST_AGENT_TITLES),
      })),
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to list runs." },
      { status: error.status || 500 }
    );
  }
}
