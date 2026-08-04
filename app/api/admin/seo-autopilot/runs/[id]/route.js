import { requireAdminRoute } from "../../../../../../lib/adminAuth";
import prisma from "../../../../../../lib/prisma";

export const runtime = "nodejs";

export async function GET(req, { params }) {
  try {
    await requireAdminRoute(req, "seo-autopilot");
    const { id: rawId } = await params;
    const id = String(rawId || "").trim();
    const run = await prisma.seoAutopilotRun.findUnique({ where: { id } });
    if (!run) return Response.json({ error: "Run not found." }, { status: 404 });
    return Response.json({ run });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to load run." },
      { status: error.status || 500 }
    );
  }
}
