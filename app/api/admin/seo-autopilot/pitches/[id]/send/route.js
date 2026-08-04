import { requireAdminRoute } from "../../../../../../../lib/adminAuth";
import { sendAutopilotPitch } from "@/lib/seoAutopilot/sendPitch.js";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  try {
    await requireAdminRoute(req, "seo-autopilot");
    const { id: rawId } = await params;
    const id = String(rawId || "").trim();
    const url = new URL(req.url);
    const siteLink = String(url.searchParams.get("siteLink") || "").trim() || undefined;
    const pitch = await sendAutopilotPitch(id, { siteLink });
    return Response.json({ pitch });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to send pitch." },
      { status: error.status || 500 }
    );
  }
}
