import { requireAdminRoute } from "../../../../../lib/adminAuth";
import { listWriterSends } from "@/lib/seoAutopilot/writerSends.js";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    await requireAdminRoute(req, "blog-automation");
    const url = new URL(req.url);
    const siteLink = String(url.searchParams.get("siteLink") || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });
    // Default to Autopilot seeds; the Competitor seeds tab passes source=competitor.
    const source = url.searchParams.get("source") === "competitor" ? "competitor" : "autopilot";
    const sends = await listWriterSends(siteLink, { source });
    return Response.json({ sends });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to load writer sends." },
      { status: error.status || 500 }
    );
  }
}
