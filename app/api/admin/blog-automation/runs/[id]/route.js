import { requireAdminRoute } from "../../../../../../lib/adminAuth";

import prisma from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  try {
    await requireAdminRoute(req);
    const { id } = await params;
    const run = await prisma.blogAutomationRun.findUnique({ where: { id } });
    if (!run) return Response.json({ error: "Run not found." }, { status: 404 });
    return Response.json({ run });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to load run." },
      { status: error.status || 500 }
    );
  }
}
