import { requireAdminRoute } from "../../../../../../../lib/adminAuth";
import prisma from "../../../../../../../lib/prisma";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  try {
    await requireAdminRoute(req, "seo-autopilot");
    const { id: rawId } = await params;
    const id = String(rawId || "").trim();
    const run = await prisma.seoAutopilotRun.update({
      where: { id },
      data: { cancelRequested: true },
    });
    return Response.json({ run });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to cancel run." },
      { status: error.status || 500 }
    );
  }
}
