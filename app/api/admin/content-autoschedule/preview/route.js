import { requireAutoscheduleRoute } from "../../../../../lib/adminAuth";

import { normalizeKind } from "@/lib/contentAutoschedule/engine.js";
import { getAutoschedulePreview } from "@/lib/contentAutoschedule/runner.js";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    await requireAutoscheduleRoute(req);
    const url = new URL(req.url);
    const kind = normalizeKind(url.searchParams.get("kind"));
    const siteLink = String(url.searchParams.get("siteLink") || "").trim();
    if (!kind || !siteLink) {
      return Response.json({ error: "kind and siteLink are required." }, { status: 400 });
    }
    const preview = await getAutoschedulePreview(kind, siteLink);
    return Response.json({ preview });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to preview autoschedule." },
      { status: error.status || 500 }
    );
  }
}
