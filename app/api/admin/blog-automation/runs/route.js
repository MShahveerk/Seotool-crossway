import { requireAdminRoute } from "../../../../../lib/adminAuth";

import prisma from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    await requireAdminRoute(req);
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
      },
    });

    return Response.json({ runs });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to list runs." },
      { status: error.status || 500 }
    );
  }
}
