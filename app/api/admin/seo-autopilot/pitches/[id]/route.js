import { requireAdminRoute } from "../../../../../../lib/adminAuth";
import prisma from "../../../../../../lib/prisma";

export const runtime = "nodejs";

export async function PATCH(req, { params }) {
  try {
    await requireAdminRoute(req, "seo-autopilot");
    const { id: rawId } = await params;
    const id = String(rawId || "").trim();
    const body = await req.json().catch(() => ({}));
    const existing = await prisma.seoAutopilotPitch.findUnique({ where: { id } });
    if (!existing) {
      return Response.json({ error: "Pitch not found." }, { status: 404 });
    }

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
      if (body[key] !== undefined) {
        data[key] = body[key] == null ? null : String(body[key]);
      }
    }
    if (body.domainAuthority !== undefined) {
      const n = Number(body.domainAuthority);
      data.domainAuthority = Number.isFinite(n) ? Math.round(n) : null;
    }
    if (body.doFollow !== undefined) {
      data.doFollow = body.doFollow === null ? null : Boolean(body.doFollow);
    }
    if (body.why !== undefined || (body.metaJson && typeof body.metaJson === "object")) {
      const prev =
        existing.metaJson && typeof existing.metaJson === "object" ? existing.metaJson : {};
      const next = {
        ...prev,
        ...(body.metaJson && typeof body.metaJson === "object" ? body.metaJson : {}),
      };
      if (body.why !== undefined) next.why = String(body.why || "");
      data.metaJson = next;
    }
    if (data.bodyText !== undefined && body.bodyHtml === undefined) {
      data.bodyHtml = data.bodyText
        ? `<p>${String(data.bodyText).replace(/\n/g, "<br/>")}</p>`
        : null;
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
