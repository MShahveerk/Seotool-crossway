import { requireAutoscheduleRoute } from "../../../../../lib/adminAuth";

import { normalizeKind } from "@/lib/contentAutoschedule/engine.js";
import { runAutoscheduleForSite } from "@/lib/contentAutoschedule/runner.js";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    await requireAutoscheduleRoute(req);
    const url = new URL(req.url);
    const kind = normalizeKind(url.searchParams.get("kind"));
    const siteLink = String(url.searchParams.get("siteLink") || "").trim();
    const dryRun =
      url.searchParams.get("dryRun") === "1" ||
      url.searchParams.get("dryRun") === "true";
    if (!kind || !siteLink) {
      return Response.json({ error: "kind and siteLink are required." }, { status: 400 });
    }
    // Manual run always allowed (force), even when toggle is off — useful to test.
    const result = await runAutoscheduleForSite({
      kind,
      siteLink,
      dryRun,
      force: true,
    });
    return Response.json({ result });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to run autoschedule." },
      { status: error.status || 500 }
    );
  }
}
