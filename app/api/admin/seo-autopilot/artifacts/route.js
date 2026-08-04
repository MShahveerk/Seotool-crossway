import { requireAdminRoute } from "../../../../../lib/adminAuth";
import prisma from "../../../../../lib/prisma";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    await requireAdminRoute(req, "seo-autopilot");
    const url = new URL(req.url);
    const siteLink = String(url.searchParams.get("siteLink") || "").trim();
    const kind = String(url.searchParams.get("kind") || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });
    const artifacts = await prisma.seoAutopilotArtifact.findMany({
      where: {
        siteLink,
        ...(kind ? { kind } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 80,
    });
    return Response.json({ artifacts });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to load artifacts." },
      { status: error.status || 500 }
    );
  }
}
