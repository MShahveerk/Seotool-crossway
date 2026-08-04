import { requireAdminRoute } from "../../../../../../lib/adminAuth";
import prisma from "../../../../../../lib/prisma";

export const runtime = "nodejs";

export async function PATCH(req, { params }) {
  try {
    await requireAdminRoute(req, "seo-autopilot");
    const { id: rawId } = await params;
    const id = String(rawId || "").trim();
    const body = await req.json().catch(() => ({}));
    const data = {};
    if (body.status !== undefined) {
      const status = String(body.status || "").toLowerCase();
      if (!["draft", "ready", "sent", "completed", "failed"].includes(status)) {
        return Response.json({ error: "Invalid status." }, { status: 400 });
      }
      data.status = status;
      if (status === "completed") data.completedAt = new Date();
    }
    for (const key of ["subject", "bodyText", "bodyHtml", "targetEmail", "targetName", "targetUrl", "title"]) {
      if (body[key] !== undefined) data[key] = body[key];
    }
    const pitch = await prisma.seoAutopilotPitch.update({ where: { id }, data });
    return Response.json({ pitch });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to update pitch." },
      { status: error.status || 500 }
    );
  }
}
