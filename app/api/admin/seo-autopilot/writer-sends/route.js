import { requireAdminRoute } from "../../../../../lib/adminAuth";
import { listWriterSends } from "@/lib/seoAutopilot/writerSends.js";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    await requireAdminRoute(req, "seo-autopilot");
    const url = new URL(req.url);
    const siteLink = String(url.searchParams.get("siteLink") || "").trim();
    if (!siteLink) return Response.json({ error: "siteLink is required." }, { status: 400 });
    const sends = await listWriterSends(siteLink, { source: "autopilot" });
    return Response.json({ sends });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to load blog seeds." },
      { status: error.status || 500 }
    );
  }
}
