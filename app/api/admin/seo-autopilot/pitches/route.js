import { requireAdminRoute } from "../../../../../lib/adminAuth";
import prisma from "../../../../../lib/prisma";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    await requireAdminRoute(req, "seo-autopilot");
    const url = new URL(req.url);
    const siteLink = String(url.searchParams.get("siteLink") || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });
    const pitches = await prisma.seoAutopilotPitch.findMany({
      where: { siteLink },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return Response.json({ pitches });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to load pitches." },
      { status: error.status || 500 }
    );
  }
}
