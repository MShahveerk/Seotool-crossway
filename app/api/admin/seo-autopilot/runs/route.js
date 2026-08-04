import { requireAdminRoute } from "../../../../../lib/adminAuth";
import prisma from "../../../../../lib/prisma";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    await requireAdminRoute(req, "seo-autopilot");
    const url = new URL(req.url);
    const siteLink = String(url.searchParams.get("siteLink") || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });
    const runs = await prisma.seoAutopilotRun.findMany({
      where: { siteLink },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return Response.json({ runs });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to list runs." },
      { status: error.status || 500 }
    );
  }
}
