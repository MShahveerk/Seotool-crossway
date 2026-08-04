import { requireAdminRoute } from "../../../../../../lib/adminAuth";
import { markWriterSendCompleted } from "@/lib/seoAutopilot/writerSends.js";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

export async function PATCH(req, { params }) {
  try {
    await requireAdminRoute(req, "blog-automation");
    const { id: rawId } = await params;
    const id = String(rawId || "").trim();
    const body = await req.json().catch(() => ({}));
    const status = String(body.status || "").toLowerCase();

    if (status === "completed") {
      const send = await markWriterSendCompleted(id);
      return Response.json({ send });
    }
    if (status === "ready") {
      const send = await prisma.seoAutopilotWriterSend.update({
        where: { id },
        data: { status: "ready", completedAt: null, errorMessage: null },
      });
      return Response.json({ send });
    }
    return Response.json({ error: "Unsupported status. Use completed or ready." }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to update writer send." },
      { status: error.status || 500 }
    );
  }
}
